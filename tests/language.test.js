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

test("display language stays automatic until the popup records a choice", () => {
  assert.equal(normalizeSettings(null).language, "auto");
  for (const stored of ["auto", "ja", "", undefined]) assert.equal(normalizeSettings({ language: stored }).language, "auto", String(stored));
  assert.equal(normalizeSettings({ language: "ko" }).language, "auto");
  assert.equal(normalizeSettings({ language: "ko", languageChosen: true }).language, "ko");
  assert.equal(normalizeSettings({ language: "en", languageChosen: true }).language, "en");
});

test("browser language chooses the display language, and an explicit choice wins", () => {
  assert.equal(resolveLanguage("auto", "ko-KR"), "ko");
  assert.equal(resolveLanguage("auto", "ko"), "ko");
  assert.equal(resolveLanguage("auto", "en-US"), "en");
  assert.equal(resolveLanguage("auto", "ja"), "en");
  assert.equal(resolveLanguage("en", "ko-KR"), "en");
  assert.equal(resolveLanguage("ko", "en-US"), "ko");
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

test("the popup follows the browser language until a language is picked", async () => {
  const fresh = await popupWith(undefined, "ko-KR");
  assert.equal(fresh.documentElement.lang, "ko");
  assert.equal(fresh.querySelector("[data-i18n='languageLabel']").textContent, MESSAGES.ko.languageLabel);
  const select = fresh.querySelector("[data-setting='language']");
  assert.equal(select.value, "ko");
  assert.deepEqual([...select.options].map((option) => option.value), ["en", "ko"]);

  const japanese = await popupWith(undefined, "ja");
  assert.equal(japanese.documentElement.lang, "en");
  assert.equal(japanese.querySelector("[data-setting='language']").value, "en");

  const legacy = await popupWith({ language: "ko" }, "en-US");
  assert.equal(legacy.documentElement.lang, "en");

  const picked = await popupWith({ language: "ko", languageChosen: true }, "en-US");
  assert.equal(picked.documentElement.lang, "ko");
  assert.equal(picked.querySelector("[data-i18n='enabledLabel']").textContent, MESSAGES.ko.enabledLabel);
  assert.equal(picked.querySelector("[data-i18n='languageLabel']").textContent, MESSAGES.ko.languageLabel);
});

async function pageWith(stored, uiLanguage = "ko-KR") {
  const dom = loadDom(`<div data-fixture="dot-screen">${threadHtml}</div>`);
  const doc = dom.window.document;
  doc.hasFocus = () => true;
  const originals = { warn: console.warn, info: console.info };
  console.warn = () => {};
  console.info = () => {};
  try {
    await startApp({ chrome: fakeChrome(stored, uiLanguage), window: dom.window, document: doc, adapter: createFixtureAdapter(doc), clipboard: createClipboard({ text: "" }) });
  } finally {
    Object.assign(console, originals);
  }
  return doc;
}

const labels = (slot) => [...slot.querySelectorAll("[data-dcp-copy]")].map((button) => [button.getAttribute("aria-label"), button.title]);

test("page buttons follow the browser language and a later explicit choice", async () => {
  const doc = await pageWith(undefined);
  const complete = [[MESSAGES.ko.copy, MESSAGES.ko.copy], [MESSAGES.ko.copyAsMarkdown, MESSAGES.ko.copyAsMarkdown]];
  const unknown = [[MESSAGES.ko.copyVisible, MESSAGES.ko.copyVisible], [MESSAGES.ko.copyVisibleMarkdown, MESSAGES.ko.copyVisibleMarkdown]];
  assert.deepEqual(labels(doc.querySelector("[data-fixture-id='m1'] .dcp-copy-slot")), complete);
  assert.deepEqual(labels(doc.querySelector("[data-fixture-id='m5'] .dcp-copy-slot")), unknown);
  assert.equal(doc.querySelector("[data-dcp-paste]").textContent, MESSAGES.ko.paste);
  doc.querySelector("[data-dcp-paste]").click();
  await flush();
  assert.equal(doc.querySelector("[data-dcp-paste]").parentElement.querySelector(".dcp-status").textContent, MESSAGES.ko.clipboardEmpty);

  const englishBrowser = await pageWith(undefined, "ja");
  assert.equal(englishBrowser.querySelector("[data-fixture-id='m1'] [data-dcp-copy='text']").textContent, MESSAGES.en.copy);

  const chosenEnglish = await pageWith({ language: "en", languageChosen: true }, "ko-KR");
  assert.equal(chosenEnglish.querySelector("[data-fixture-id='m1'] [data-dcp-copy='text']").textContent, MESSAGES.en.copy);
  assert.equal(chosenEnglish.querySelector("[data-fixture-id='m5'] [data-dcp-copy='text']").textContent, MESSAGES.en.copyVisible);
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

test("a saved language change updates buttons already on the page", async () => {
  const dom = loadDom(`<div data-fixture="dot-screen">${threadHtml}</div>`);
  const doc = dom.window.document;
  let stored = { enabled: true, language: "auto" };
  let listener = null;
  const chrome = fakeChrome(stored, "en-US");
  chrome.storage.local.get = async () => ({ settings: stored });
  chrome.storage.onChanged.addListener = (fn) => {
    listener = fn;
  };
  const originals = { warn: console.warn, info: console.info };
  console.warn = () => {};
  console.info = () => {};
  try {
    await startApp({ chrome, window: dom.window, document: doc, adapter: createFixtureAdapter(doc), clipboard: createClipboard() });
    assert.equal(doc.querySelector("[data-fixture-id='m1'] [data-dcp-copy='text']").textContent, MESSAGES.en.copy);
    stored = { enabled: true, language: "ko", languageChosen: true };
    listener({ settings: { newValue: stored } }, "local");
    await flush();
    assert.equal(doc.querySelector("[data-fixture-id='m1'] [data-dcp-copy='text']").textContent, MESSAGES.ko.copy);
    assert.equal(doc.querySelectorAll("[data-fixture-id='m1'] [data-dcp-copy='text']").length, 1);
  } finally {
    Object.assign(console, originals);
  }
});

test("the started line shows the language in use and the stored settings", async () => {
  const dom = loadDom(`<div data-fixture="dot-screen">${threadHtml}</div>`);
  const doc = dom.window.document;
  const lines = [];
  const originals = { warn: console.warn, info: console.info };
  console.warn = () => {};
  console.info = (...args) => lines.push(args);
  try {
    await startApp({ chrome: fakeChrome({ language: "ko", enabled: true }, "ko-KR"), window: dom.window, document: doc, adapter: createFixtureAdapter(doc), clipboard: createClipboard() });
  } finally {
    Object.assign(console, originals);
  }
  const started = lines.find((args) => args[1] === "started");
  assert.ok(started);
  assert.equal(started[2].language, "ko");
  assert.deepEqual(started[2].storedSettings, { language: "ko", enabled: true });
});
