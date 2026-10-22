import assert from "node:assert/strict";
import test from "node:test";
import { computeAnchorPosition } from "../extension/src/position.js";
import { extractPlainText } from "../extension/src/extract-text.js";
import { loadDom } from "./helpers/dom.js";

test("places a paste button above the composer when there is room", () => {
  const position = computeAnchorPosition({
    anchor: { top: 400, right: 900, bottom: 460, left: 200 },
    width: 80,
    height: 32,
    viewportWidth: 1000,
    viewportHeight: 800,
    placement: "above"
  });
  assert.equal(position.hidden, false);
  assert.equal(position.top, 362);
  assert.equal(position.left, 812);
});

test("keeps the button inside a short viewport", () => {
  const position = computeAnchorPosition({
    anchor: { top: 4, right: 300, bottom: 40, left: 20 },
    width: 80,
    height: 32,
    viewportWidth: 320,
    viewportHeight: 180,
    placement: "above"
  });
  assert.equal(position.top, 8);
  assert.ok(position.left >= 8);
  assert.ok(position.left + 80 <= 312);
});

test("hides a message that is fully outside the viewport", () => {
  const position = computeAnchorPosition({
    anchor: { top: 900, right: 200, bottom: 980, left: 20 },
    width: 80,
    height: 32,
    viewportWidth: 800,
    viewportHeight: 600,
    placement: "inside"
  });
  assert.equal(position.hidden, true);
});

test("the copy slot is not part of the copied text", () => {
  const { window } = loadDom(`
    <div id="body">
      <p>본문 문장</p>
      <div data-dcp-ui class="dcp-copy-slot"><button type="button" aria-label="텍스트로 복사"></button><span class="dcp-status">복사됨</span></div>
    </div>
  `);
  const text = extractPlainText(window.document.getElementById("body"));
  assert.equal(text, "본문 문장");
});
