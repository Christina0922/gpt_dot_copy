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
  assert.equal(doc.querySelectorAll("[data-dcp-copy]").length, 2);
  assert.equal(doc.querySelector("[data-message-id='img1'] [data-dcp-copy]"), null);
  assert.equal(doc.querySelector("[data-message-id='u1'] [data-dcp-copy]").textContent, "복사");
  const userSlot = doc.querySelector("[data-message-id='u1'] .dcp-copy-slot");
  assert.equal(userSlot.dataset.dcpPlacement, "inline");
  assert.equal(userSlot.parentElement.tagName, "P");
  const dotSlot = doc.querySelector("[data-message-id='d1'] .dcp-copy-slot");
  assert.equal(dotSlot.dataset.dcpPlacement, "below");
  assert.equal(dotSlot.previousElementSibling.tagName, "PRE");
  assert.equal(doc.querySelector("[data-dcp-paste]").textContent, "붙여넣기");
  assert.equal(doc.querySelector("[data-dcp-paste]").parentElement.className, "dcp-anchor");
  const added = doc.createElement("p");
  added.textContent = "이어진 문장";
  doc.querySelector("[data-message-id='u1'] [data-markdown-text-style]").append(added);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(doc.querySelectorAll("[data-message-id='u1'] [data-dcp-copy]").length, 1);
  assert.equal(doc.querySelector("[data-message-id='u1'] .dcp-copy-slot").parentElement, added);
});

test("an empty Dot composer that stays unaccepted is restored", async () => {
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
  send.disabled = true;
  doc.querySelector("[data-dcp-paste]").click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((editor.textContent || "").trim(), "");
  assert.equal(doc.querySelector("[data-dcp-paste]").parentElement.querySelector(".dcp-status").textContent, "입력창이 붙여넣기를 받아들이지 않았습니다. 입력한 내용은 바꾸지 않았습니다.");
  assert.equal(send.disabled, true);
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
