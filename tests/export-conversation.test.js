import assert from "node:assert/strict";
import test from "node:test";
import { handleExportRequest } from "../extension/src/export-action.js";
import { buildConversationExport, collectMessages, exportFilename, exportScope, sanitizeTitle } from "../extension/src/export-conversation.js";
import { liveAdapter } from "../extension/src/live-adapter.js";
import { SALE } from "../extension/src/sale.js";
import { startApp } from "../extension/src/bootstrap.js";
import { loadDom } from "./helpers/dom.js";

const exportedAt = new Date("2026-11-11T15:04:00Z");

function article({ author = "user", state = "complete", time = "", html = "<p>안녕</p>", attachment = "" }) {
  return `<article>
    ${time ? `<time datetime="${time}">${time}</time>` : ""}
    <div data-body>${html}</div>
    ${attachment}
  </article>`;
}

function adapterFrom(extent) {
  return {
    detect(doc) {
      return doc.querySelector("[data-role='messages-scroll']")
        ? { active: true, reason: "fixture" }
        : { active: false, reason: "not-dot-screen" };
    },
    getObserverRoot: (doc) => doc.querySelector("[data-role='messages-scroll']"),
    messagesIn: (node) => (node ? [...node.querySelectorAll("article")] : []),
    getAuthor: (node) => node.getAttribute("data-author") || "unknown",
    getGenerationState: (node) => node.getAttribute("data-state") || "unknown",
    getBodyElement: (node) => node.querySelector("[data-body]"),
    getThreadExtent: () => extent
  };
}

function withAuthors(html, authors, states) {
  return html.replace(/<article>/g, () => {
    const author = authors.shift();
    const state = states.shift();
    return `<article data-author="${author}" data-state="${state}">`;
  });
}

test("loaded Korean, English, code, table, and long threads keep order and do not invent missing times", () => {
  const authors = ["user", "dot", "user", "dot"];
  const states = ["complete", "unknown", "complete", "generating"];
  const html = withAuthors(`
    <div data-role="messages-scroll">
      ${article({ time: "10:00", html: "<p>첫 문단</p><p>둘째 문단</p>" })}
      ${article({ html: "<ul><li>하나</li><li>둘</li></ul><pre><code class=\"language-js\">const 값 = 1;</code></pre>" })}
      ${article({ time: "2026-11-01T00:00:00Z", html: "<table><tr><th>이름</th><th>값</th></tr><tr><td>가</td><td>1</td></tr></table>" })}
      ${article({ html: "<p>이어지는 답변</p>", attachment: "<img src=\"https://files.example/private-attachment-token\">" })}
      ${Array.from({ length: 20 }, (_, index) => article({ html: `<p>긴 문장 ${index}</p>` })).join("")}
    </div>
  `, [...authors, ...Array.from({ length: 20 }, () => "dot")], [...states, ...Array.from({ length: 20 }, () => "complete")]);
  const dom = loadDom(html, "https://chatgpt.com/dots/home");
  dom.window.document.title = "내 하인";
  const collected = collectMessages(adapterFrom({ complete: false, loadedCount: 24, expectedCount: null, reason: "no-confirmed-total" }), dom.window.document);
  const scope = exportScope(collected.extent, collected.messages);
  assert.equal(scope.scope, "loaded");
  const markdown = buildConversationExport({ ...collected, exportedAt, language: "ko", format: "markdown", scope: scope.scope, reason: scope.reason });
  assert.equal(markdown.text.startsWith("현재 불러온 메시지 내보내기\n"), true);
  assert.equal(markdown.text.includes("대화 전체 내보내기"), false);
  assert.equal(markdown.text.includes("1. 사용자"), true);
  assert.equal(markdown.text.includes("2. 닷"), true);
  assert.equal(markdown.text.includes("시간: 10:00"), true);
  assert.equal(markdown.text.includes("시간: 2026-11-01T00:00:00Z"), true);
  assert.equal(markdown.text.includes("이 답변의 완료 여부는 확인되지 않았습니다."), true);
  assert.equal(markdown.text.includes("아직 완료되지 않은 답변입니다."), true);
  assert.equal(markdown.text.includes("- 하나"), true);
  assert.equal(markdown.text.includes("```js"), true);
  assert.equal(markdown.text.includes("| 이름 | 값 |"), true);
  assert.equal(markdown.text.includes("private-attachment-token"), false);
  assert.equal(markdown.text.includes("첨부파일 원본은 포함하지 않습니다."), true);
  assert.equal(markdown.filename, "내-하인-2026-11-11.md");
  const positions = ["긴 문장 0", "긴 문장 19"].map((text) => markdown.text.indexOf(text));
  assert.equal(positions[0] < positions[1], true);
  assert.equal(collected.messages.length, 24);
  const headings = markdown.text.match(/^## \d+\. /gm) || [];
  assert.equal(headings.length, 24);
  assert.equal(new Set(headings).size, 24);
  assert.equal(markdown.text.includes("긴 문장 7"), true);
  assert.equal(markdown.text.includes("긴 문장 20"), false);

  const english = buildConversationExport({ ...collected, exportedAt, language: "en", format: "txt", scope: "loaded", reason: "no-confirmed-total" });
  assert.equal(english.text.startsWith("Export of messages loaded on screen\n"), true);
  assert.equal(english.text.includes("1. User"), true);
  assert.equal(english.filename.endsWith(".txt"), true);
  assert.equal(english.text.includes("Full conversation export"), false);
});

test("a confirmed complete thread can be labeled as full, and the live dot adapter does not do that", () => {
  const dom = loadDom(`<div data-role="messages-scroll">${withAuthors(article({ html: "<p>완료</p>" }), ["user"], ["complete"])}</div>`, "https://chatgpt.com/dots/home");
  const collected = collectMessages(adapterFrom({ complete: true, loadedCount: 1, expectedCount: 1 }), dom.window.document);
  const scope = exportScope(collected.extent, collected.messages);
  const file = buildConversationExport({ ...collected, exportedAt, language: "ko", format: "txt", scope: scope.scope, reason: scope.reason });
  assert.equal(scope.scope, "full");
  assert.equal(file.text.startsWith("대화 전체 내보내기\n"), true);
  assert.equal(file.text.includes("현재 불러온 메시지 내보내기"), false);

  const liveDom = loadDom(`
    <div data-role="messages-scroll">
      <article data-message-id="m1">
        <div data-markdown-text-style><p>본문</p></div>
        <button data-action="reply"></button>
        <button data-action="toggle-reaction-picker"></button>
      </article>
    </div>
    <div data-role="composer"><div contenteditable="true" role="textbox"></div></div>
  `, "https://chatgpt.com/dots/home");
  liveDom.window.document.title = "ChatGPT";
  const live = collectMessages(liveAdapter, liveDom.window.document);
  assert.equal(exportScope(live.extent, live.messages).scope, "loaded");
  assert.equal(live.extent.complete, false);
  assert.equal(live.title, "");
  assert.equal(SALE.open, false);
  assert.equal(SALE.fullExportVerified, false);
});

test("unsafe titles lose path characters and a non-dot page does not export", () => {
  assert.equal(sanitizeTitle("../내 하인:/a\n"), "내-하인a");
  assert.equal(exportFilename("", exportedAt, "txt"), "dot-conversation-2026-11-11.txt");
  const dom = loadDom("<main></main>", "https://chatgpt.com/c/abc");
  const result = collectMessages(liveAdapter, dom.window.document);
  assert.equal(result.ok, false);
  assert.equal(result.code, "not-dot-screen");
});

test("the shipped extension does not export from a local pro flag or a page message", async () => {
  const seen = [];
  const dom = loadDom(`<div data-role="messages-scroll">${article({ html: "<p>비밀문장</p>" })}</div>`, "https://chatgpt.com/dots/home");
  const result = await handleExportRequest({
    doc: dom.window.document,
    adapter: {
      detect() {
        throw new Error("should-not-read");
      }
    },
    format: "txt",
    storage: { async get() { return { pro: true, settings: { pro: true } }; } },
    request(body) {
      seen.push(body);
      return { entitled: true, source: "server" };
    },
    saveFile() {
      throw new Error("should-not-save");
    }
  });
  assert.deepEqual(result, { ok: false, code: "sale-closed" });
  assert.deepEqual(seen, []);
});

test("a server entitlement can export loaded messages without sending the conversation", async () => {
  const seen = [];
  const saved = [];
  const dom = loadDom(withAuthors(`<div data-role="messages-scroll">${article({ html: "<p>저장할 문장</p>" })}</div>`, ["user"], ["complete"]), "https://chatgpt.com/dots/home");
  const result = await handleExportRequest({
    doc: dom.window.document,
    adapter: adapterFrom({ complete: false, loadedCount: 1, expectedCount: null, reason: "no-confirmed-total" }),
    format: "markdown",
    language: "ko",
    exportedAt,
    storage: { async get() { return { licenseSession: { token: "a".repeat(64), pro: true } }; } },
    sale: { open: true, fullExportVerified: true, apiBase: "configured" },
    request(body) {
      seen.push(body);
      return { entitled: true, state: "entitled", source: "server", productId: "dot-copy-paste-export", amount: 4900, currency: "KRW" };
    },
    saveFile(file) {
      saved.push(file);
    }
  });
  assert.equal(result.code, "exported-loaded");
  assert.deepEqual(seen, [{ token: "a".repeat(64) }]);
  assert.equal(JSON.stringify(seen).includes("저장할 문장"), false);
  assert.equal(saved[0].text.includes("현재 불러온 메시지 내보내기"), true);
  assert.equal(saved[0].text.includes("저장할 문장"), true);
});

test("a content-script export message cannot grant access by itself", async () => {
  const dom = loadDom(`<div data-role="messages-scroll"></div><div data-role="composer"><div contenteditable="true" role="textbox"></div></div>`, "https://chatgpt.com/dots/home");
  const listeners = [];
  await startApp({
    chrome: {
      storage: { local: { async get() { return { pro: true }; } }, onChanged: { addListener() {} } },
      i18n: { getUILanguage: () => "ko" },
      runtime: { onMessage: { addListener(fn) { listeners.push(fn); } } }
    },
    window: dom.window,
    document: dom.window.document
  });
  const response = await new Promise((resolve) => {
    listeners[0]({ type: "dcp-export", format: "txt", entitlement: { entitled: true, pro: true } }, {}, resolve);
  });
  assert.equal(response.ok, false);
  assert.equal(response.code, "sale-closed");
});
