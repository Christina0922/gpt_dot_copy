import assert from "node:assert/strict";
import test from "node:test";
import { createController } from "../extension/src/controller.js";
import { liveAdapter } from "../extension/src/live-adapter.js";
import { createClipboard, loadDom } from "./helpers/dom.js";

const dotHtml = `
  <div data-role="messages-scroll">
    <article data-message-id="u1">
      <div data-markdown-text-style="assistant-message"><p>사용자 문장</p></div>
      <time>1:00 AM</time>
      <button type="button" data-action="reply">Reply</button>
      <button type="button" data-action="toggle-reaction-picker">Choose a reaction</button>
    </article>
    <article data-message-id="d1">
      <div data-markdown-text-style="assistant-message">
        <p>닷 문장</p>
        <pre><code>function hello() {\n  return 1;\n}</code></pre>
      </div>
      <time>1:01 AM</time>
      <button type="button" data-action="toggle-reaction-picker">Choose a reaction</button>
      <button type="button" data-action="reply">Reply</button>
    </article>
    <article data-message-id="img1">
      <button type="button" data-action="open-image">Expand image.png</button>
      <img alt="">
    </article>
  </div>
  <div data-role="composer">
    <div contenteditable="true" role="textbox" aria-label="Message"></div>
    <button type="button" aria-label="Send">Send</button>
  </div>
`;

test("confirmed Dot landmarks activate copy buttons and leave image-only messages alone", async () => {
  const dom = loadDom(dotHtml, "https://chatgpt.com/dots/home");
  const doc = dom.window.document;
  assert.equal(liveAdapter.detect(doc).active, true);
  const controller = createController({
    adapter: liveAdapter,
    document: doc,
    window: dom.window,
    clipboard: createClipboard(),
    getLanguage: () => "ko"
  });
  controller.start();
  assert.equal(doc.querySelectorAll("[data-dcp-copy='text']").length, 2);
  assert.equal(doc.querySelector("[data-message-id='img1'] [data-dcp-copy='text']"), null);
  assert.equal(doc.querySelector("[data-message-id='u1'] [data-dcp-copy='text']").getAttribute("aria-label"), "복사");
  const userSlot = doc.querySelector("[data-message-id='u1'] .dcp-copy-slot");
  assert.equal(userSlot.parentElement.tagName, "P");
  assert.equal(userSlot.dataset.dcpPlacement, "inline");
  const dotSlot = doc.querySelector("[data-message-id='d1'] .dcp-copy-slot");
  assert.equal(dotSlot.dataset.dcpPlacement, "below");
  assert.equal(dotSlot.previousElementSibling.tagName, "PRE");
  assert.equal(doc.querySelector("[data-dcp-paste]").textContent, "붙여넣기");
  assert.equal(doc.querySelector("[data-dcp-paste]").parentElement.className, "dcp-anchor");
  const added = doc.createElement("p");
  added.textContent = "이어진 문장";
  doc.querySelector("[data-message-id='u1'] [data-markdown-text-style]").append(added);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.querySelectorAll("[data-message-id='u1'] [data-dcp-copy='text']").length, 1);
  assert.equal(added.lastElementChild, doc.querySelector("[data-message-id='u1'] .dcp-copy-slot"));
});

test("the dot paste button does not read the clipboard or change an empty composer", async () => {
  const dom = loadDom(dotHtml, "https://chatgpt.com/dots/home");
  const doc = dom.window.document;
  doc.hasFocus = () => true;
  const clipboard = createClipboard({ text: "DCP-CHECK" });
  const controller = createController({
    adapter: liveAdapter,
    document: doc,
    window: dom.window,
    clipboard,
    getLanguage: () => "ko"
  });
  controller.start();
  const editor = doc.querySelector("[contenteditable='true']");
  const send = doc.querySelector("button[aria-label='Send']");
  const paste = doc.querySelector("[data-dcp-paste]");
  send.disabled = false;
  send.setAttribute("aria-disabled", "false");
  paste.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(paste.disabled, true);
  assert.equal((editor.textContent || "").trim(), "");
  assert.equal(clipboard.calls.some((call) => call[0] === "read"), false);
  assert.match(paste.parentElement.querySelector(".dcp-status").textContent, /Ctrl\+V/);
  assert.equal(paste.parentElement.querySelector(".dcp-status").textContent.includes("붙여넣음"), false);
});

test("an existing multiline dot draft is left unchanged when Send is already enabled", async () => {
  const dom = loadDom(dotHtml, "https://chatgpt.com/dots/home");
  const doc = dom.window.document;
  const clipboard = createClipboard({ text: "DCP-CHECK" });
  const controller = createController({
    adapter: liveAdapter,
    document: doc,
    window: dom.window,
    clipboard,
    getLanguage: () => "ko"
  });
  controller.start();
  const editor = doc.querySelector("[contenteditable='true']");
  const first = doc.createElement("p");
  first.textContent = "첫째 문단";
  const second = doc.createElement("p");
  second.textContent = "둘째\n줄";
  editor.append(first, second);
  const before = editor.innerHTML;
  const send = doc.querySelector("button[aria-label='Send']");
  send.disabled = false;
  doc.querySelector("[data-dcp-paste]").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(editor.innerHTML, before);
  assert.equal(clipboard.calls.some((call) => call[0] === "read"), false);
  assert.equal(doc.querySelector(".dcp-anchor .dcp-status").textContent.includes("붙여넣음"), false);
});

test("a normal ChatGPT path does not receive Dot buttons", () => {
  const dom = loadDom(`<textarea id="prompt"></textarea><article><p>일반 대화</p></article>`, "https://chatgpt.com/c/abc");
  const controller = createController({
    adapter: liveAdapter,
    document: dom.window.document,
    window: dom.window,
    clipboard: createClipboard(),
    getLanguage: () => "en"
  });
  assert.equal(controller.start().active, false);
  assert.equal(dom.window.document.querySelector("[data-dcp-ui]"), null);
  assert.equal(dom.window.document.getElementById("prompt").value, "");
});
