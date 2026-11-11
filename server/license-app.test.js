import assert from "node:assert/strict";
import test from "node:test";
import { createAccount, createMemoryStore } from "../server/accounts.js";
import { createLicenseApp, EXPECTED_PRODUCT, paddleConfigFromEnv, paddleReady } from "../server/license-app.js";
import { signBody } from "../server/signature.js";
import { entitlementFromServer, mayExport, readEntitlement, readPurchaseStatus } from "../extension/src/entitlement.js";
import { SALE } from "../extension/src/sale.js";

const secret = "test-only-webhook-secret";
const now = 1_700_000_000_000;

function app(store = createMemoryStore()) {
  return { store, api: createLicenseApp(store, { secret, now: () => now }) };
}

function payload(accountId, overrides = {}) {
  return {
    event_id: overrides.eventId || "evt_1",
    event_type: overrides.eventType || "transaction.completed",
    data: {
      id: overrides.transactionId || "txn_1",
      status: overrides.status || "completed",
      custom_data: { accountId },
      customer: { email: overrides.email || "" },
      items: [{
        quantity: overrides.quantity ?? 1,
        price: { id: EXPECTED_PRODUCT.priceId, product_id: EXPECTED_PRODUCT.productId }
      }],
      details: { totals: { grand_total: String(overrides.amount ?? 4900), currency_code: overrides.currency || "KRW" } },
      ...(overrides.data || {})
    }
  };
}

function post(api, body, signedAt = now) {
  const rawBody = JSON.stringify(body);
  return api.webhook({ rawBody, header: signBody(rawBody, secret, signedAt) });
}

test("test payment grants one entitlement and ignores failure, tampering, duplicates, and email claims", async () => {
  const { store, api } = app();
  const buyer = api.createSession();
  const other = api.createSession();
  const completed = payload(buyer.accountId, { email: "other@example.com" });
  const granted = post(api, completed);
  assert.equal(granted.granted, true);
  const again = post(api, completed);
  assert.equal(again.duplicate, true);
  assert.equal(store.purchases.size, 1);

  const raw = JSON.stringify(payload(buyer.accountId, { eventId: "evt_tamper" }));
  const tampered = api.webhook({ rawBody: `${raw} `, header: signBody(raw, secret, now) });
  assert.equal(tampered.status, 401);
  assert.equal(store.purchases.size, 1);

  assert.equal(post(api, payload(buyer.accountId, { eventId: "evt_low", amount: 4901 })).granted, false);
  assert.equal(post(api, payload(buyer.accountId, { eventId: "evt_usd", currency: "USD" })).granted, false);
  assert.equal(post(api, payload(buyer.accountId, { eventId: "evt_fail", eventType: "transaction.payment_failed", status: "ready" })).granted, false);
  assert.equal(post(api, payload(buyer.accountId, { eventId: "evt_cancel", status: "canceled" })).granted, false);
  assert.equal(post(api, payload(buyer.accountId, { eventId: "evt_qty", quantity: 2 })).granted, false);
  assert.equal(post(api, payload(buyer.accountId, { eventId: "evt_sub", data: { billing_period: { interval: "month" } } })).granted, false);
  assert.equal(store.purchases.size, 1);

  assert.equal(api.clientSuccess().granted, false);
  assert.equal(api.statusByEmail().status, 401);
  assert.equal(api.status(`Bearer ${other.token}`).body.state, "not-purchased");
  const active = api.status(`Bearer ${buyer.token}`).body;
  assert.equal(active.entitled, true);
  assert.equal(active.amount, 4900);
  assert.equal(active.currency, "KRW");
  assert.equal(JSON.stringify(active).includes("other@example.com"), false);
  assert.equal(mayExport(entitlementFromServer(active)), true);
  assert.equal(mayExport({ entitled: true, state: "entitled", source: "local" }), false);
});

test("refund updates the buyer only, and a store outage does not revoke the purchase", async () => {
  const { store, api } = app();
  const buyer = api.createSession();
  post(api, payload(buyer.accountId));
  store.failReads = true;
  const down = api.status(`Bearer ${buyer.token}`);
  assert.equal(down.status, 503);
  assert.equal(down.body.state, "unavailable");
  assert.equal(store.purchases.get("txn_1").status, "active");
  store.failReads = false;
  assert.equal(api.status(`Bearer ${buyer.token}`).body.state, "entitled");

  const refund = post(api, {
    event_id: "evt_refund",
    event_type: "adjustment.updated",
    occurred_at: "2026-11-11T00:10:00.000Z",
    data: {
      id: "adj_1",
      action: "refund",
      type: "full",
      status: "approved",
      transaction_id: "txn_1",
      currency_code: "KRW",
      totals: { total: "4900", currency_code: "KRW" }
    }
  });
  assert.equal(refund.granted, false);
  assert.equal(api.status(`Bearer ${buyer.token}`).body.state, "refunded");
  post(api, {
    event_id: "evt_not_used",
    event_type: "transaction.refunded",
    data: { id: "txn_1", status: "refunded" }
  });
  assert.equal(store.purchases.size, 1);
  assert.equal(api.status(`Bearer ${buyer.token}`).body.entitled, false);
});

test("provider lookup can grant, and a failed lookup does not change an existing purchase", async () => {
  const { store, api } = app();
  const buyer = createAccount(store);
  const remote = payload(buyer.accountId).data;
  const granted = await api.confirmByLookup({
    transactionId: "txn_1",
    accountId: buyer.accountId,
    lookup: async () => remote
  });
  assert.equal(granted.granted, true);
  const failed = await api.confirmByLookup({
    transactionId: "txn_2",
    accountId: buyer.accountId,
    lookup: async () => {
      throw new Error("provider-down");
    }
  });
  assert.equal(failed.reason, "lookup-failed");
  assert.equal(store.purchases.get("txn_1").status, "active");
  const missing = await api.confirmByLookup({ transactionId: "txn_3", accountId: buyer.accountId });
  assert.equal(missing.reason, "no-provider-lookup");
});

test("a local pro flag and a closed sale never count as a purchase", async () => {
  const entitlement = await readEntitlement({
    storage: { async get() { return { pro: true, licenseSession: { pro: true, token: "a".repeat(64) } }; } },
    request() {
      throw new Error("should-not-call");
    }
  });
  assert.equal(entitlement.state, "sale-closed");
  assert.equal(mayExport(entitlement), false);
  const config = paddleConfigFromEnv({});
  assert.equal(paddleReady(config), false);
  assert.equal(config.providerApiOrigin, "https://api.paddle.com");
  const recorded = await readPurchaseStatus({
    storage: { async get() { return {}; } },
    sale: { ...SALE, open: false, fullExportVerified: false, statusBase: "https://license.example" },
    async request() {
      return { entitled: true, state: "entitled", source: "server", productId: "dot-copy-paste-export", amount: 4900, currency: "KRW" };
    }
  });
  assert.equal(recorded.state, "entitled");
  assert.equal(mayExport(entitlement), false);
});
