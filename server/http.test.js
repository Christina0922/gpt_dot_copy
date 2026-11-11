import assert from "node:assert/strict";
import test from "node:test";
import { createLicenseHandler } from "./http.js";
import { LOGIN_LINK_TTL_MS } from "./login.js";
import { mailConfig } from "./mail.js";
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
  assert.equal(status.body.state, "sandbox");
  assert.equal(status.body.entitled, false);
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
  assert.equal(restored.body.state, "sandbox");
  assert.equal(restored.body.entitled, false);
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
  assert.equal(refund.body.granted, false);
  const after = await handle({ method: "GET", path: "/api/status", headers: { cookie: `dcp_session=${cookie[1]}` } });
  assert.equal(after.body.state, "refunded");
  assert.equal(after.body.entitled, false);
});

function adjustment(eventId, overrides = {}) {
  const currency = overrides.currency || "KRW";
  return {
    event_id: eventId,
    event_type: overrides.eventType || "adjustment.updated",
    occurred_at: overrides.occurredAt,
    data: {
      id: overrides.id || "adj_1",
      action: overrides.action || "refund",
      type: overrides.type || "partial",
      status: overrides.status || "approved",
      transaction_id: overrides.transactionId || "txn_1",
      currency_code: currency,
      totals: { total: String(overrides.amount ?? 0), currency_code: currency },
      items: overrides.items
    }
  };
}

test("approved refunds keep the final entitlement through partial, duplicate, and out-of-order notices", async () => {
  const { handle } = handler();
  const buyer = (await handle({ method: "POST", path: "/api/session" })).body;
  assert.equal((await postWebhook(handle, payload(buyer.accountId))).body.granted, true);
  assert.equal((await postWebhook(handle, {
    event_id: "evt_unused",
    event_type: "transaction.refunded",
    data: { id: "txn_1", status: "refunded" }
  })).body.granted, false);
  assert.equal((await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } })).body.state, "sandbox");

  await postWebhook(handle, adjustment("evt_pending", { status: "pending_approval", type: "full", amount: 4900, occurredAt: "2026-11-11T00:01:00.000Z" }));
  await postWebhook(handle, adjustment("evt_rejected", { status: "rejected", type: "full", amount: 4900, occurredAt: "2026-11-11T00:02:00.000Z" }));
  await postWebhook(handle, adjustment("evt_credit", { action: "credit", type: "full", amount: 4900, occurredAt: "2026-11-11T00:02:30.000Z" }));
  let status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(status.body.state, "sandbox");
  assert.equal(status.body.entitled, false);

  await postWebhook(handle, adjustment("evt_partial", { id: "adj_partial", amount: 1000, occurredAt: "2026-11-11T00:03:00.000Z" }));
  await postWebhook(handle, adjustment("evt_partial", { id: "adj_partial", amount: 1000, occurredAt: "2026-11-11T00:03:00.000Z" }));
  await postWebhook(handle, adjustment("evt_partial_old", { id: "adj_partial", status: "pending_approval", amount: 1000, occurredAt: "2026-11-11T00:02:30.000Z" }));
  status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(status.body.state, "sandbox");
  assert.equal(status.body.entitled, false);
  assert.equal(status.body.refund, "partial");
  assert.equal(status.body.refundedAmount, 1000);

  await postWebhook(handle, adjustment("evt_other_product", {
    id: "adj_other",
    type: "full",
    amount: 4900,
    occurredAt: "2026-11-11T00:04:00.000Z",
    items: [{ type: "full", amount: "4900", price: { product_id: "pro_other" } }]
  }));
  status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(status.body.state, "sandbox");
  assert.equal(status.body.entitled, false);

  await postWebhook(handle, adjustment("evt_rest", { id: "adj_rest", amount: 3900, occurredAt: "2026-11-11T00:05:00.000Z" }));
  status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(status.body.state, "refunded");
  assert.equal(status.body.entitled, false);

  const later = (await handle({ method: "POST", path: "/api/session" })).body;
  await postWebhook(handle, adjustment("evt_early", {
    id: "adj_early",
    transactionId: "txn_early",
    type: "full",
    amount: 4900,
    eventType: "adjustment.created",
    occurredAt: "2026-11-11T00:06:00.000Z"
  }));
  const completed = await postWebhook(handle, payload(later.accountId, { eventId: "evt_early_paid", transactionId: "txn_early" }));
  assert.equal(completed.body.granted, false);
  status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${later.token}` } });
  assert.equal(status.body.state, "refunded");
});

test("the mail transport is SMTP and an API-key variable is not the password", async () => {
  const missing = createLicenseHandler({
    runtime: createMemoryRuntime(),
    env: { ...env, DCP_EMAIL_FROM: "buyer@example.com", DCP_EMAIL_API_KEY: "not-a-smtp-password" }
  });
  assert.equal((await missing({ method: "GET", path: "/api/health" })).body.mail, "missing");
  const configured = createLicenseHandler({
    runtime: createMemoryRuntime(),
    env: { ...env, DCP_EMAIL_FROM: "buyer@example.com", DCP_EMAIL_SMTP_PASSWORD: "smtp-password" }
  });
  assert.equal((await configured({ method: "GET", path: "/api/health" })).body.mail, "configured");
  const config = mailConfig({ DCP_EMAIL_FROM: "buyer@example.com", DCP_EMAIL_SMTP_PASSWORD: "smtp-password", DCP_EMAIL_API_KEY: "not-used" });
  assert.equal(config.host, "smtp.gmail.com");
  assert.equal(config.port, 465);
  assert.equal(config.secure, true);
  assert.equal(config.passwordPresent, true);
  assert.deepEqual(Object.keys(config).sort(), ["fromPresent", "host", "passwordPresent", "port", "secure"]);
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
  assert.equal(status.body.state, "sandbox");
  assert.equal(status.body.entitled, false);
});

test("a session without a purchase is not Pro, logout drops only that session, and an old session expires", async () => {
  const { runtime, handle } = handler();
  const buyer = (await handle({ method: "POST", path: "/api/session" })).body;
  const unpaid = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(unpaid.body.state, "not-purchased");
  assert.equal(unpaid.body.entitled, false);
  assert.equal(JSON.stringify(unpaid.body).includes(buyer.token), false);
  const loggedOut = await handle({ method: "POST", path: "/api/logout", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(loggedOut.body.ok, true);
  assert.equal(loggedOut.headers["set-cookie"].includes("Max-Age=0"), true);
  assert.equal(JSON.stringify(loggedOut.body).includes(buyer.token), false);
  const after = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(after.status, 401);
  assert.equal(after.body.state, "unauthorized");
  const next = (await handle({ method: "POST", path: "/api/session" })).body;
  runtime.store.accounts.get([...runtime.store.accounts.keys()].at(-1)).expiresAt = now - 1;
  const expired = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${next.token}` } });
  assert.equal(expired.status, 401);
  const bad = await handle({ method: "GET", path: "/api/restore/consume?token=not-a-token" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.includes("확인할 수 없습니다"), true);
});

test("restore requests are limited and a live purchase stays separate from Sandbox", async () => {
  const sent = [];
  const { handle } = handler(createMemoryRuntime(), {
    mailer() {
      sent.push(true);
      return { sent: true };
    }
  });
  const buyer = (await handle({ method: "POST", path: "/api/session" })).body;
  await postWebhook(handle, payload(buyer.accountId));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await handle({
      method: "POST",
      path: "/api/restore",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "buyer@example.com" })
    });
    assert.equal(response.status, 200);
  }
  const limited = await handle({
    method: "POST",
    path: "/api/restore",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.8" },
    body: JSON.stringify({ email: "buyer@example.com" })
  });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.reason, "limited");
  assert.equal(sent.length, 5);
  const live = createLicenseHandler({
    runtime: createMemoryRuntime(),
    env: { ...env, DCP_PADDLE_ENV: "live" },
    now: () => now,
    mailer() {
      return { sent: true };
    }
  });
  const liveBuyer = (await live({ method: "POST", path: "/api/session" })).body;
  const raw = JSON.stringify(payload(liveBuyer.accountId, { eventId: "evt_live", transactionId: "txn_live" }));
  const granted = await live({
    method: "POST",
    path: "/api/webhook",
    headers: { "paddle-signature": signBody(raw, secret, now) },
    body: raw
  });
  assert.equal(granted.body.granted, true);
  const liveStatus = await live({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${liveBuyer.token}` } });
  assert.equal(liveStatus.body.state, "entitled");
  assert.equal(liveStatus.body.channel, "live");
  const sandboxStatus = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(sandboxStatus.body.state, "sandbox");
  assert.equal(sandboxStatus.body.channel, "sandbox");
  assert.equal(sandboxStatus.body.entitled, false);
});
