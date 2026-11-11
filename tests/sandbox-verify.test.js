import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { entitlementFromServer, mayExport } from "../extension/src/entitlement.js";
import { SALE } from "../extension/src/sale.js";
import { buildSandboxVerifyExtension } from "../scripts/build-sandbox-verify-extension.mjs";
import { createSandboxVerifyRuntime } from "../sandbox-verify/server.mjs";
import { signBody } from "../server/signature.js";
import { loadDom } from "./helpers/dom.js";

const secret = "test-only-webhook-secret";
const now = 1_700_000_000_000;

test("the sale package does not accept a sandbox purchase as Pro", () => {
  const source = ["src/sale.js", "src/entitlement.js", "src/popup-controller.js", "src/export-action.js", "manifest.json"]
    .map((file) => readFileSync(new URL(`../extension/${file}`, import.meta.url), "utf8"))
    .join("\n");
  for (const forbidden of ["sandboxExport", "sandbox-verify", "exportVerify", "127.0.0.1", "DCP_SANDBOX_EXPORT"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal(SALE.open, false);
  const body = {
    entitled: false,
    state: "sandbox",
    channel: "sandbox",
    exportVerify: "sandbox",
    source: "server",
    productId: "dot-copy-paste-export",
    amount: 4900,
    currency: "KRW"
  };
  const entitlement = entitlementFromServer(body);
  assert.equal(entitlement.state, "sandbox");
  assert.equal(mayExport(entitlement), false);
});

test("the sandbox verify extension exports loaded messages only after a sandbox purchase", async () => {
  const output = buildSandboxVerifyExtension();
  const manifest = JSON.parse(readFileSync(`${output}/manifest.json`, "utf8"));
  assert.equal(manifest.name, "Dot Copy Paste Sandbox Verify");
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1:8787/*"]);
  assert.equal(JSON.stringify(manifest).includes("dot-copy-paste.vercel.app"), false);
  const extensionUrl = pathToFileURL(`${output}/src/export-action.js`).href;
  const saleUrl = pathToFileURL(`${output}/src/sale.js`).href;
  const { handleExportRequest } = await import(extensionUrl);
  const { SALE: verifySale } = await import(saleUrl);
  assert.equal(verifySale.open, false);
  assert.equal(verifySale.sandboxExport, "verify");
  const { runtime, handle } = createSandboxVerifyRuntime(() => now);
  const health = await handle({ method: "GET", path: "/api/health" });
  assert.equal(health.body.sale, "preparing");
  assert.equal(health.body.sandboxExport, "verify");
  const buyer = (await handle({ method: "POST", path: "/api/session" })).body;
  const notification = {
    event_id: "evt_verify_export",
    event_type: "transaction.completed",
    data: {
      id: "txn_verify_export",
      status: "completed",
      custom_data: { accountId: buyer.accountId },
      items: [{ quantity: 1, price: { id: "pri_dcp_export_test", product_id: "dot-copy-paste-export" } }],
      details: { totals: { grand_total: "4900", currency_code: "KRW" } }
    }
  };
  const raw = JSON.stringify(notification);
  const granted = await handle({
    method: "POST",
    path: "/api/webhook",
    headers: { "paddle-signature": signBody(raw, secret, now) },
    body: raw
  });
  assert.equal(granted.body.granted, true);
  const status = await handle({ method: "GET", path: "/api/status", headers: { authorization: `Bearer ${buyer.token}` } });
  assert.equal(status.body.entitled, false);
  assert.equal(status.body.channel, "sandbox");
  assert.equal(status.body.exportVerify, "sandbox");
  const saved = [];
  const exported = await handleExportRequest({
    doc: fixture(),
    adapter: fixtureAdapter(),
    format: "txt",
    language: "ko",
    exportedAt: new Date("2026-11-12T00:00:00Z"),
    storage: { async get() { return { licenseSession: { token: buyer.token } }; } },
    sale: verifySale,
    request() { return status.body; },
    saveFile(file) { saved.push(file); }
  });
  assert.equal(exported.ok, true);
  assert.equal(exported.code, "exported-loaded");
  assert.equal(saved[0].text.includes("검증 문장"), true);
  assert.equal(saved[0].text.includes("현재 불러온 메시지 내보내기"), true);
  assert.equal(saved[0].text.includes("대화 전체 내보내기"), false);
  const unpaid = await handleExportRequest({
    doc: fixture(),
    adapter: fixtureAdapter(),
    format: "txt",
    language: "ko",
    storage: { async get() { return { pro: true }; } },
    sale: verifySale,
    request() { return { entitled: false, state: "not-purchased", source: "server" }; },
    saveFile() { throw new Error("unpaid-export"); }
  });
  assert.equal(unpaid.ok, false);
  const live = await handleExportRequest({
    doc: fixture(),
    adapter: fixtureAdapter(),
    format: "txt",
    language: "ko",
    storage: { async get() { return { licenseSession: { token: "b".repeat(64) } }; } },
    sale: verifySale,
    request() {
      return { entitled: true, state: "entitled", channel: "live", source: "server", productId: "dot-copy-paste-export", amount: 4900, currency: "KRW" };
    },
    saveFile() { throw new Error("live-export-in-sandbox-build"); }
  });
  assert.equal(live.ok, false);
  assert.equal(runtime.store.purchases.get("txn_verify_export").environment, "sandbox");
});

function fixture() {
  return loadDom('<div data-role="messages-scroll"><article data-author="user" data-state="complete"><div data-body><p>검증 문장</p></div></article></div>', "https://chatgpt.com/dots/home").window.document;
}

function fixtureAdapter() {
  return {
    detect: () => ({ active: true, reason: "fixture" }),
    getObserverRoot: (doc) => doc.querySelector("[data-role='messages-scroll']"),
    messagesIn: (node) => [...node.querySelectorAll("article")],
    getAuthor: (node) => node.getAttribute("data-author"),
    getGenerationState: (node) => node.getAttribute("data-state"),
    getBodyElement: (node) => node.querySelector("[data-body]"),
    getThreadExtent: () => ({ complete: false, loadedCount: 1, expectedCount: null, reason: "no-confirmed-total" })
  };
}
