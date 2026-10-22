import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createController } from "../extension/src/controller.js";
import { findSendButton, liveAdapter } from "../extension/src/live-adapter.js";
import { startApp } from "../extension/src/bootstrap.js";
import { createClipboard, flush, loadDom } from "./helpers/dom.js";

// Structure of a saved Dot page with every sentence, id, time, and link replaced (see the file header).
const fixture = readFileSync(new URL("./fixtures/dot-page-sanitized.html", import.meta.url), "utf8");

function mountDot(wrap = (html) => html) {
  const dom = loadDom(wrap(fixture), "https://chatgpt.com/dots/home");
  let clock = 0;
  // Each flush stands for one animation frame, so loop detection sees realistic timing.
  dom.window.performance.now = () => clock;
  const tick = async () => {
    clock += 16;
    await flush();
  };
  return { dom, doc: dom.window.document, tick };
}

function captureLogs(t) {
  const logged = [];
  const originals = { error: console.error, warn: console.warn };
  console.error = (...args) => logged.push(["error", ...args]);
  console.warn = (...args) => logged.push(["warn", ...args]);
  t.after(() => Object.assign(console, originals));
  return logged;
}

function startController(dom) {
  const controller = createController({
    adapter: liveAdapter,
    document: dom.window.document,
    window: dom.window,
    clipboard: createClipboard(),
    getLanguage: () => "ko"
  });
  controller.start();
  return controller;
}

const rows = (doc) => [...doc.querySelectorAll("article.message-row")];
const rowsWithoutButton = (doc) => rows(doc).filter((row) => !row.querySelector("[data-dcp-copy]")).map((row) => row.dataset.messageId);
const buttonCounts = (doc) => rows(doc).map((row) => row.querySelectorAll("[data-dcp-copy]").length);

// Adds a row the way the page does: an empty row first, then the reply streamed in pieces.
async function streamRow(doc, tick, index, { author = index % 2 ? "dot" : "user", chunks = 8 } = {}) {
  const list = doc.querySelector(".message-list");
  const template = rows(doc).find((row) => {
    const actions = [...row.querySelectorAll("[data-action]")].map((node) => node.dataset.action);
    return !actions.includes("open-image") && (author === "dot" ? actions[0] === "toggle-reaction-picker" : actions[0] === "reply");
  });
  const row = template.cloneNode(true);
  row.querySelectorAll("[data-dcp-ui]").forEach((node) => node.remove());
  const id = `new-${index}`;
  row.dataset.messageId = id;
  row.querySelectorAll("[data-message-id]").forEach((node) => node.setAttribute("data-message-id", `${id}~part`));
  const root = row.querySelector("[data-markdown-text-style]");
  root.replaceChildren();
  const actions = row.querySelector(".message-inline-actions");
  const actionButtons = [...actions.children];
  actions.replaceChildren();
  const typing = list.querySelector(".typing-indicator");
  if (index % 5 === 0) {
    const divider = doc.createElement("div");
    divider.className = "timestamp-divider";
    divider.textContent = "라벨";
    list.insertBefore(divider, typing);
  }
  list.insertBefore(row, typing);
  await tick();

  const inner = doc.createElement("div");
  inner.className = "max-w-full";
  inner.setAttribute("data-markdown-text-style", "assistant-message");
  root.append(inner);
  let paragraph = doc.createElement("p");
  paragraph.className = "Paragraph-kKnbIo";
  inner.append(paragraph);
  const text = doc.createTextNode("");
  paragraph.append(text);
  for (let chunk = 1; chunk <= chunks; chunk += 1) {
    text.nodeValue += `가짜 조각 ${chunk} `;
    if (chunk === Math.ceil(chunks / 2)) {
      paragraph = doc.createElement("p");
      paragraph.className = "Paragraph-kKnbIo";
      paragraph.append(doc.createTextNode("가짜 다음 문단 "));
      inner.append(paragraph);
    }
    await tick();
  }
  actions.append(...actionButtons);
  await tick();
}

test("buttons keep attaching while many replies stream into the saved Dot structure", async (t) => {
  const logged = captureLogs(t);
  const { dom, doc, tick } = mountDot();
  const controller = startController(dom);
  assert.deepEqual(rowsWithoutButton(doc), []);
  for (let index = 1; index <= 40; index += 1) await streamRow(doc, tick, index);
  assert.ok(controller.scanCount > 300, `scans ${controller.scanCount}`);
  assert.deepEqual(rowsWithoutButton(doc), []);
  assert.ok(buttonCounts(doc).every((count) => count === 1));
  assert.deepEqual(logged, []);
});

test("watching resumes when the page swaps the message list root for a new one", async (t) => {
  const logged = captureLogs(t);
  const { dom, doc, tick } = mountDot();
  startController(dom);
  const oldRoot = doc.querySelector("[data-role='messages-scroll']");
  const parent = oldRoot.parentElement;
  const nextRoot = oldRoot.cloneNode(true);
  nextRoot.querySelectorAll("[data-dcp-ui]").forEach((node) => node.remove());
  oldRoot.remove();
  await tick();
  parent.insertBefore(nextRoot, parent.firstChild);
  await tick();
  await tick();
  await streamRow(doc, tick, 1);
  assert.deepEqual(rowsWithoutButton(doc), []);
  const events = logged.filter((entry) => entry[1] === "[Dot Copy Paste]").map((entry) => [entry[0], entry[2], entry[3]?.reason]);
  assert.deepEqual(events, [["warn", "paused", "message-list-removed"], ["warn", "resumed", "message-list-found"]]);
});

test("watching resumes when an ancestor of the message list is replaced", async (t) => {
  const logged = captureLogs(t);
  const { dom, doc, tick } = mountDot((html) => `<main id="shell"><div id="pane">${html}</div></main>`);
  startController(dom);
  const pane = doc.getElementById("pane");
  const nextPane = pane.cloneNode(true);
  nextPane.querySelectorAll("[data-dcp-ui]").forEach((node) => node.remove());
  pane.replaceWith(nextPane);
  await tick();
  await tick();
  await streamRow(doc, tick, 1);
  assert.deepEqual(rowsWithoutButton(doc), []);
  const events = logged.filter((entry) => entry[1] === "[Dot Copy Paste]").map((entry) => [entry[0], entry[2], entry[3]?.reason]);
  assert.deepEqual(events, [["warn", "paused", "message-list-removed"], ["warn", "resumed", "message-list-found"]]);
});

test("buttons still attach when animation frames do not run, as in a background tab", async (t) => {
  captureLogs(t);
  const { dom, doc, tick } = mountDot();
  startController(dom);
  dom.window.requestAnimationFrame = () => 1;
  await streamRow(doc, tick, 1);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.deepEqual(rowsWithoutButton(doc), []);
});

test("back-to-back navigations leave exactly one controller and one button per row", async (t) => {
  captureLogs(t);
  const { dom, doc, tick } = mountDot();
  const chrome = {
    storage: {
      local: { get: async () => ({ settings: { enabled: true, language: "ko" } }), set: async () => {} },
      onChanged: { addListener() {} }
    },
    i18n: { getUILanguage: () => "ko" }
  };
  await startApp({ chrome, window: dom.window, document: doc, adapter: liveAdapter, clipboard: createClipboard() });
  dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
  dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
  await flush();
  await flush();
  await streamRow(doc, tick, 1);
  await streamRow(doc, tick, 2);
  assert.deepEqual(rowsWithoutButton(doc), []);
  assert.ok(buttonCounts(doc).every((count) => count === 1), JSON.stringify(buttonCounts(doc)));
});

function dotChrome() {
  return {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener() {} }
    }
  };
}

function captureAll(t) {
  const logged = captureLogs(t);
  const original = console.info;
  console.info = (...args) => logged.push(["info", ...args]);
  t.after(() => {
    console.info = original;
  });
  return logged;
}

const events = (logged) => logged.map((entry) => entry[2]);
const entry = (logged, name) => logged.find((item) => item[2] === name)?.[3];

test("the send button on a Korean page is found without its English label", () => {
  const { doc } = mountDot();
  const composer = doc.querySelector("[data-role='composer']");
  const send = findSendButton(composer);
  assert.ok(send);
  assert.equal(send.getAttribute("aria-label"), "보내기");
  const editor = composer.querySelector("[contenteditable='true']");
  assert.equal(liveAdapter.composerHasDraft(editor), false);
  send.disabled = false;
  send.removeAttribute("aria-disabled");
  assert.equal(liveAdapter.composerHasDraft(editor), true);
});

test("the send button is found by its label in any known language when no structural hint exists", () => {
  for (const label of ["Send", "보내기", "send message"]) {
    const { doc } = mountDot((html) => html.replace(/bg-composer-primary/g, "x").replace('aria-label="보내기"', `aria-label="${label}"`));
    assert.ok(findSendButton(doc.querySelector("[data-role='composer']")), label);
  }
});

test("a page that renders the Dot landmarks late still reaches started", async (t) => {
  const logged = captureAll(t);
  const { dom, doc } = mountDot();
  const scroll = doc.querySelector("[data-role='messages-scroll']");
  const composer = doc.querySelector("[data-role='composer']");
  const scrollParent = scroll.parentNode;
  const composerParent = composer.parentNode;
  scroll.remove();
  composer.remove();
  const result = await startApp({ chrome: dotChrome(), window: dom.window, document: doc, adapter: liveAdapter, clipboard: createClipboard() });
  assert.equal(result.active, false);
  assert.deepEqual(entry(logged, "waiting").missing, ["messages-scroll", "composer"]);

  scrollParent.append(scroll);
  await flush();
  assert.ok(!events(logged).includes("started"));
  composerParent.append(composer);
  await flush();
  assert.ok(events(logged).includes("started"), JSON.stringify(events(logged)));
  assert.equal(typeof entry(logged, "started").waitedMs, "number");
  assert.ok(doc.querySelector("[data-dcp-copy]"));
});

test("a composer that becomes editable after it is inserted still reaches started", async (t) => {
  const logged = captureAll(t);
  const { dom, doc } = mountDot();
  const editor = doc.querySelector("[data-role='composer'] [contenteditable='true']");
  editor.setAttribute("contenteditable", "false");
  await startApp({ chrome: dotChrome(), window: dom.window, document: doc, adapter: liveAdapter, clipboard: createClipboard() });
  assert.deepEqual(entry(logged, "waiting").missing, ["composer-textbox"]);
  editor.setAttribute("contenteditable", "true");
  await flush();
  assert.ok(events(logged).includes("started"), JSON.stringify(events(logged)));
});

test("a page that keeps waiting logs what is still missing", async (t) => {
  const logged = captureAll(t);
  const { dom, doc } = mountDot();
  doc.querySelector("[data-role='composer']").remove();
  const later = [];
  const realSetTimeout = dom.window.setTimeout.bind(dom.window);
  dom.window.setTimeout = (callback, delay) => {
    if (delay >= 3000) {
      later.push([callback, delay]);
      return 0;
    }
    return realSetTimeout(callback, delay);
  };
  await startApp({ chrome: dotChrome(), window: dom.window, document: doc, adapter: liveAdapter, clipboard: createClipboard() });
  assert.deepEqual(later.map(([, delay]) => delay), [3000, 10000, 30000]);
  later[0][0]();
  const still = entry(logged, "still-waiting");
  assert.equal(still.reason, "dot-landmarks-missing");
  assert.deepEqual(still.missing, ["composer"]);
  assert.equal(still.waitedMs, 3000);
  assert.equal(still.path, "/dots/home");
});
