import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createController } from "../extension/src/controller.js";
import { startApp } from "../extension/src/bootstrap.js";
import { wirePopup } from "../extension/src/popup-controller.js";
import { normalizeSettings } from "../extension/src/settings.js";
import { MESSAGES } from "../extension/src/i18n.js";
import { createClipboard, flush, loadDom } from "./helpers/dom.js";
import { createFixtureAdapter, threadHtml } from "./helpers/fixture.js";

function mount() {
  const dom = loadDom(`<div data-fixture="dot-screen">${threadHtml}</div>`);
  dom.window.document.hasFocus = () => true;
  return dom;
}

function fakeChrome(initial) {
  const state = { settings: initial };
  const listeners = [];
  return {
    state,
    emit(newValue) {
      for (const fn of listeners) fn({ settings: { newValue } }, "local");
    },
    storage: {
      local: {
        async get() {
          return { settings: state.settings };
        },
        async set(value) {
          state.settings = value.settings;
        }
      },
      onChanged: { addListener: (fn) => listeners.push(fn) }
    },
    i18n: { getUILanguage: () => "ko" }
  };
}

const slot = (doc, id) => doc.querySelector(`[data-fixture-id='${id}'] .dcp-copy-slot`);

test("settings default to text copy and accept only text or markdown", () => {
  assert.equal(normalizeSettings(null).copyFormat, "text");
  assert.equal(normalizeSettings({ copyFormat: "markdown" }).copyFormat, "markdown");
  assert.equal(normalizeSettings({ copyFormat: "html" }).copyFormat, "text");
});

test("main click copies plain text by default, and the menu copies Markdown", async () => {
  const dom = mount();
  const doc = dom.window.document;
  const clipboard = createClipboard();
  let format = "text";
  const saved = [];
  const controller = createController({
    adapter: createFixtureAdapter(doc),
    document: doc,
    window: dom.window,
    clipboard,
    getLanguage: () => "ko",
    getCopyFormat: () => format,
    setCopyFormat: (value) => {
      format = value;
      saved.push(value);
    }
  });
  controller.start();
  const ui = slot(doc, "m2");
  const main = ui.querySelector("[data-dcp-copy]");
  const toggle = ui.querySelector("[data-dcp-copy-menu]");
  const menu = ui.querySelector("[role='menu']");
  assert.equal(main.textContent, MESSAGES.ko.copy);
  assert.equal(toggle.getAttribute("aria-haspopup"), "menu");
  assert.equal(toggle.getAttribute("aria-label"), MESSAGES.ko.copyFormatMenu);
  assert.equal(menu.hidden, true);

  main.click();
  await flush();
  assert.match(clipboard.calls.at(-1)[1], /^설명입니다\.\n\n- 하나\n- 둘\n\nfunction hello/);

  toggle.click();
  assert.equal(menu.hidden, false);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  const items = [...menu.querySelectorAll("[role='menuitemradio']")];
  assert.deepEqual(items.map((item) => item.textContent), [MESSAGES.ko.copyAsText, MESSAGES.ko.copyAsMarkdown]);
  assert.equal(doc.activeElement, items[0]);
  items[1].click();
  await flush();
  assert.equal(clipboard.calls.at(-1)[1], "설명입니다.\n\n- 하나\n- 둘\n\n```\nfunction hello() {\n  return \"안녕\";\n}\n```");
  assert.deepEqual(saved, ["markdown"]);
  assert.equal(menu.hidden, true);
  assert.equal(doc.activeElement, toggle);

  // Every copy button now shows and uses the remembered format.
  assert.equal(slot(doc, "m1").querySelector("[data-dcp-copy]").textContent, MESSAGES.ko.copyMarkdown);
  assert.equal(slot(doc, "m5").querySelector("[data-dcp-copy]").textContent, MESSAGES.ko.copyMarkdown);
  assert.equal(slot(doc, "m5").querySelector("[data-dcp-copy]").getAttribute("aria-label"), MESSAGES.ko.copyShownMarkdown);
  assert.equal(items[1].getAttribute("aria-checked"), "true");
  main.click();
  await flush();
  assert.match(clipboard.calls.at(-1)[1], /```\nfunction hello/);
  assert.equal(doc.querySelector("[data-fixture-id='m2'] .dcp-status").textContent, MESSAGES.ko.copied);
});

test("format menu works from the keyboard and closes on Escape or an outside click", () => {
  const dom = mount();
  const doc = dom.window.document;
  const controller = createController({
    adapter: createFixtureAdapter(doc),
    document: doc,
    window: dom.window,
    clipboard: createClipboard(),
    getLanguage: () => "en",
    getCopyFormat: () => "markdown"
  });
  controller.start();
  const ui = slot(doc, "m1");
  const toggle = ui.querySelector("[data-dcp-copy-menu]");
  const menu = ui.querySelector("[role='menu']");
  const items = [...menu.querySelectorAll("[role='menuitemradio']")];
  const key = (target, name) => target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true }));

  key(toggle, "ArrowDown");
  assert.equal(menu.hidden, false);
  assert.equal(doc.activeElement, items[1], "focus starts on the checked format");
  key(items[1], "ArrowDown");
  assert.equal(doc.activeElement, items[0]);
  key(items[0], "Escape");
  assert.equal(menu.hidden, true);
  assert.equal(doc.activeElement, toggle);

  toggle.click();
  const other = slot(doc, "m2").querySelector("[data-dcp-copy-menu]");
  other.click();
  assert.equal(menu.hidden, true, "opening another menu closes the first");
  doc.body.dispatchEvent(new dom.window.Event("pointerdown", { bubbles: true }));
  assert.equal(slot(doc, "m2").querySelector("[role='menu']").hidden, true);
});

test("a generating reply disables both halves of the split button", () => {
  const dom = mount();
  const doc = dom.window.document;
  createController({
    adapter: createFixtureAdapter(doc),
    document: doc,
    window: dom.window,
    clipboard: createClipboard(),
    getLanguage: () => "ko"
  }).start();
  assert.equal(slot(doc, "m6").querySelector("[data-dcp-copy]").disabled, true);
  assert.equal(slot(doc, "m6").querySelector("[data-dcp-copy-menu]").disabled, true);
});

test("the page remembers the menu choice, and a format change does not rebuild the buttons", async () => {
  const dom = mount();
  const doc = dom.window.document;
  const chrome = fakeChrome({ enabled: true, language: "ko", languageChosen: true });
  const clipboard = createClipboard();
  await startApp({ chrome, window: dom.window, document: doc, adapter: createFixtureAdapter(doc), clipboard });
  const before = slot(doc, "m2");
  const beforeMenu = before.querySelector("[role='menu']");
  before.querySelector("[data-dcp-copy-menu]").click();
  beforeMenu.querySelectorAll("[role='menuitemradio']")[1].click();
  await flush();
  assert.equal(chrome.state.settings.copyFormat, "markdown");
  chrome.emit(chrome.state.settings);
  await flush();
  assert.equal(slot(doc, "m2"), before);
  assert.equal(before.querySelector(".dcp-status").textContent, MESSAGES.ko.copied);

  const reloaded = mount();
  await startApp({
    chrome,
    window: reloaded.window,
    document: reloaded.window.document,
    adapter: createFixtureAdapter(reloaded.window.document),
    clipboard
  });
  assert.equal(slot(reloaded.window.document, "m1").querySelector("[data-dcp-copy]").textContent, MESSAGES.ko.copyMarkdown);
});

test("popup shows and saves the default copy format", async () => {
  const html = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");
  const doc = new JSDOM(html, { url: "chrome-extension://test/popup/popup.html" }).window.document;
  const chrome = fakeChrome({ enabled: true, language: "en", copyFormat: "text" });
  chrome.permissions = {
    contains: async () => false,
    onRemoved: { addListener() {} }
  };
  await wirePopup(doc, { chrome, version: "0.2.0" }).init();
  const select = doc.querySelector("[data-setting='copyFormat']");
  assert.equal(doc.querySelector("[data-i18n='copyFormatLabel']").textContent, MESSAGES.en.copyFormatLabel);
  assert.deepEqual([...select.options].map((option) => option.textContent), [MESSAGES.en.copyFormatText, MESSAGES.en.copyFormatMarkdown]);
  assert.equal(select.value, "text");
  select.value = "markdown";
  select.dispatchEvent(new doc.defaultView.Event("change"));
  await flush();
  assert.equal(chrome.state.settings.copyFormat, "markdown");
  chrome.emit({ enabled: true, language: "en", copyFormat: "text" });
  assert.equal(select.value, "text");
});
