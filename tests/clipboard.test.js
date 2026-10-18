import assert from "node:assert/strict";
import test from "node:test";
import { readPlainText, writePlainText } from "../extension/src/clipboard.js";
import { loadDom } from "./helpers/dom.js";

test("does not read an unfocused document", async () => {
  const { window } = loadDom(`<textarea></textarea>`);
  let reads = 0;
  window.document.hasFocus = () => false;
  const result = await readPlainText({
    readText() {
      reads += 1;
      return Promise.resolve("비밀");
    }
  }, window.document);
  assert.equal(result.reason, "unfocused");
  assert.equal(reads, 0);
});

test("reports an empty clipboard without treating it as success", async () => {
  const { window } = loadDom(`<textarea></textarea>`);
  window.document.hasFocus = () => true;
  const result = await readPlainText({ readText: async () => "   " }, window.document);
  assert.equal(result.reason, "empty");
});

test("reports clipboard denial by error name only", async () => {
  const { window } = loadDom(`<textarea></textarea>`);
  window.document.hasFocus = () => true;
  const result = await readPlainText({
    readText() {
      const error = new Error("clipboard has private text");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
  }, window.document);
  assert.equal(result.ok, false);
  assert.equal(result.name, "NotAllowedError");
  assert.equal(JSON.stringify(result).includes("private text"), false);
});

test("copy falls back when writeText fails and does not report success when both fail", async () => {
  const { window } = loadDom(`<button id="copy">복사</button>`);
  window.document.getElementById("copy").focus();
  window.document.execCommand = () => true;
  const fallback = await writePlainText("본문", {
    writeText() {
      const error = new Error("no");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
  }, window.document);
  assert.equal(fallback.ok, true);
  assert.equal(fallback.method, "execCommand");

  window.document.execCommand = () => false;
  const failed = await writePlainText("본문", {
    writeText() {
      const error = new Error("no");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
  }, window.document);
  assert.equal(failed.ok, false);
  assert.equal(failed.name, "NotAllowedError");
});
