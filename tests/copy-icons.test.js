import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createController } from "../extension/src/controller.js";
import { liveAdapter } from "../extension/src/live-adapter.js";
import { createIcon } from "../extension/src/icons.js";
import { wirePopup } from "../extension/src/popup-controller.js";
import { normalizeSettings } from "../extension/src/settings.js";
import { MESSAGES } from "../extension/src/i18n.js";
import { createClipboard, flush, loadDom } from "./helpers/dom.js";
import { createFixtureAdapter, threadHtml } from "./helpers/fixture.js";

const css = readFileSync(new URL("../extension/content/content.css", import.meta.url), "utf8");
const dotFixture = readFileSync(new URL("./fixtures/dot-page-sanitized.html", import.meta.url), "utf8");

// Timers of a second or more are held so the icon reset can be run on demand.
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
const icon = (button) => button.querySelector("svg").dataset.dcpIcon;

test("each message gets a text icon and a Markdown icon, with matching tooltip and aria-label", () => {
  const { dom, doc } = mount();
  start(doc, dom);
  const buttons = [...slot(doc, "m2").querySelectorAll("button")];
  assert.deepEqual(buttons.map((button) => button.dataset.dcpCopy), ["text", "markdown"]);
  assert.deepEqual(buttons.map(icon), ["copy", "copy-md"]);
  assert.deepEqual(buttons.map((button) => button.title), [MESSAGES.en.copyAsText, MESSAGES.en.copyAsMarkdown]);
  assert.deepEqual(buttons.map((button) => button.getAttribute("aria-label")), [MESSAGES.en.copyAsText, MESSAGES.en.copyAsMarkdown]);
  assert.equal(doc.querySelector("[data-dcp-copy-menu], [role='menu']"), null);
});

test("Korean tooltips read 텍스트로 복사 and 마크다운으로 복사", () => {
  const { dom, doc } = mount();
  start(doc, dom, { language: "ko" });
  const buttons = [...slot(doc, "m1").querySelectorAll("button")];
  assert.deepEqual(buttons.map((button) => button.title), ["텍스트로 복사", "마크다운으로 복사"]);
});

test("each icon copies its own format at once, then shows a check and returns to the copy icon", async () => {
  const { dom, doc, held } = mount();
  const clipboard = start(doc, dom);
  const [text, markdown] = slot(doc, "m2").querySelectorAll("button");

  text.click();
  await flush();
  assert.equal(clipboard.calls.at(-1)[1], "설명입니다.\n\n- 하나\n- 둘\n\nfunction hello() {\n  return \"안녕\";\n}");
  assert.equal(icon(text), "check");
  assert.equal(text.dataset.dcpResult, "success");
  assert.equal(icon(markdown), "copy-md");
  const reset = held.find((timer) => timer.delay >= 1000 && timer.delay <= 2000);
  assert.ok(reset, "the check stays for one to two seconds");
  reset.callback();
  assert.equal(icon(text), "copy");
  assert.equal(text.dataset.dcpResult, undefined);

  markdown.click();
  await flush();
  assert.equal(clipboard.calls.at(-1)[1], "설명입니다.\n\n- 하나\n- 둘\n\n```\nfunction hello() {\n  return \"안녕\";\n}\n```");
  assert.equal(icon(markdown), "check");
  assert.equal(icon(text), "copy");
});

test("a failed copy shows a warning icon and the failure message", async () => {
  const { dom, doc } = mount();
  dom.window.document.execCommand = () => false;
  const clipboard = createClipboard();
  clipboard.state.writeError = "NotAllowedError";
  start(doc, dom, { clipboard });
  const button = slot(doc, "m1").querySelector("[data-dcp-copy='text']");
  button.click();
  await flush();
  assert.equal(icon(button), "warning");
  assert.equal(button.dataset.dcpResult, "error");
  assert.equal(slot(doc, "m1").querySelector(".dcp-status").textContent, MESSAGES.en.copyFailed);
});

test("a generating reply disables both icons and explains why", () => {
  const { dom, doc } = mount();
  start(doc, dom);
  for (const button of slot(doc, "m6").querySelectorAll("button")) {
    assert.equal(button.disabled, true);
    assert.equal(button.title, MESSAGES.en.copyBusy);
  }
});

test("the icons are native buttons, so Tab reaches them and Enter or Space presses them", () => {
  const { dom, doc } = mount();
  start(doc, dom);
  for (const button of slot(doc, "m2").querySelectorAll("button")) {
    assert.equal(button.type, "button");
    assert.equal(button.tabIndex, 0);
  }
});

test("icons are inline SVG drawn from paths, with no files, fonts, or text nodes", () => {
  const { window } = new JSDOM("");
  for (const name of ["copy", "copy-md", "check", "warning"]) {
    const svg = createIcon(window.document, name);
    assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(svg.getAttribute("aria-hidden"), "true");
    assert.ok(svg.children.length > 0, name);
    assert.equal(svg.querySelector("use, image, text"), null, name);
    assert.equal(svg.textContent, "", name);
  }
  const plain = createIcon(window.document, "copy").innerHTML;
  assert.ok(createIcon(window.document, "copy-md").innerHTML.startsWith(plain), "the MD icon is the copy icon plus letters");
});

test("on the saved Dot structure the icons sit last in the bubble body: right for the user, left for Dot", () => {
  const dom = loadDom(dotFixture, "https://chatgpt.com/dots/home");
  const doc = dom.window.document;
  createController({ adapter: liveAdapter, document: doc, window: dom.window, clipboard: createClipboard(), getLanguage: () => "en" }).start();
  const authors = new Set();
  for (const row of doc.querySelectorAll("article")) {
    const found = row.querySelector(".dcp-copy-slot");
    if (!found) continue;
    assert.equal(found.tagName, "DIV");
    assert.equal(found.parentElement, liveAdapter.getBodyElement(row));
    assert.equal(found.parentElement.lastElementChild, found);
    assert.equal(found.dataset.dcpAuthor, liveAdapter.getAuthor(row));
    authors.add(found.dataset.dcpAuthor);
  }
  assert.deepEqual([...authors].sort(), ["dot", "user"]);
});

test("the icon row is its own line with the same gap everywhere, and user rows align right", () => {
  const slotRule = css.match(/\n\.dcp-copy-slot \{([^}]*)\}/g).join("\n");
  assert.match(slotRule, /display: flex/);
  assert.match(slotRule, /margin: 6px 0 0/);
  assert.match(css, /\.dcp-copy-slot\[data-dcp-author="user"\] \{\s*justify-content: flex-end;/);
  assert.match(css, /\.dcp-icon \{[^}]*width: 16px/);
  assert.match(css, /:root\.dark \.dcp-copy-slot/);
  assert.doesNotMatch(css, /dcp-menu|dcp-split/);
});

test("the copy format is no longer a setting, and the popup has no format control", async () => {
  assert.equal("copyFormat" in normalizeSettings({ copyFormat: "markdown" }), false);
  const html = readFileSync(new URL("../extension/popup/popup.html", import.meta.url), "utf8");
  const doc = new JSDOM(html, { url: "chrome-extension://test/popup/popup.html" }).window.document;
  const chrome = {
    storage: { local: { get: async () => ({ settings: { copyFormat: "markdown" } }), set: async () => {} }, onChanged: { addListener() {} } },
    permissions: { contains: async () => false, onRemoved: { addListener() {} } }
  };
  await wirePopup(doc, { chrome, version: "0.2.0" }).init();
  assert.equal(doc.querySelector("[data-setting='copyFormat']"), null);
  for (const key of ["copyFormatLabel", "copyFormatMenu", "copyShown", "copyMarkdown"]) assert.equal(key in MESSAGES.en, false, key);
});
