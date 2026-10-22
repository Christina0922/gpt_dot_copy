import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { startApp } from "../extension/src/bootstrap.js";
import { flush, loadDom } from "./helpers/dom.js";

function chromeStub() {
  return {
    storage: {
      local: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener() {} }
    },
    i18n: { getUILanguage: () => "ko" }
  };
}

function addComposer(doc) {
  const composer = doc.createElement("div");
  composer.setAttribute("data-role", "composer");
  const editor = doc.createElement("div");
  editor.setAttribute("contenteditable", "true");
  editor.setAttribute("role", "textbox");
  composer.append(editor);
  doc.body.append(composer);
}

test("buttons appear after Dot landmarks are added", async () => {
  const dom = loadDom(`<div data-role="messages-scroll"></div>`, "https://chatgpt.com/dots/home");
  const doc = dom.window.document;
  const result = await startApp({
    chrome: chromeStub(),
    window: dom.window,
    document: doc
  });
  assert.equal(result.reason, "dot-landmarks-missing");
  assert.equal(doc.querySelector("[data-dcp-ui]"), null);
  addComposer(doc);
  const article = doc.createElement("article");
  article.setAttribute("data-message-id", "m1");
  const body = doc.createElement("div");
  body.setAttribute("data-markdown-text-style", "assistant-message");
  body.textContent = "본문";
  const reply = doc.createElement("button");
  reply.setAttribute("data-action", "reply");
  const reaction = doc.createElement("button");
  reaction.setAttribute("data-action", "toggle-reaction-picker");
  article.append(body, reply, reaction);
  doc.querySelector("[data-role='messages-scroll']").append(article);
  await flush();
  assert.equal(doc.querySelectorAll("[data-dcp-copy='text']").length, 1);
  assert.equal(doc.querySelectorAll("[data-dcp-paste]").length, 1);
});

test("a normal ChatGPT path does not gain buttons when a composer appears", async () => {
  const dom = loadDom(`<main></main>`, "https://chatgpt.com/c/abc");
  const doc = dom.window.document;
  const result = await startApp({
    chrome: chromeStub(),
    window: dom.window,
    document: doc
  });
  assert.equal(result.reason, "not-dot-path");
  addComposer(doc);
  await flush();
  assert.equal(doc.querySelector("[data-dcp-ui]"), null);
});

test("the installed content script is a classic script", () => {
  const source = readFileSync(new URL("../extension/content/content.js", import.meta.url), "utf8");
  assert.equal(/^\s*import\s/m.test(source), false);
  new vm.Script(source);
});
