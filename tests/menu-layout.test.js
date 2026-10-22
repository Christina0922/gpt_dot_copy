import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createController } from "../extension/src/controller.js";
import { liveAdapter } from "../extension/src/live-adapter.js";
import { computeMenuPosition } from "../extension/src/position.js";
import { createClipboard, loadDom } from "./helpers/dom.js";

const fixture = readFileSync(new URL("./fixtures/dot-page-sanitized.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../extension/content/content.css", import.meta.url), "utf8");

const rect = (top, height, left = 100, width = 80) => ({ top, bottom: top + height, left, right: left + width, width, height, x: left, y: top });
const base = { width: 160, height: 64, viewportWidth: 420, viewportHeight: 640 };

test("the menu opens downward when there is room below the trigger", () => {
  const position = computeMenuPosition({ ...base, trigger: rect(100, 28), bounds: { top: 0, bottom: 520 } });
  assert.equal(position.placement, "below");
  assert.equal(position.top, 132);
});

test("the menu opens upward when the composer leaves too little room below", () => {
  const position = computeMenuPosition({ ...base, trigger: rect(470, 28), bounds: { top: 0, bottom: 520 } });
  assert.equal(position.placement, "above");
  assert.equal(position.top, 470 - 4 - 64);
  assert.ok(position.top + 64 <= 520);
});

test("with no full fit either way the menu takes the roomier side, and stays inside the window", () => {
  const position = computeMenuPosition({ ...base, trigger: rect(60, 28), bounds: { top: 30, bottom: 140 } });
  assert.equal(position.placement, "below");
  const right = computeMenuPosition({ ...base, trigger: rect(100, 28, 390), bounds: { top: 0, bottom: 520 } });
  assert.equal(right.left, 420 - 160 - 8);
});

test("a trigger scrolled out of the visible area hides the menu", () => {
  assert.equal(computeMenuPosition({ ...base, trigger: rect(530, 28), bounds: { top: 0, bottom: 520 } }).hidden, true);
  assert.equal(computeMenuPosition({ ...base, trigger: rect(-40, 28), bounds: { top: 0, bottom: 520 } }).hidden, true);
});

function mountWithLayout() {
  const dom = loadDom(fixture, "https://chatgpt.com/dots/home");
  const doc = dom.window.document;
  dom.window.innerWidth = 420;
  dom.window.innerHeight = 640;
  const layout = new Map();
  const realRect = dom.window.Element.prototype.getBoundingClientRect;
  dom.window.Element.prototype.getBoundingClientRect = function () {
    return layout.get(this) || realRect.call(this);
  };
  layout.set(doc.querySelector("[data-role='messages-scroll']"), rect(0, 520, 0, 420));
  layout.set(doc.querySelector("[data-role='composer']"), rect(520, 120, 0, 420));
  const controller = createController({ adapter: liveAdapter, document: doc, window: dom.window, clipboard: createClipboard(), getLanguage: () => "en" });
  controller.start();
  return { dom, doc, layout };
}

test("the bottom message's menu sits on <body>, opens upward above the composer, and returns when closed", async () => {
  const { dom, doc, layout } = mountWithLayout();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const slots = [...doc.querySelectorAll(".dcp-copy-slot")];
  const last = slots.at(-1);
  const toggle = last.querySelector("[data-dcp-copy-menu]");
  const menu = last.querySelector("[role='menu']");
  layout.set(toggle.parentElement, rect(480, 28));
  toggle.click();
  assert.equal(menu.parentElement, doc.body);
  assert.equal(menu.hidden, false);
  assert.equal(menu.dataset.dcpPlacement, "above");
  assert.ok(parseFloat(menu.style.top) + 72 <= 520, menu.style.top);

  // Scrolling repositions; scrolling the trigger out of view closes the menu.
  layout.set(toggle.parentElement, rect(100, 28));
  doc.dispatchEvent(new dom.window.Event("scroll"));
  assert.equal(menu.dataset.dcpPlacement, "below");
  assert.equal(menu.style.top, "132px");
  layout.set(toggle.parentElement, rect(560, 28));
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  assert.equal(menu.hidden, true);
  assert.equal(menu.parentElement, last);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("Dot replies show the short Copy label, with the long text in the tooltip and aria-label", async () => {
  const { doc } = mountWithLayout();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const button of doc.querySelectorAll("[data-dcp-copy]")) {
    assert.equal(button.textContent, "Copy");
    assert.ok(button.title.length > 0);
    assert.equal(button.title, button.getAttribute("aria-label"));
  }
  assert.ok([...doc.querySelectorAll("[data-dcp-copy]")].some((button) => button.title === "Copy the text currently shown"));
});

function rule(selector) {
  // Every block whose selector line starts with this selector, joined.
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = [...css.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, "g"))].map((match) => match[1]);
  assert.ok(bodies.length > 0, selector);
  return bodies.join("\n");
}

test("button labels never wrap, and the open menu is an opaque top layer", () => {
  assert.match(rule(".dcp-btn"), /white-space: nowrap/);
  assert.doesNotMatch(rule(".dcp-btn"), /overflow-wrap: anywhere/);
  assert.match(rule(".dcp-split"), /flex: none/);
  const menu = rule(".dcp-menu");
  assert.match(menu, /position: fixed/);
  assert.match(menu, /background-color: var\(--dcp-bg\)/);
  assert.match(menu, /z-index: 2147483600/);
});

test("colors follow ChatGPT's light and dark theme class as well as the system setting", () => {
  assert.match(css, /:root\.dark \.dcp-menu/);
  assert.match(css, /:root:not\(\.light\) \.dcp-menu/);
  for (const value of css.matchAll(/--dcp-bg: (#[0-9a-f]{6})/g)) assert.match(value[1], /^#[0-9a-f]{6}$/);
});
