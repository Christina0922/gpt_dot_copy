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
  const decision = {
    eventId,
    transactionId,
    accountId,
    amount,
    currency,
    productId,
    action: "ignore",
    occurredAt: occurredAt(notification)
  };
  if (!eventId || !transactionId) return decision;

  if ((eventType === "adjustment.created" || eventType === "adjustment.updated") && data.action === "refund") {
    return adjustmentDecision(decision, data, expected);
  }

  if (eventType === "transaction.completed" && status === "completed" && !subscription) {
    const priceOk = Boolean(expected?.priceId) && priceId === expected.priceId;
    const productOk = productId === expected?.productId;
    const moneyOk = amount === expected?.amount && currency === expected?.currency;
    const accountOk = /^[a-f0-9]{32}$/.test(accountId);
    const quantityOk = quantity === 1;
    if (priceOk && productOk && moneyOk && accountOk && quantityOk) {
      decision.action = "grant";
      if (typeof expected.catalogProductId === "string" && expected.catalogProductId) {
        decision.catalogProductId = expected.catalogProductId;
      }
    }
    return decision;
  }

  return decision;
}

export function applyDecision(store, decision) {
  if (!store.adjustments) store.adjustments = new Map();
  if (!decision?.eventId) return { granted: false, duplicate: false, changed: false };
  if (store.events.has(decision.eventId)) return { granted: false, duplicate: true, changed: false };
  store.events.add(decision.eventId);
  if (decision.action === "grant") {
    if (store.purchases.has(decision.transactionId) || !accountExists(store, decision.accountId)) {
      return { granted: false, duplicate: store.purchases.has(decision.transactionId), changed: false };
    }
    const effect = refundEffect(store, decision.transactionId, decision.amount);
    store.purchases.set(decision.transactionId, {
      accountId: decision.accountId,
      productId: decision.catalogProductId || decision.productId,
      amount: decision.amount,
      currency: decision.currency,
      environment: decision.environment === "live" ? "live" : "sandbox",
      status: effect.full ? "refunded" : "active",
      refundedAmount: effect.amount
    });
    store.byAccount.set(decision.accountId, decision.transactionId);
    return { granted: !effect.full, duplicate: false, changed: true };
  }
  if (decision.action === "adjustment") {
    const existing = store.adjustments.get(decision.adjustmentId);
    if (!shouldReplace(decision, existing)) return { granted: false, duplicate: false, changed: false };
    store.adjustments.set(decision.adjustmentId, {
      transactionId: decision.transactionId,
      status: decision.adjustmentStatus,
      amount: decision.amount || 0,
      kind: decision.refundKind,
      productOk: decision.productOk === true,
      occurredAt: decision.occurredAt
    });
    refreshPurchase(store, decision.transactionId);
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
  return purchaseStatus(record);
}

export function purchaseStatus(record) {
  const channel = record.environment === "live" ? "live" : "sandbox";
  if (record.status === "refunded") {
    return { entitled: false, state: "refunded", source: "server", productId: record.productId, refund: "full", channel };
  }
  const body = {
    source: "server",
    productId: record.productId,
    amount: record.amount,
    currency: record.currency,
    refund: record.refundedAmount > 0 ? "partial" : "none",
    refundedAmount: record.refundedAmount || 0,
    channel
  };
  if (channel !== "live") return { ...body, entitled: false, state: "sandbox" };
  return { ...body, entitled: true, state: "entitled" };
}

function adjustmentDecision(decision, data, expected) {
  const adjustmentId = text(data.id);
  const status = text(data.status);
  if (!adjustmentId || !["pending_approval", "approved", "rejected", "reversed"].includes(status)) return decision;
  const currency = text(data.currency_code || data?.totals?.currency_code);
  const refund = classifyRefund(data, expected, currency);
  decision.action = "adjustment";
  decision.adjustmentId = adjustmentId;
  decision.adjustmentStatus = status;
  decision.refundKind = refund.kind;
  decision.amount = refund.amount;
  decision.currency = currency;
  decision.productId = refund.productId;
  decision.productOk = refund.productOk;
  return decision;
}

function classifyRefund(data, expected, currency) {
  const items = Array.isArray(data.items) ? data.items : [];
  const productIds = items.map((item) => text(item?.price?.product_id || item?.product_id)).filter(Boolean);
  const accepted = [expected?.productId, expected?.catalogProductId].filter(Boolean);
  const productOk = productIds.length === 0 || productIds.every((id) => accepted.includes(id));
  const productId = productIds[0] || expected?.catalogProductId || expected?.productId || "";
  if (!productOk || (currency && currency !== expected?.currency)) {
    return { kind: "none", amount: 0, productOk: false, productId };
  }
  const total = exactAmount(data?.totals?.total);
  const itemAmounts = items.map((item) => exactAmount(item?.amount ?? item?.totals?.total)).filter((amount) => amount !== null);
  const amount = total ?? itemAmounts.reduce((sum, value) => sum + value, 0);
  const type = text(data.type) || "partial";
  const itemFull = items.length > 0 && items.every((item) => item?.type === "full");
  if (type === "full" || itemFull || (expected?.amount && amount >= expected.amount)) {
    return { kind: "full", amount: amount || expected?.amount || 0, productOk: true, productId };
  }
  if (amount > 0) return { kind: "partial", amount, productOk: true, productId };
  return { kind: "none", amount: 0, productOk: true, productId };
}

function refundEffect(store, transactionId, purchaseAmount) {
  let amount = 0;
  let full = false;
  for (const adjustment of store.adjustments.values()) {
    if (adjustment.transactionId !== transactionId || adjustment.productOk !== true || adjustment.status !== "approved") continue;
    amount += adjustment.amount || 0;
    if (adjustment.kind === "full") full = true;
  }
  if (purchaseAmount && amount >= purchaseAmount) full = true;
  return { amount, full };
}

function refreshPurchase(store, transactionId) {
  const purchase = store.purchases.get(transactionId);
  if (!purchase) return;
  const effect = refundEffect(store, transactionId, purchase.amount);
  purchase.refundedAmount = effect.amount;
  purchase.status = effect.full ? "refunded" : "active";
}

function shouldReplace(next, existing) {
  if (!existing) return true;
  if (next.occurredAt != null && existing.occurredAt != null) return next.occurredAt >= existing.occurredAt;
  if (next.occurredAt != null && existing.occurredAt == null) return true;
  if (next.occurredAt == null && existing.occurredAt != null) return false;
  if (existing.status === "approved" && next.adjustmentStatus !== "approved") return false;
  return true;
}

function occurredAt(notification) {
  const parsed = Date.parse(notification?.occurred_at || notification?.data?.updated_at || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function exactAmount(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number(value);
  return null;
}
