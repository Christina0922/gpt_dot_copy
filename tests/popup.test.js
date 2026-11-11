import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { wirePopup } from "../extension/src/popup-controller.js";

function popupDom() {
  const html = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "chrome-extension://test/popup/popup.html", runScripts: "outside-only" });
  return dom.window.document;
}

function fakeChrome() {
  const calls = [];
  let allowed = false;
  const listeners = [];
  const storage = {
    settings: { enabled: true, language: "auto" }
  };
  return {
    calls,
    permissions: {
      async contains() {
        return allowed;
      },
      async request() {
        calls.push("request");
        allowed = true;
        return true;
      },
      async remove() {
        calls.push("remove");
        allowed = false;
        return true;
      },
      onRemoved: { addListener(fn) { listeners.push(fn); } }
    },
    storage: {
      local: {
        async get() {
          return { settings: storage.settings };
        },
        async set(value) {
          storage.settings = value.settings;
        }
      }
    },
    storageState: storage
  };
}

test("popup has no clipboard permission menu and does not request clipboardRead", async () => {
  const doc = popupDom();
  const chrome = fakeChrome();
  const popup = wirePopup(doc, { chrome, version: "0.2.3" });
  await popup.init();
  assert.equal(doc.querySelector("[data-action='allow-clipboard']"), null);
  assert.equal(doc.querySelector("[data-action='revoke-clipboard']"), null);
  assert.equal(doc.querySelector("[data-i18n='clipboardExplain']"), null);
  assert.equal(chrome.calls.includes("request"), false);
  assert.equal(chrome.calls.includes("remove"), false);
  assert.equal(doc.querySelector("[data-i18n='domUnverified']").textContent, "Copy and paste buttons appear only on a ChatGPT dot conversation page.");
  assert.equal(doc.querySelector("[data-role='version']").textContent, "0.2.3");
  assert.equal(chrome.storageState.settings.enabled, true);
});
