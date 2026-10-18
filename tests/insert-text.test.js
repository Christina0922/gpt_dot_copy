import assert from "node:assert/strict";
import test from "node:test";
import { insertPlainText } from "../extension/src/insert-text.js";
import { loadDom } from "./helpers/dom.js";

function composer(element, kind) {
  return { kind, element };
}

test("inserts into an empty textarea and focuses it", () => {
  const { window } = loadDom(`<textarea id="input"></textarea>`);
  const textarea = window.document.getElementById("input");
  const result = insertPlainText(composer(textarea, "textarea"), "안녕 😀", null, window.document);
  assert.equal(result.ok, true);
  assert.equal(textarea.value, "안녕 😀");
  assert.equal(window.document.activeElement, textarea);
  assert.equal(textarea.selectionStart, "안녕 😀".length);
});

test("appends when there is no caret and replaces only a selection", () => {
  const { window } = loadDom(`<textarea id="input">abc</textarea>`);
  const textarea = window.document.getElementById("input");
  insertPlainText(composer(textarea, "textarea"), "X", null, window.document);
  assert.equal(textarea.value, "abcX");
  insertPlainText(composer(textarea, "textarea"), "Z", { kind: "textarea", start: 1, end: 2 }, window.document);
  assert.equal(textarea.value, "aZcX");
});

test("keeps the existing textarea value when beforeinput is cancelled", () => {
  const { window } = loadDom(`<textarea id="input">유지</textarea>`);
  const textarea = window.document.getElementById("input");
  textarea.addEventListener("beforeinput", (event) => event.preventDefault());
  const result = insertPlainText(composer(textarea, "textarea"), "변경", null, window.document);
  assert.equal(result.ok, false);
  assert.equal(textarea.value, "유지");
});

test("does not modify an unsupported editor", () => {
  const { window } = loadDom(`<div id="decoy">원문</div><textarea id="other">다른 값</textarea>`);
  const decoy = window.document.getElementById("decoy");
  const other = window.document.getElementById("other");
  const result = insertPlainText({ kind: "unknown", element: decoy }, "변경", null, window.document);
  assert.equal(result.reason, "unsupported");
  assert.equal(decoy.textContent, "원문");
  assert.equal(other.value, "다른 값");
});

test("inserts contenteditable text at the caret and replaces a selection", () => {
  const { window } = loadDom(`<div id="editor" contenteditable="true">hello</div>`);
  const editor = window.document.getElementById("editor");
  const doc = window.document;
  const range = doc.createRange();
  range.setStart(editor.firstChild, 1);
  range.setEnd(editor.firstChild, 4);
  const result = insertPlainText(composer(editor, "contenteditable"), "i", { kind: "contenteditable", range }, doc);
  assert.equal(result.ok, true);
  assert.equal(editor.textContent, "hio");
  assert.equal(doc.activeElement, editor);
});

test("appends to contenteditable when no caret was saved", () => {
  const { window } = loadDom(`<div id="editor" contenteditable="true">hello</div>`);
  const editor = window.document.getElementById("editor");
  insertPlainText(composer(editor, "contenteditable"), "!", null, window.document);
  assert.equal(editor.textContent, "hello!");
});

test("replaces a placeholder break in an empty contenteditable", () => {
  const { window } = loadDom(`<div id="editor" contenteditable="true"><br></div>`);
  const editor = window.document.getElementById("editor");
  insertPlainText(composer(editor, "contenteditable"), "시작", null, window.document);
  assert.equal(editor.textContent, "시작");
});

test("uses execCommand for a textarea when it changes the value", () => {
  const { window } = loadDom(`<textarea id="input"></textarea>`);
  const textarea = window.document.getElementById("input");
  window.document.execCommand = () => {
    textarea.value = "명령";
    return true;
  };
  const result = insertPlainText(composer(textarea, "textarea"), "명령", null, window.document);
  assert.equal(result.method, "execCommand");
  assert.equal(textarea.value, "명령");
});
