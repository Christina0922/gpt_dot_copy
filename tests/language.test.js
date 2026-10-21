import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { resolveLanguage, MESSAGES } from "../extension/src/i18n.js";
import { normalizeSettings } from "../extension/src/settings.js";
import { wirePopup } from "../extension/src/popup-controller.js";

test("display language defaults to the browser: Korean for ko, English for anything else", () => {
  assert.equal(normalizeSettings(null).language, "auto");
  for (const ui of ["ko", "ko-KR", "KO-kr"]) assert.equal(resolveLanguage("auto", ui), "ko", ui);
  for (const ui of ["en", "en-US", "ja", "zh-CN", "", undefined]) assert.equal(resolveLanguage("auto", ui), "en", String(ui));
});

test("a language picked in the popup overrides the browser language", () => {
  assert.equal(resolveLanguage("en", "ko-KR"), "en");
  assert.equal(resolveLanguage("ko", "en-US"), "ko");
});

async function popupIn(uiLanguage, stored) {
  const html = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");
  const doc = new JSDOM(html, { url: "chrome-extension://test/popup/popup.html" }).window.document;
  const chrome = {
    storage: { local: { get: async () => ({ settings: stored }), set: async () => {} } },
    permissions: { contains: async () => false, onRemoved: { addListener() {} } }
  };
  await wirePopup(doc, { chrome, uiLanguage, version: "0.2.0" }).init();
  return doc;
}

test("popup follows the browser language until the user picks one", async () => {
  const korean = await popupIn("ko-KR", undefined);
  assert.equal(korean.documentElement.lang, "ko");
  assert.equal(korean.querySelector("[data-i18n='languageLabel']").textContent, MESSAGES.ko.languageLabel);
  assert.equal(korean.querySelector("[data-setting='language']").value, "auto");

  const other = await popupIn("ja", undefined);
  assert.equal(other.documentElement.lang, "en");

  const picked = await popupIn("ko-KR", { language: "en" });
  assert.equal(picked.documentElement.lang, "en");
  assert.equal(picked.querySelector("[data-setting='language']").value, "en");
});
