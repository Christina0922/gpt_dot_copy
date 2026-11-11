import { accountExists, accountFromToken } from "./accounts.js";

export function interpretNotification(notification, expected) {
  const eventType = text(notification?.event_type);
  const data = notification?.data && typeof notification.data === "object" ? notification.data : {};
  const eventId = text(notification?.event_id);
  const transactionId = eventType.startsWith("adjustment.") ? text(data.transaction_id) : text(data.id);
  const accountId = text(data?.custom_data?.accountId);
  const currency = text(data?.details?.totals?.currency_code);
  const amount = exactAmount(data?.details?.totals?.grand_total);
  const item = Array.isArray(data.items) && data.items.length === 1 ? data.items[0] : null;
  const productId = text(item?.price?.product_id || item?.product?.id);
  const priceId = text(item?.price?.id);
  const quantity = item?.quantity;
  const subscription = Boolean(data.subscription_id || data.billing_period);
  const status = text(data.status);
  const decision = { eventId, transactionId, accountId, amount, currency, productId, action: "ignore" };
  if (!eventId || !transactionId) return decision;

  if (eventType === "transaction.completed" && status === "completed" && !subscription) {
    const priceOk = Boolean(expected?.priceId) && priceId === expected.priceId;
    const productOk = productId === expected?.productId;
    const moneyOk = amount === expected?.amount && currency === expected?.currency;
    const accountOk = /^[a-f0-9]{32}$/.test(accountId);
    const quantityOk = quantity === 1;
    if (priceOk && productOk && moneyOk && accountOk && quantityOk) decision.action = "grant";
    return decision;
  }

  if (eventType === "transaction.refunded" || (eventType === "adjustment.updated" && data.action === "refund" && status === "approved")) {
    decision.action = "revoke";
  }
  return decision;
}

export function applyDecision(store, decision) {
  if (!decision?.eventId) return { granted: false, duplicate: false, changed: false };
  if (store.events.has(decision.eventId)) return { granted: false, duplicate: true, changed: false };
  store.events.add(decision.eventId);
  if (decision.action === "grant") {
    if (store.purchases.has(decision.transactionId) || !accountExists(store, decision.accountId)) {
      return { granted: false, duplicate: store.purchases.has(decision.transactionId), changed: false };
    }
    store.purchases.set(decision.transactionId, {
      accountId: decision.accountId,
      productId: decision.productId,
      amount: decision.amount,
      currency: decision.currency,
      status: "active"
    });
    store.byAccount.set(decision.accountId, decision.transactionId);
    return { granted: true, duplicate: false, changed: true };
  }
  if (decision.action === "revoke") {
    const record = store.purchases.get(decision.transactionId);
    if (!record || record.status === "refunded") return { granted: false, duplicate: false, changed: false };
    record.status = "refunded";
    return { granted: false, duplicate: false, changed: true };
  }
  return { granted: false, duplicate: false, changed: false };
}

export function statusForToken(store, token) {
  if (store.failReads) {
    const error = new Error("store-unavailable");
    error.code = "store-unavailable";
    throw error;
  }
  const account = accountFromToken(store, token);
  if (!account) return { entitled: false, state: "not-purchased", source: "server" };
  const record = store.purchases.get(store.byAccount.get(account.accountId));
  if (!record) return { entitled: false, state: "not-purchased", source: "server", productId: "dot-copy-paste-export" };
  if (record.status === "refunded") {
    return { entitled: false, state: "refunded", source: "server", productId: record.productId };
  }
  return {
    entitled: true,
    state: "entitled",
    source: "server",
    productId: record.productId,
    amount: record.amount,
    currency: record.currency
  };
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function exactAmount(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number(value);
  return null;
}
