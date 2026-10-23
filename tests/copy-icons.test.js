import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createController } from "../extension/src/controller.js";
import { liveAdapter } from "../extension/src/live-adapter.js";
import { createIcon } from "../extension/src/icons.js";
import { extractPlainText } from "../extension/src/extract-text.js";
import { extractMarkdown } from "../extension/src/extract-markdown.js";
import { wirePopup } from "../extension/src/popup-controller.js";
import { normalizeSettings } from "../extension/src/settings.js";
import { MESSAGES } from "../extension/src/i18n.js";
import { createClipboard, flush, loadDom } from "./helpers/dom.js";
import { createFixtureAdapter, threadHtml } from "./helpers/fixture.js";

const css = readFileSync(new URL("../extension/content/content.css", import.meta.url), "utf8");
const dotFixture = readFileSync(new URL("./fixtures/dot-page-sanitized.html", import.meta.url), "utf8");

function mount() {
  const dom = loadDom(`<div data-fixture="dot-screen">${threadHtml}</div>`);
  dom.window.document.hasFocus = () => true;
  const held = [];
  const realSetTimeout = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (callback, delay) => {
    if (delay >= 1000) {
      held.push({ callback, delay });
      return held.length;
    }
    return realSetTimeout(callback, delay);
  };
  dom.window.clearTimeout = () => {};
  return { dom, doc: dom.window.document, held };
}

function start(doc, dom, { clipboard = createClipboard(), language = "en", adapter = createFixtureAdapter(doc) } = {}) {
  createController({ adapter, document: doc, window: dom.window, clipboard, getLanguage: () => language }).start();
  return clipboard;
}

const slot = (doc, id) => doc.querySelector(`[data-fixture-id='${id}'] .dcp-copy-slot`);

test("each message has one copy button and a closed Markdown menu", () => {
  const { dom, doc } = mount();
  start(doc, dom);
  const buttons = [...slot(doc, "m2").querySelectorAll("button")];
  assert.deepEqual(buttons.map((button) => button.dataset.dcpCopy || button.className), ["text", "dcp-menu-btn", "markdown"]);
  assert.equal(slot(doc, "m2").querySelector("[data-dcp-copy='text']").textContent, MESSAGES.en.copy);
  assert.equal(slot(doc, "m2").querySelector("[role='menu']").hidden, true);
  assert.equal(slot(doc, "m2").querySelector("[data-dcp-copy='markdown']").textContent, MESSAGES.en.copyAsMarkdown);
  assert.equal(doc.querySelectorAll("[data-fixture-id='m2'] [data-dcp-copy='text']").length, 1);
});

test("Korean labels use 복사 and 마크다운으로 복사", () => {
  const { dom, doc } = mount();
  start(doc, dom, { language: "ko" });
  assert.equal(slot(doc, "m1").querySelector("[data-dcp-copy='text']").textContent, "복사");
  assert.equal(slot(doc, "m1").querySelector("[data-dcp-copy='markdown']").textContent, "마크다운으로 복사");
  assert.equal(slot(doc, "m5").querySelector("[data-dcp-copy='text']").textContent, "현재 표시된 내용 복사");
});

test("the copy button writes plain text and the menu writes Markdown", async () => {
  const { dom, doc, held } = mount();
  const clipboard = start(doc, dom);
  const text = slot(doc, "m2").querySelector("[data-dcp-copy='text']");
  const menuButton = slot(doc, "m2").querySelector(".dcp-menu-btn");
  const markdown = slot(doc, "m2").querySelector("[data-dcp-copy='markdown']");

  text.click();
  await flush();
  assert.equal(clipboard.calls.at(-1)[1], "설명입니다.\n\n- 하나\n- 둘\n\nfunction hello() {\n  return \"안녕\";\n}");
  assert.equal(slot(doc, "m2").querySelector(".dcp-status").textContent, MESSAGES.en.copied);
  const reset = held.find((timer) => timer.delay === 2000);
  assert.ok(reset);
  reset.callback();
  assert.equal(text.textContent, MESSAGES.en.copy);

  menuButton.click();
  assert.equal(markdown.parentElement.hidden, false);
  markdown.click();
  await flush();
  assert.equal(markdown.parentElement.hidden, true);
  assert.equal(clipboard.calls.at(-1)[1], "설명입니다.\n\n- 하나\n- 둘\n\n```\nfunction hello() {\n  return \"안녕\";\n}\n```");
});

test("a failed copy is not labeled Copied and returns to the original label", async () => {
  const { dom, doc, held } = mount();
  dom.window.document.execCommand = () => false;
  const clipboard = createClipboard();
  clipboard.state.writeError = "NotAllowedError";
  start(doc, dom, { clipboard });
  const button = slot(doc, "m1").querySelector("[data-dcp-copy='text']");
  button.click();
  await flush();
  const status = slot(doc, "m1").querySelector(".dcp-status");
  assert.equal(status.textContent, MESSAGES.en.copyFailed);
  assert.equal(status.dataset.dcpState, "error");
  assert.equal(status.textContent.includes(MESSAGES.en.copied), false);
  held.find((timer) => timer.delay === 10000).callback();
  assert.equal(status.textContent, "");
  assert.equal(button.textContent, MESSAGES.en.copy);
});

test("a generating reply disables copy and the Markdown menu", () => {
  const { dom, doc } = mount();
  start(doc, dom);
  for (const button of slot(doc, "m6").querySelectorAll("button")) {
    assert.equal(button.disabled, true);
  }
  assert.equal(slot(doc, "m6").querySelector("[data-dcp-copy='text']").textContent, MESSAGES.en.copyBusy);
});

test("copy controls are keyboard buttons and Escape closes the menu", () => {
  const { dom, doc } = mount();
  start(doc, dom);
  const menuButton = slot(doc, "m2").querySelector(".dcp-menu-btn");
  const item = slot(doc, "m2").querySelector("[data-dcp-copy='markdown']");
  for (const button of slot(doc, "m2").querySelectorAll("button")) {
    assert.equal(button.type, "button");
    assert.equal(button.tabIndex, 0);
  }
  menuButton.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  assert.equal(item.parentElement.hidden, false);
  item.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(item.parentElement.hidden, true);
});

test("icons remain inline SVG with no external files", () => {
  const { window } = new JSDOM("");
  for (const name of ["copy", "copy-md", "check", "warning"]) {
    const svg = createIcon(window.document, name);
    assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(svg.getAttribute("aria-hidden"), "true");
    assert.equal(svg.querySelector("use, image, text"), null, name);
  }
});

function mountDot(t, edit = (doc) => doc, clipboard = createClipboard()) {
  const dom = loadDom(dotFixture, "https://chatgpt.com/dots/home");
  const doc = dom.window.document;
  doc.hasFocus = () => true;
  edit(doc, dom);
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  t.after(() => {
    console.warn = original;
  });
  createController({ adapter: liveAdapter, document: doc, window: dom.window, clipboard, getLanguage: () => "en" }).start();
  return { dom, doc, clipboard, warnings };
}

const copyRows = (doc) => [...doc.querySelectorAll("article")].filter((row) => row.querySelector(".dcp-copy-slot"));

test("on the saved Dot page the control follows the message end and does not cover it with fixed positioning", (t) => {
  const { doc } = mountDot(t);
  assert.ok(copyRows(doc).length > 0);
  for (const row of copyRows(doc)) {
    const found = row.querySelector(".dcp-copy-slot");
    assert.equal(found.tagName, "SPAN");
    assert.notEqual(found.parentElement, row.querySelector(".message-inline-actions"));
    assert.ok(found.dataset.dcpPlacement === "inline" || found.dataset.dcpPlacement === "below");
    assert.equal(css.includes("position: fixed"), true);
    assert.equal(/\.dcp-copy-slot \{[^}]*position:\s*fixed/.test(css), false);
  }
});

test("copied text and Markdown contain nothing from the buttons", async (t) => {
  let expected = [];
  const { doc, clipboard } = mountDot(t, (page) => {
    expected = [...page.querySelectorAll("article")].map((row) => {
      const body = liveAdapter.getBodyElement(row);
      return body ? [extractPlainText(body), extractMarkdown(body)] : null;
    });
  });
  const rows = [...doc.querySelectorAll("article")];
  for (const row of copyRows(doc)) {
    const [text, markdown] = expected[rows.indexOf(row)];
    row.querySelector("[data-dcp-copy='text']").click();
    await flush();
    assert.equal(clipboard.calls.at(-1)[1], text);
    row.querySelector(".dcp-menu-btn").click();
    row.querySelector("[data-dcp-copy='markdown']").click();
    await flush();
    assert.equal(clipboard.calls.at(-1)[1], markdown);
    assert.equal(markdown.includes("MD"), false);
  }
});

test("copy controls keep a visible focus outline in both themes", () => {
  assert.match(css, /\.dcp-btn:focus-visible/);
  assert.match(css, /\.dcp-menu-btn:focus-visible/);
  assert.match(css, /:root\.dark \.dcp-copy-slot/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /\.dcp-copy-slot\[data-dcp-placement="below"\]/);
});

test("the copy format is no longer a setting, and the popup has no format control", async () => {
  assert.equal("copyFormat" in normalizeSettings({ copyFormat: "markdown" }), false);
  const html = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");
  const doc = new JSDOM(html, { url: "chrome-extension://test/popup/popup.html" }).window.document;
  const chrome = {
    storage: { local: { get: async () => ({ settings: { copyFormat: "markdown" } }), set: async () => {} }, onChanged: { addListener() {} } },
    permissions: { contains: async () => false, onRemoved: { addListener() {} } }
  };
  await wirePopup(doc, { chrome, version: "0.2.1" }).init();
  assert.equal(doc.querySelector("[data-setting='copyFormat']"), null);
});
