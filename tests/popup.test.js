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

test("popup does not request clipboard permission or read text until the button click", async () => {
  const doc = popupDom();
  const chrome = fakeChrome();
  let reads = 0;
  const popup = wirePopup(doc, { chrome, version: "0.2.0" });
  await popup.init();
  assert.equal(chrome.calls.includes("request"), false);
  assert.equal(reads, 0);
  assert.equal(doc.querySelector("[data-i18n='domUnverified']").textContent, "Copy and paste buttons appear only on a ChatGPT dot conversation page.");
  assert.equal(doc.querySelector("[data-role='version']").textContent, "0.2.0");
  doc.querySelector("[data-action='allow-clipboard']").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(chrome.calls.filter((call) => call === "request").length, 1);
  assert.equal(reads, 0);
  doc.querySelector("[data-action='revoke-clipboard']").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(chrome.calls.at(-1), "remove");
  assert.equal(chrome.storageState.settings.enabled, true);
});
