import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MESSAGES } from "../extension/src/i18n.js";
import { liveAdapter } from "../extension/src/live-adapter.js";

const root = new URL("../extension/", import.meta.url);

test("manifest is MV3 and limited to chatgpt.com", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "0.2.4");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.optional_permissions, undefined);
  assert.equal(JSON.stringify(manifest).includes("clipboardRead"), false);
  assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://chatgpt.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, ["content/content.js"]);
  assert.equal(manifest.content_scripts[0].type, undefined);
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.content_scripts.length, 1);
  assert.equal(manifest.content_scripts[0].all_frames, undefined);
  for (const forbidden of ["tabs", "history", "cookies", "webRequest", "clipboardWrite", "scripting", "activeTab"]) {
    assert.equal(manifest.permissions.includes(forbidden), false);
    assert.equal((manifest.optional_permissions || []).includes(forbidden), false);
  }
  assert.ok(manifest.description.startsWith("__MSG_"));
  assert.ok(manifest.description.length < 132);
});

test("locale descriptions stay within the Chrome limit and do not claim partnership", () => {
  for (const locale of ["en", "ko"]) {
    const messages = JSON.parse(readFileSync(new URL(`_locales/${locale}/messages.json`, root), "utf8"));
    assert.ok(messages.extDescription.message.length <= 132);
    assert.equal(/official OpenAI|공식 제품|제휴/.test(messages.extDescription.message), false);
  }
});

test("extension source does not send or render user text unsafely", () => {
  const files = [
    "content/content.js",
    "src/bootstrap.js",
    "src/clipboard.js",
    "src/controller.js",
    "src/extract-text.js",
    "src/extract-markdown.js",
    "src/insert-text.js",
    "src/live-adapter.js",
    "src/sale.js",
    "src/entitlement.js",
    "src/export-conversation.js",
    "src/export-action.js",
    "src/popup-controller.js"
  ];
  const source = files.map((file) => readFileSync(new URL(file, root), "utf8")).join("\n");
  for (const forbidden of ["innerHTML", "insertAdjacentHTML", "fetch(", "XMLHttpRequest", "WebSocket", "eval(", "chrome.tabs", "webRequest", "localhost", "127.0.0.1", "sk_live", "sk_test", "whsec_"]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  const popup = readFileSync(new URL("popup/popup.js", root), "utf8");
  assert.equal(popup.includes("fetch("), false);
  assert.equal(popup.includes("localhost"), false);
  assert.equal(popup.includes("chrome.tabs.query"), true);
  assert.equal(popup.includes("chrome.tabs.sendMessage"), true);
  assert.equal(JSON.stringify(JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"))).includes("tabs"), false);
});

test("Korean clipboard denial text is exact", () => {
  assert.equal(MESSAGES.ko.clipboardDenied, "클립보드를 읽을 수 없습니다. 입력창에서 Ctrl+V를 사용해 주세요.");
});

test("live adapter stays inactive without a confirmed Dot conversation", () => {
  assert.equal(liveAdapter.detect({ location: { hostname: "chatgpt.com", pathname: "/c/123" } }).reason, "not-dot-path");
  assert.equal(liveAdapter.detect({ location: { hostname: "chatgpt.com", pathname: "/dots/home" } }).reason, "dot-landmarks-missing");
  assert.equal(liveAdapter.detect({ location: { hostname: "example.com", pathname: "/" } }).active, false);
  assert.equal(liveAdapter.getComposer(), null);
  assert.deepEqual(liveAdapter.messagesIn(), []);
});
