import assert from "node:assert/strict";
import test from "node:test";
import { createController } from "../extension/src/controller.js";
import { liveAdapter } from "../extension/src/live-adapter.js";
import { createClipboard, flush, loadDom } from "./helpers/dom.js";

const SECRET = "대화 본문 비밀 문장";

function dotPage(count) {
  const articles = Array.from({ length: count }, (_, index) => `
    <article data-message-id="m${index + 1}"><div data-markdown-text-style="x"><p>${SECRET} ${index + 1}</p></div></article>`).join("");
  const dom = loadDom(`
    <div data-role="messages-scroll">${articles}</div>
    <div data-role="composer"><div contenteditable="true" role="textbox"></div></div>
  `, "https://chatgpt.com/dots/home");
  return { dom, doc: dom.window.document };
}

function captureErrors(t) {
  const logged = [];
  const originals = { error: console.error, warn: console.warn };
  console.error = (...args) => logged.push(args);
  console.warn = (...args) => logged.push(args);
  t.after(() => Object.assign(console, originals));
  return logged;
}

function start(dom, adapter = liveAdapter) {
  const controller = createController({
    adapter,
    document: dom.window.document,
    window: dom.window,
    clipboard: createClipboard(),
    getLanguage: () => "ko"
  });
  controller.start();
  return controller;
}

function addMessage(doc, id) {
  const article = doc.createElement("article");
  article.setAttribute("data-message-id", id);
  const body = doc.createElement("div");
  body.setAttribute("data-markdown-text-style", "x");
  const p = doc.createElement("p");
  p.textContent = `${SECRET} ${id}`;
  body.append(p);
  article.append(body);
  doc.querySelector("[data-role='messages-scroll']").append(article);
}

const withoutButton = (doc) => [...doc.querySelectorAll("article")].filter((a) => !a.querySelector("[data-dcp-copy='text']")).map((a) => a.dataset.messageId);

test("a long session keeps adding copy buttons past the old 40-refresh cap", async (t) => {
  const logged = captureErrors(t);
  const { dom, doc } = dotPage(0);
  const controller = start(dom);
  for (let index = 1; index <= 60; index += 1) {
    addMessage(doc, `n${index}`);
    await flush();
  }
  assert.ok(controller.scanCount > 40);
  assert.deepEqual(withoutButton(doc), []);
  assert.deepEqual(logged, []);
});

test("an error on one message skips only that message and logs where it happened without message text", async (t) => {
  const logged = captureErrors(t);
  const { dom, doc } = dotPage(3);
  const adapter = {
    ...liveAdapter,
    getBodyElement(message) {
      if (message.dataset.messageId === "m2") throw new TypeError("broken body lookup");
      return liveAdapter.getBodyElement(message);
    }
  };
  start(dom, adapter);
  assert.deepEqual(withoutButton(doc), ["m2"]);

  const [prefix, stage, detail] = logged[0];
  assert.equal(prefix, "[Dot Copy Paste]");
  assert.equal(stage, "copy-button");
  assert.equal(detail.name, "TypeError");
  assert.equal(detail.message, "broken body lookup");
  assert.match(detail.stack, /getBodyElement/);
  assert.deepEqual(detail.node, { tag: "article", role: null, inMessage: true, messageId: "m2", isMessage: true });
  assert.equal(JSON.stringify(logged).includes(SECRET), false);

  // Observing continues: a new message still gets its button.
  addMessage(doc, "m4");
  await flush();
  assert.deepEqual(withoutButton(doc), ["m2"]);
});

test("the same error repeating quickly stops observing and says so", async (t) => {
  const logged = captureErrors(t);
  const { dom, doc } = dotPage(0);
  const adapter = {
    ...liveAdapter,
    getBodyElement(message) {
      if (message.dataset.messageId.startsWith("bad")) throw new RangeError("always fails");
      return liveAdapter.getBodyElement(message);
    }
  };
  start(dom, adapter);
  for (let index = 1; index <= 5; index += 1) {
    addMessage(doc, `bad${index}`);
    await flush();
  }
  const stopped = logged.find((args) => args[1] === "stopped");
  assert.ok(stopped);
  assert.equal(stopped[2].reason, "repeated-error");
  assert.equal(stopped[2].name, "RangeError");
  assert.equal(logged.filter((args) => args[1] === "copy-button").length, 5);

  addMessage(doc, "good");
  await flush();
  assert.ok(withoutButton(doc).includes("good"));
});

test("different errors spread out in time do not stop observing", async (t) => {
  captureErrors(t);
  const { dom, doc } = dotPage(0);
  let clock = 0;
  dom.window.performance.now = () => clock;
  const adapter = {
    ...liveAdapter,
    getBodyElement(message) {
      if (message.dataset.messageId.startsWith("bad")) throw new RangeError("always fails");
      return liveAdapter.getBodyElement(message);
    }
  };
  start(dom, adapter);
  for (let index = 1; index <= 8; index += 1) {
    clock += 1000;
    addMessage(doc, `bad${index}`);
    await flush();
  }
  addMessage(doc, "good");
  await flush();
  assert.equal(withoutButton(doc).includes("good"), false);
});

test("a page that keeps removing the button pauses observing instead of looping", async (t) => {
  const logged = captureErrors(t);
  const { dom, doc } = dotPage(1);
  const body = doc.querySelector("article [data-markdown-text-style]");
  let removals = 0;
  const fighter = new dom.window.MutationObserver(() => {
    const slot = body.querySelector(".dcp-copy-slot");
    if (slot && removals < 1000) {
      removals += 1;
      slot.remove();
    }
  });
  fighter.observe(body, { childList: true });
  start(dom);
  for (let index = 0; index < 50 && !logged.some((args) => args[1] === "paused"); index += 1) await flush();
  fighter.disconnect();
  const paused = logged.find((args) => args[1] === "paused");
  assert.ok(paused, "pause was logged");
  assert.equal(paused[2].reason, "observer-loop");
  assert.ok(removals < 1000);
});
