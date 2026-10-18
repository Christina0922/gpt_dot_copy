import assert from "node:assert/strict";
import test from "node:test";
import { computeAnchorPosition, findCopyAnchor } from "../extension/src/position.js";
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

test("a text ending keeps the copy slot in the last paragraph", () => {
  const { window } = loadDom(`<div id="body"><div><p id="last">마지막 문장</p></div></div>`);
  const place = findCopyAnchor(window.document.getElementById("body"));
  assert.equal(place.mode, "inline");
  assert.equal(place.anchor.id, "last");
});

test("a list, table, or code ending places the copy slot after that block", () => {
  const { window } = loadDom(`
    <div id="list"><p>설명</p><ul id="items"><li>하나</li></ul></div>
    <div id="code"><p>설명</p><pre id="sample"><code>a</code></pre></div>
    <div id="table"><table id="grid"><tr><td>칸</td></tr></table></div>
  `);
  const doc = window.document;
  assert.equal(findCopyAnchor(doc.getElementById("list")).anchor.id, "items");
  assert.equal(findCopyAnchor(doc.getElementById("list")).mode, "below");
  assert.equal(findCopyAnchor(doc.getElementById("code")).anchor.id, "sample");
  assert.equal(findCopyAnchor(doc.getElementById("table")).anchor.id, "grid");
});

test("the copy slot is not part of the copied text", () => {
  const { window } = loadDom(`
    <div id="body">
      <p>본문 문장<span data-dcp-ui class="dcp-copy-slot"><button type="button">복사</button><span class="dcp-status">복사됨</span></span></p>
    </div>
  `);
  const text = extractPlainText(window.document.getElementById("body"));
  assert.equal(text, "본문 문장");
});
