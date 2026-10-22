import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { resolveLanguage, MESSAGES } from "../extension/src/i18n.js";
import { normalizeSettings } from "../extension/src/settings.js";
import { wirePopup } from "../extension/src/popup-controller.js";
import { startApp } from "../extension/src/bootstrap.js";
import { createClipboard, flush, loadDom } from "./helpers/dom.js";
import { createFixtureAdapter, threadHtml } from "./helpers/fixture.js";

test("display language defaults to English, and old or unknown values fall back to English", () => {
  assert.equal(normalizeSettings(null).language, "en");
  for (const stored of ["auto", "ja", "", undefined]) assert.equal(normalizeSettings({ language: stored }).language, "en", String(stored));
  assert.equal(normalizeSettings({ language: "ko", languageChosen: true }).language, "ko");
});

test("a Korean value saved by an older build, without the popup marker, shows English", () => {
  assert.equal(normalizeSettings({ language: "ko" }).language, "en");
  assert.equal(normalizeSettings({ language: "ko", languageChosen: "yes" }).language, "en");
});

test("only a Korean choice in the popup gives Korean", () => {
  assert.equal(resolveLanguage("en"), "en");
  assert.equal(resolveLanguage("ko"), "ko");
  assert.equal(resolveLanguage(normalizeSettings(null).language), "en");
});

function fakeChrome(stored, uiLanguage) {
  return {
    storage: {
      local: { get: async () => ({ settings: stored }), set: async () => {} },
      onChanged: { addListener() {} }
    },
    permissions: { contains: async () => false, onRemoved: { addListener() {} } },
    i18n: { getUILanguage: () => uiLanguage }
  };
}

async function popupWith(stored, uiLanguage) {
  const html = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");
  const doc = new JSDOM(html, { url: "chrome-extension://test/popup/popup.html" }).window.document;
  await wirePopup(doc, { chrome: fakeChrome(stored, uiLanguage), version: "0.2.0" }).init();
  return doc;
}

test("a Korean browser still opens the popup in English until Korean is picked", async () => {
  const fresh = await popupWith(undefined, "ko-KR");
  assert.equal(fresh.documentElement.lang, "en");
  assert.equal(fresh.querySelector("[data-i18n='languageLabel']").textContent, MESSAGES.en.languageLabel);
  const select = fresh.querySelector("[data-setting='language']");
  assert.equal(select.value, "en");
  assert.deepEqual([...select.options].map((option) => option.value), ["en", "ko"]);

  const oldAuto = await popupWith({ language: "auto" }, "ko-KR");
  assert.equal(oldAuto.documentElement.lang, "en");

  const legacy = await popupWith({ language: "ko" }, "ko-KR");
  assert.equal(legacy.documentElement.lang, "en");
  assert.equal(legacy.querySelector("[data-setting='language']").value, "en");

  const picked = await popupWith({ language: "ko", languageChosen: true }, "en-US");
  assert.equal(picked.documentElement.lang, "ko");
  assert.equal(picked.querySelector("[data-i18n='languageLabel']").textContent, MESSAGES.ko.languageLabel);
});

async function pageWith(stored) {
  const dom = loadDom(`<div data-fixture="dot-screen">${threadHtml}</div>`);
  const doc = dom.window.document;
  doc.hasFocus = () => true;
  const originals = { warn: console.warn, info: console.info };
  console.warn = () => {};
  console.info = () => {};
  try {
    await startApp({ chrome: fakeChrome(stored, "ko-KR"), window: dom.window, document: doc, adapter: createFixtureAdapter(doc), clipboard: createClipboard({ text: "" }) });
  } finally {
    Object.assign(console, originals);
  }
  return doc;
}

test("page buttons, the format menu, and status text follow the same rule on a Korean browser", async () => {
  const doc = await pageWith(undefined);
  const known = doc.querySelector("[data-fixture-id='m1'] .dcp-copy-slot");
  const unknown = doc.querySelector("[data-fixture-id='m5'] [data-dcp-copy]");
  assert.equal(known.querySelector("[data-dcp-copy]").textContent, MESSAGES.en.copy);
  assert.equal(unknown.textContent, MESSAGES.en.copyShown);
  assert.equal(known.querySelector("[data-dcp-copy-menu]").getAttribute("aria-label"), MESSAGES.en.copyFormatMenu);
  assert.deepEqual([...known.querySelectorAll("[role='menuitemradio']")].map((item) => item.textContent), [MESSAGES.en.copyAsText, MESSAGES.en.copyAsMarkdown]);
  assert.equal(doc.querySelector("[data-dcp-paste]").textContent, MESSAGES.en.paste);
  doc.querySelector("[data-dcp-paste]").click();
  await flush();
  assert.equal(doc.querySelector("[data-dcp-paste]").parentElement.querySelector(".dcp-status").textContent, MESSAGES.en.clipboardEmpty);

  const legacy = await pageWith({ language: "ko" });
  assert.equal(legacy.querySelector("[data-fixture-id='m1'] [data-dcp-copy]").textContent, MESSAGES.en.copy);
  assert.equal(legacy.querySelector("[data-fixture-id='m5'] [data-dcp-copy]").textContent, MESSAGES.en.copyShown);

  const korean = await pageWith({ language: "ko", languageChosen: true });
  const slot = korean.querySelector("[data-fixture-id='m1'] .dcp-copy-slot");
  assert.equal(slot.querySelector("[data-dcp-copy]").textContent, MESSAGES.ko.copy);
  assert.equal(korean.querySelector("[data-fixture-id='m5'] [data-dcp-copy]").textContent, MESSAGES.ko.copyShown);
  assert.equal(slot.querySelector("[data-dcp-copy-menu]").getAttribute("aria-label"), MESSAGES.ko.copyFormatMenu);
  assert.deepEqual([...slot.querySelectorAll("[role='menuitemradio']")].map((item) => item.textContent), [MESSAGES.ko.copyAsText, MESSAGES.ko.copyAsMarkdown]);
});

test("picking a language in the popup saves it as a deliberate choice", async () => {
  const html = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");
  const doc = new JSDOM(html, { url: "chrome-extension://test/popup/popup.html" }).window.document;
  const saved = [];
  const chrome = fakeChrome(undefined, "en-US");
  chrome.storage.local.set = async (value) => saved.push(value.settings);
  await wirePopup(doc, { chrome, version: "0.2.0" }).init();
  const select = doc.querySelector("[data-setting='language']");
  select.value = "ko";
  select.dispatchEvent(new doc.defaultView.Event("change"));
  await flush();
  assert.equal(saved.at(-1).language, "ko");
  assert.equal(saved.at(-1).languageChosen, true);
  assert.equal(normalizeSettings(saved.at(-1)).language, "ko");
  assert.equal(doc.documentElement.lang, "ko");
});

test("the started line shows the language in use and the stored settings", async () => {
  const dom = loadDom(`<div data-fixture="dot-screen">${threadHtml}</div>`);
  const doc = dom.window.document;
  const lines = [];
  const originals = { warn: console.warn, info: console.info };
  console.warn = () => {};
  console.info = (...args) => lines.push(args);
  try {
    await startApp({ chrome: fakeChrome({ language: "ko", copyFormat: "markdown" }, "ko-KR"), window: dom.window, document: doc, adapter: createFixtureAdapter(doc), clipboard: createClipboard() });
  } finally {
    Object.assign(console, originals);
  }
  const started = lines.find((args) => args[1] === "started");
  assert.ok(started);
  assert.equal(started[2].language, "en");
  assert.deepEqual(started[2].storedSettings, { language: "ko", copyFormat: "markdown" });
});
