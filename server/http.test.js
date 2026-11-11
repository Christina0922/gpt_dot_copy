import assert from "node:assert/strict";
import test from "node:test";
import { createLicenseHandler } from "./http.js";
import { LOGIN_LINK_TTL_MS } from "./login.js";
import { createMemoryRuntime, runtimeFromEnv } from "./runtime.js";
import { signBody } from "./signature.js";

const secret = "test-only-webhook-secret";
const now = 1_700_000_000_000;
const env = {
  DCP_PADDLE_ENV: "sandbox",
  DCP_PADDLE_WEBHOOK_SECRET: secret,
  DCP_PADDLE_PRODUCT_ID: "dot-copy-paste-export",
  DCP_PADDLE_PRICE_ID: "pri_dcp_export_test",
  DCP_LICENSE_API_BASE: "https://license.example"
};

function handler(runtime = createMemoryRuntime(), options = {}) {
  return { runtime, handle: createLicenseHandler({ runtime, env, now: () => now, mailer: options.mailer }) };
}

function payload(accountId, overrides = {}) {
  return {
    event_id: overrides.eventId || "evt_1",
    event_type: overrides.eventType || "transaction.completed",
    data: {
      id: overrides.transactionId || "txn_1",
      status: overrides.status || "completed",
      custom_data: { accountId },
      customer: { email: overrides.email || "buyer@example.com" },
      items: [{
        quantity: overrides.quantity ?? 1,
        price: { id: env.DCP_PADDLE_PRICE_ID, product_id: env.DCP_PADDLE_PRODUCT_ID }
      }],
      details: { totals: { grand_total: String(overrides.amount ?? 4900), currency_code: overrides.currency || "KRW" } },
      ...(overrides.data || {})
    }
  };
}

async function postWebhook(handle, body, signedAt = now) {
  const rawBody = JSON.stringify(body);
  return handle({
    method: "POST",
    path: "/api/webhook",
    headers: { "paddle-signature": signBody(rawBody, secret, signedAt) },
    body: rawBody
  });
}

test("a rewritten page stays a page and does not grant a purchase", async () => {
  const { handle } = handler();
  const price = await handle({ method: "GET", path: "/api/page/price" });
  assert.equal(price.status, 200);
  assert.equal(price.body.includes("4,900"), true);
  const success = await handle({ method: "GET", path: "/api/page/success?transaction_id=txn_fake" });
  assert.equal(success.body.includes("이 화면은 Pro를 활성화하지 않습니다"), true);
  assert.equal(runtimeFromEnv({}).kind, "missing");
});

test("memory runtime stays out of production configuration and a success page does not grant", async () => {
  assert.equal(runtimeFromEnv({}).kind, "missing");
  const { runtime, handle } = handler();
  const closed = createLicenseHandler({ env, now: () => now });
  const session = await closed({ method: "POST", path: "/api/session" });
  assert.equal(session.status, 503);
  const buyer = await (await handle({ method: "POST", path: "/api/session" })).body;
  await postWebhook(handle, payload(buyer.accountId));
  const success = await handle({ method: "POST", path: "/success", body: JSON.stringify({ transaction_id: "txn_fake" }) });
  const client = await handle({ method: "POST", path: "/api/client-success", body: "{\"granted\":true}" });
  assert.equal(success.status, 200);
  assert.equal(success.body.includes("이 화면은 Pro를 활성화하지 않습니다"), true);
  assert.equal(client.body.granted, false);
  assert.equal(runtime.store.purchases.size, 1);
  const price = await handle({ method: "GET", path: "/price" });
  assert.equal(price.body.includes("대화 전체 내보내기"), true);
  assert.equal(price.body.includes("판매 기능으로 제공하지 않습니다"), true);
  const purchase = await handle({ method: "GET", path: "/purchase" });
  assert.equal(purchase.body.includes("판매 준비 중"), true);
  assert.equal(purchase.body.includes("disabled"), true);
});

test("signed sandbox notification grants once, and failure, tamper, or outage does not invent a result", async () => {
  const { runtime, handle } = handler();
  const buyer = (await handle({ method: "POST", path: "/api/session" })).body;
  const granted = await postWebhook(handle, payload(buyer.accountId));
  assert.equal(granted.body.granted, true);
  const duplicate = await postWebhook(handle, payload(buyer.accountId));
  assert.equal(duplicate.body.duplicate, true);
  const raw = JSON.stringify(payload(buyer.accountId, { eventId: "evt_tamper" }));
  const tampered = await handle({
    method: "POST",
    path: "/api/webhook",
    headers: { "paddle-signature": signBody(raw, secret, now) },
    body: `${raw} `
  });
  assert.equal(tampered.status, 401);
  assert.equal((await postWebhook(handle, payload(buyer.accountId, { eventId: "evt_low", amount: 1 }))).body.granted, false);
  const status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(status.body.state, "entitled");
  assert.equal(JSON.stringify(status.body).includes("buyer@example.com"), false);
  runtime.store.failReads = true;
  const down = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(down.status, 503);
  assert.equal(runtime.store.purchases.get("txn_1").status, "active");
  runtime.store.failReads = false;
  const unknown = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${"ab".repeat(32)}` } });
  assert.equal(unknown.status, 401);
});

test("refund revokes the recorded purchase and a restore link is single-use", async () => {
  const sent = [];
  const { runtime, handle } = handler(createMemoryRuntime(), {
    mailer(message) {
      sent.push(message);
      return { sent: true };
    }
  });
  const buyer = (await handle({ method: "POST", path: "/api/session" })).body;
  const other = (await handle({ method: "POST", path: "/api/session" })).body;
  await postWebhook(handle, payload(buyer.accountId, { email: "buyer@example.com" }));
  const typedOnly = await handle({
    method: "POST",
    path: "/api/restore",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "other@example.com" })
  });
  assert.equal(typedOnly.body.sent, false);
  assert.equal(typedOnly.body.reason, "not-purchased");
  assert.equal(sent.length, 0);
  const restore = await handle({
    method: "POST",
    path: "/api/restore",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "Buyer@Example.com" })
  });
  assert.equal(restore.body.sent, true);
  assert.equal(JSON.stringify(restore.body).includes("token"), false);
  const token = new URL(sent[0].link).searchParams.get("token");
  const consumed = await handle({ method: "GET", path: `/api/restore/consume?token=${token}&accountId=${other.accountId}` });
  assert.equal(consumed.status, 303);
  const cookie = /dcp_session=([a-f0-9]{64})/.exec(consumed.headers["set-cookie"]);
  const restored = await handle({ method: "GET", path: "/api/status", headers: { cookie: `dcp_session=${cookie[1]}` } });
  assert.equal(restored.body.state, "entitled");
  const otherStatus = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${other.token}` } });
  assert.equal(otherStatus.body.state, "not-purchased");
  const reused = await handle({ method: "GET", path: `/api/restore/consume?token=${token}` });
  assert.equal(reused.status, 400);
  assert.equal(reused.body.includes("이미 사용한 링크입니다"), true);
  const expired = await handler(runtime, {
    mailer() {
      return { sent: true };
    }
  });
  const issued = await runtime.issueLink({ accountId: buyer.accountId, email: "buyer@example.com", now: now - LOGIN_LINK_TTL_MS - 1000 });
  const stale = await expired.handle({ method: "GET", path: `/api/restore/consume?token=${issued.token}` });
  assert.equal(stale.body.includes("만료된 링크입니다"), true);
  runtime.store.emails.set(buyer.accountId, "f".repeat(64));
  const mismatchLink = await runtime.issueLink({ accountId: buyer.accountId, email: "buyer@example.com", now });
  assert.equal(mismatchLink.ok, false);
  runtime.store.emails.set(buyer.accountId, [...runtime.store.emails.values()][0]);
  const refund = await postWebhook(handle, {
    event_id: "evt_refund",
    event_type: "adjustment.updated",
    data: { id: "adj_1", action: "refund", status: "approved", transaction_id: "txn_1" }
  });
  assert.equal(refund.body.granted, false);
  const after = await handle({ method: "GET", path: "/api/status", headers: { cookie: `dcp_session=${cookie[1]}` } });
  assert.equal(after.body.state, "refunded");
  assert.equal(after.body.entitled, false);
});

test("a failed mail send is not reported as sent and a mismatched link does not change accounts", async () => {
  const { runtime, handle } = handler(createMemoryRuntime(), {
    mailer() {
      return { sent: false, reason: "mail-failed" };
    }
  });
  const buyer = (await handle({ method: "POST", path: "/api/session" })).body;
  await postWebhook(handle, payload(buyer.accountId));
  const failed = await handle({
    method: "POST",
    path: "/api/restore",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.com" })
  });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.sent, false);
  const link = await runtime.issueLink({ accountId: buyer.accountId, email: "buyer@example.com", now });
  runtime.store.emails.set(buyer.accountId, "a".repeat(64));
  const mismatch = await handle({ method: "GET", path: `/api/restore/consume?token=${link.token}` });
  assert.equal(mismatch.body.includes("다른 계정"), true);
  assert.equal(mismatch.headers?.["set-cookie"], undefined);
  const status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(status.body.state, "entitled");
});
