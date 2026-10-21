import assert from "node:assert/strict";
import test from "node:test";
import { extractPlainText } from "../extension/src/extract-text.js";
import { loadDom } from "./helpers/dom.js";

test("extracts paragraphs, lists, and code without controls or hidden text", () => {
  const { window } = loadDom(`
    <div id="body">
      <p>첫 문단</p>
      <p>둘째 문단</p>
      <ul><li>하나</li><li>둘</li></ul>
      <pre><code>function hello() {\n  return "안녕";\n}</code></pre>
      <button type="button">복사</button>
      <time>10:00</time>
      <div data-dcp-ui>복사됨</div>
      <div data-dcp-exclude>도구 실행 패널</div>
      <div data-markdown-copy="exclude"><button type="button">Copy table</button></div>
      <span hidden>숨긴 문장</span>
      <span aria-hidden="true">중복 안내</span>
      <span style="display:none">화면 밖 문장</span>
    </div>
  `);
  const text = extractPlainText(window.document.getElementById("body"));
  assert.equal(text, `첫 문단\n\n둘째 문단\n\n- 하나\n- 둘\n\nfunction hello() {\n  return "안녕";\n}`);
  for (const blocked of ["복사", "10:00", "복사됨", "도구 실행 패널", "Copy table", "숨긴 문장", "중복 안내", "화면 밖 문장"]) {
    assert.equal(text.includes(blocked), false, blocked);
  }
});

test("does not take text from a neighboring message", () => {
  const { window } = loadDom(`
    <article id="one"><div id="body"><p>사용자 문장</p></div></article>
    <article id="two"><div><p>다른 메시지</p></div></article>
  `);
  const text = extractPlainText(window.document.getElementById("body"));
  assert.equal(text, "사용자 문장");
});

test("keeps ordered list numbers and inline spacing", () => {
  const { window } = loadDom(`
    <div id="body">
      <ol start="3"><li>셋째</li><li>넷째</li></ol>
      <p>값 <code>a  b</code> 입니다</p>
    </div>
  `);
  assert.equal(extractPlainText(window.document.getElementById("body")), "3. 셋째\n4. 넷째\n\n값 a  b 입니다");
});

test("keeps code whitespace exactly: blank line runs, first-line indent, trailing spaces", () => {
  const { window } = loadDom(`<div id="body"><pre><code>    first\n\n\n\nlast&#32;&#32;\n</code></pre></div>`);
  assert.equal(extractPlainText(window.document.getElementById("body")), "    first\n\n\n\nlast  ");
});

test("indents nested lists, keeps list paragraphs on the marker line, and separates table cells", () => {
  const { window } = loadDom(`
    <div id="body">
      <ul><li><p>A</p><ul><li>A1<ol><li>x</li></ol></li></ul></li><li>B</li></ul>
      <table><tr><th>이름</th><th>값</th></tr><tr><td>a</td><td>1</td></tr></table>
    </div>
  `);
  assert.equal(extractPlainText(window.document.getElementById("body")), "- A\n  - A1\n    1. x\n- B\n\n이름\t값\na\t1");
});

test("keeps the space between neighboring inline elements", () => {
  const { window } = loadDom(`<div id="body"><p><strong>굵게</strong> <em>기울임</em></p></div>`);
  assert.equal(extractPlainText(window.document.getElementById("body")), "굵게 기울임");
});
