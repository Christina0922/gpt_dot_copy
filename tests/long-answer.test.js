import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { extractPlainText } from "../extension/src/extract-text.js";
import { extractMarkdown } from "../extension/src/extract-markdown.js";
import { loadDom } from "./helpers/dom.js";

const fixture = readFileSync(new URL("./fixtures/long-answer.html", import.meta.url), "utf8");

function loadBody() {
  const { window } = loadDom(fixture);
  return window.document.getElementById("body");
}

function codeTexts(body) {
  return [...body.querySelectorAll("pre code")].map((code) => code.textContent.replace(/\n$/, ""));
}

const EXPECTED_TEXT = [
  "설치와 사용",
  "",
  "이 문단은 굵은 글씨, 기울임, 문서 링크, 그리고 npm test 같은 인라인 코드를 포함한 긴 문단입니다. 문장 중간의 2*3=6, snake_case_name, a-b, [참고] 같은 기호는 그대로 남아야 합니다.",
  "",
  "1. 준비",
  "   - Node.js 22 이상",
  "   - 패키지 설치",
  "     3. 첫 단계",
  "     4. 둘째 단계",
  "2. 실행",
  "   설명 문단입니다.",
  "",
  "npm install",
  "npm test",
  "",
  "3. 마무리",
  "",
  "def main():",
  "    items = [1, 2]",
  "",
  "",
  "    for x in items:",
  "        print(x)  ",
  "",
  "    const indented = true;",
  "const fence = \"```\";",
  "",
  "all:",
  "\tgo build",
  "",
  "{",
  "  \"a\": [1, 2]",
  "}",
  "",
  "옵션\t설명",
  "--watch\ta | b 구분",
  "없음\t기본 동작",
  "",
  "인용 첫 문단",
  "",
  "인용 둘째 문단",
  "",
  "- 인용 속 목록",
  "",
  "첫 줄",
  "둘째 줄",
  "",
  "- 대시로 시작하는 문장",
  "",
  "# 샵으로 시작하는 문장",
  "",
  "2024. 숫자와 점으로 시작하는 문장"
].join("\n");

test("long mixed reply copies as the expected plain text", () => {
  assert.equal(extractPlainText(loadBody()), EXPECTED_TEXT);
});

test("plain text keeps every code block byte for byte with blank lines around it", () => {
  const body = loadBody();
  const text = extractPlainText(body);
  for (const code of codeTexts(body)) {
    assert.ok(text.includes(`\n\n${code}\n\n`), JSON.stringify(code.slice(0, 30)));
  }
});

test("plain text leaves out code headers, copy buttons, and excluded controls", () => {
  const text = extractPlainText(loadBody());
  for (const blocked of ["Copy code", "Copy table", "bashnpm", "pythondef"]) {
    assert.equal(text.includes(blocked), false, blocked);
  }
  assert.equal(/^(bash|python)$/m.test(text), false);
});

const EXPECTED_MARKDOWN = [
  "## 설치와 사용",
  "",
  "이 문단은 **굵은 글씨**, *기울임*, [문서 링크](https://example.com/docs?a=1), 그리고 `npm test` 같은 인라인 코드를 포함한 긴 문단입니다. 문장 중간의 2*3=6, snake_case_name, a-b, [참고] 같은 기호는 그대로 남아야 합니다.",
  "",
  "1. 준비",
  "   - Node.js 22 이상",
  "   - 패키지 설치",
  "     3. 첫 단계",
  "     4. 둘째 단계",
  "2. 실행",
  "",
  "   설명 문단입니다.",
  "   ```bash",
  "   npm install",
  "   npm test",
  "   ```",
  "3. 마무리",
  "",
  "```python",
  "def main():",
  "    items = [1, 2]",
  "",
  "",
  "    for x in items:",
  "        print(x)" + "  ",
  "```",
  "",
  "````javascript",
  "    const indented = true;",
  "const fence = \"```\";",
  "````",
  "",
  "```makefile",
  "all:",
  "\tgo build",
  "```",
  "",
  "```json",
  "{",
  "  \"a\": [1, 2]",
  "}",
  "```",
  "",
  "| 옵션 | 설명 |",
  "| --- | --- |",
  "| `--watch` | a \\| b 구분 |",
  "| 없음 | **기본** 동작 |",
  "",
  "> 인용 첫 문단",
  ">",
  "> 인용 둘째 문단",
  ">",
  "> - 인용 속 목록",
  "",
  "---",
  "",
  "첫 줄",
  "둘째 줄",
  "",
  "\\- 대시로 시작하는 문장",
  "",
  "\\# 샵으로 시작하는 문장",
  "",
  "2024\\. 숫자와 점으로 시작하는 문장"
].join("\n");

function fencedBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const open = /^( *)(`{3,})([\w+#.-]*)$/.exec(lines[index]);
    if (!open) continue;
    const [, indent, fence, language] = open;
    const body = [];
    let closed = false;
    for (index += 1; index < lines.length; index += 1) {
      if (lines[index] === indent + fence) {
        closed = true;
        break;
      }
      body.push(lines[index].startsWith(indent) ? lines[index].slice(indent.length) : lines[index]);
    }
    blocks.push({ language, code: body.join("\n"), closed });
  }
  return blocks;
}

test("long mixed reply copies as the expected Markdown", () => {
  assert.equal(extractMarkdown(loadBody()), EXPECTED_MARKDOWN);
});

test("Markdown fences every code block with its language and the original code", () => {
  const body = loadBody();
  const blocks = fencedBlocks(extractMarkdown(body));
  assert.deepEqual(blocks.map((block) => block.language), ["bash", "python", "javascript", "makefile", "json"]);
  assert.deepEqual(blocks.map((block) => block.code), codeTexts(body));
  assert.ok(blocks.every((block) => block.closed));
});

test("Markdown escapes only where text would turn into syntax", () => {
  const { window } = loadDom(String.raw`
    <div id="body">
      <p>문장 중간의 2*3, snake_case, a-b, [참고], C:\Users 는 그대로 둡니다.</p>
      <p>**글자 그대로** 와 [링크처럼](보이는 글) 과 &lt;b&gt;태그&lt;/b&gt;</p>
      <p>&gt; 인용처럼 시작<br>+ 더하기로 시작<br>===</p>
      <table><tr><th>열</th></tr><tr><td>a | b <code>c|d</code></td></tr></table>
    </div>
  `);
  assert.equal(extractMarkdown(window.document.getElementById("body")), String.raw`문장 중간의 2*3, snake_case, a-b, [참고], C:\Users 는 그대로 둡니다.

\*\*글자 그대로\*\* 와 \[링크처럼](보이는 글) 과 \<b>태그\</b>

\> 인용처럼 시작
\+ 더하기로 시작
\===

| 열 |
| --- |
| a \| b ` + "`c\\|d`" + String.raw` |`);
});

test("a code fence grows past backticks inside the code, and a quote stays a quote", () => {
  const { window } = loadDom(`
    <div id="body">
      <pre><code class="language-js">const mark = "\`\`\`";</code></pre>
      <blockquote><p>인용 문장</p></blockquote>
      <button type="button">Reply</button>
      <time>1:00</time>
    </div>
  `);
  const markdown = extractMarkdown(window.document.getElementById("body"));
  assert.equal(markdown.includes("Reply"), false);
  assert.equal(markdown.includes("1:00"), false);
  assert.match(markdown, /^````js\nconst mark = "```";\n````/);
  assert.match(markdown, /\n> 인용 문장$/);
});

test("Markdown links keep only web and mail addresses", () => {
  const { window } = loadDom(`
    <div id="body"><p><a href="javascript:alert(1)">스크립트</a> <a href="https://example.com/a b">공백 주소</a> <a href="mailto:a@example.com">메일</a></p></div>
  `);
  assert.equal(
    extractMarkdown(window.document.getElementById("body")),
    "스크립트 [공백 주소](https://example.com/a%20b) [메일](mailto:a@example.com)"
  );
});
