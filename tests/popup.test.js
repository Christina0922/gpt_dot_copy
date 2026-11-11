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

test("popup has no clipboard permission menu and does not start a payment", async () => {
  const doc = popupDom();
  const chrome = fakeChrome();
  let asked = 0;
  const popup = wirePopup(doc, {
    chrome,
    version: "0.2.6",
    askPage() {
      asked += 1;
      return { ok: true, code: "exported-full" };
    },
    licenseRequest() {
      return { source: "server", entitled: false, state: "not-purchased", productId: "dot-copy-paste-export" };
    }
  });
  await popup.init();
  assert.equal(doc.querySelector("[data-action='allow-clipboard']"), null);
  assert.equal(doc.querySelector("[data-action='revoke-clipboard']"), null);
  assert.equal(doc.querySelector("[data-i18n='clipboardExplain']"), null);
  assert.equal(doc.querySelector("input[type='email']"), null);
  assert.equal(chrome.calls.includes("request"), false);
  assert.equal(chrome.calls.includes("remove"), false);
  assert.equal(doc.querySelector("[data-i18n='exportShort']").textContent, "Only the messages loaded now are saved.");
  assert.equal(doc.querySelector("[data-i18n='proShort']").textContent, "Pro one-time KRW 4,900 · no automatic renewal");
  assert.equal(doc.querySelector("[data-i18n='freeStatus']").textContent, "Free");
  assert.equal(doc.querySelector("details").open, false);
  assert.equal(doc.querySelector("[data-i18n='domUnverified']").textContent, "Copy and paste buttons appear only on a ChatGPT dot conversation page.");
  assert.equal(doc.querySelector("[data-role='version']").textContent, "0.2.6");
  assert.equal(doc.querySelector("[data-action='buy-pro']").disabled, true);
  assert.equal(doc.querySelector("[data-action='buy-pro']").textContent, "Sale in preparation");
  assert.equal(doc.querySelector("[data-role='purchase-status']").textContent, "No purchase was confirmed for this account.");
  assert.equal(doc.querySelector("[data-action='restore-purchase']").getAttribute("href"), "https://dot-copy-paste.vercel.app/restore");
  assert.equal(asked, 0);
  doc.querySelector("[data-action='export']").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(asked, 0);
  assert.equal(doc.querySelector("[data-setting='enabled']").checked, true);
  assert.equal(chrome.storageState.settings.enabled, true);
});

test("a missing login session asks for sign-in and does not export", async () => {
  const doc = popupDom();
  const chrome = fakeChrome();
  let asked = 0;
  const popup = wirePopup(doc, {
    chrome,
    version: "0.2.6",
    askPage() {
      asked += 1;
      return { ok: true, code: "exported-full" };
    },
    licenseRequest() {
      return { source: "server", entitled: false, state: "unauthorized" };
    }
  });
  await popup.init();
  assert.equal(doc.querySelector("[data-role='purchase-status']").textContent, "Sign in or restore a purchase to check it.");
  doc.querySelector("[data-action='export']").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(asked, 0);
  assert.equal(doc.querySelector("[data-action='buy-pro']").disabled, true);
});
