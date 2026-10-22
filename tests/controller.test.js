import assert from "node:assert/strict";
import test from "node:test";
import { createController } from "../extension/src/controller.js";
import { liveAdapter } from "../extension/src/live-adapter.js";
import { startApp } from "../extension/src/bootstrap.js";
import { MESSAGES } from "../extension/src/i18n.js";
import { createClipboard, flush, loadDom } from "./helpers/dom.js";
import { createFixtureAdapter, threadHtml } from "./helpers/fixture.js";

function mount(html = threadHtml, url = "https://chatgpt.com/dots") {
  const dom = loadDom(`<div data-fixture="dot-screen">${html}</div>`, url);
  dom.window.document.hasFocus = () => true;
  return dom;
}

function setup(dom, language = "ko") {
  const clipboard = createClipboard();
  const adapter = createFixtureAdapter(dom.window.document);
  const controller = createController({
    adapter,
    document: dom.window.document,
    window: dom.window,
    clipboard,
    getLanguage: () => language
  });
  return { clipboard, adapter, controller, doc: dom.window.document };
}

test("copy buttons exclude controls and copy the current body after reuse", async () => {
  const { clipboard, controller, doc } = setup(mount());
  assert.equal(controller.start().active, true);
  const copies = [...doc.querySelectorAll("[data-dcp-copy='text']")];
  assert.equal(copies.length, 4);
  assert.equal(doc.querySelector("[data-fixture-id='m3'] [data-dcp-copy='text']"), null);
  assert.equal(doc.querySelector("[data-fixture-id='m4'] [data-dcp-copy='text']"), null);
  assert.equal(doc.querySelector("[data-fixture-id='m6'] [data-dcp-copy='text']").disabled, true);

  const userButton = doc.querySelector("[data-fixture-id='m1'] [data-dcp-copy='text']");
  userButton.click();
  await flush();
  const userText = clipboard.calls.at(-1)[1];
  assert.match(userText, /첫 문단/);
  assert.match(userText, /둘째 문단/);
  for (const blocked of ["반응", "10:00", "도구 실행 패널", "숨긴 문장", "중복 안내", "설명입니다", "다른 메시지"]) {
    assert.equal(userText.includes(blocked), false, blocked);
  }

  const assistantButton = doc.querySelector("[data-fixture-id='m2'] [data-dcp-copy='text']");
  assistantButton.click();
  await flush();
  const assistantText = clipboard.calls.at(-1)[1];
  assert.match(assistantText, /설명입니다/);
  assert.match(assistantText, /- 하나\n- 둘/);
  assert.match(assistantText, /function hello\(\) \{\n  return "안녕";\n\}/);
  assert.equal(assistantText.includes("메뉴"), false);
  assert.equal(assistantText.includes("작업 상태"), false);
  assert.equal(assistantText.includes("첫 문단"), false);

  const body = doc.querySelector("[data-fixture-id='m1'] [data-fixture='body']");
  body.textContent = "바뀐 본문";
  await flush();
  doc.querySelector("[data-fixture-id='m1'] [data-dcp-copy='text']").click();
  await flush();
  assert.equal(clipboard.calls.at(-1)[1], "바뀐 본문");
  assert.equal(doc.querySelector("[data-fixture-id='m1'] .dcp-status").textContent, MESSAGES.ko.copied);
});

test("unknown generation is labeled and a failed copy is not marked successful", async () => {
  const dom = mount();
  const { controller, doc } = setup(dom);
  controller.start();
  const unknown = doc.querySelector("[data-fixture-id='m5'] [data-dcp-copy='text']");
  assert.equal(unknown.disabled, false);
  assert.equal(unknown.getAttribute("aria-label"), MESSAGES.ko.copyAsText);
  assert.equal(unknown.title, MESSAGES.ko.copyAsText);

  dom.window.document.execCommand = () => false;
  const clipboard = {
    writeText() {
      const error = new Error("no");
      error.name = "NotAllowedError";
      return Promise.reject(error);
    }
  };
  const retry = createController({
    adapter: createFixtureAdapter(doc),
    document: doc,
    window: dom.window,
    clipboard,
    getLanguage: () => "ko"
  });
  controller.stop();
  retry.start();
  doc.querySelector("[data-fixture-id='m1'] [data-dcp-copy='text']").click();
  await flush();
  const status = doc.querySelector("[data-fixture-id='m1'] .dcp-status");
  assert.equal(status.textContent, MESSAGES.ko.copyFailed);
  assert.equal(status.dataset.dcpState, "error");
});

test("paste keeps existing text, restores a selection, and does not submit", async () => {
  const { clipboard, controller, doc } = setup(mount());
  const form = doc.getElementById("composer-form");
  let submitted = 0;
  let entered = 0;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitted += 1;
  });
  doc.addEventListener("keydown", (event) => {
    if (event.key === "Enter") entered += 1;
  });
  controller.start();
  const textarea = doc.querySelector("[data-fixture='composer']");
  const decoy = doc.getElementById("decoy");
  const paste = doc.querySelector("[data-dcp-paste]");
  assert.equal(clipboard.calls.filter((call) => call[0] === "read").length, 0);

  textarea.value = "기존";
  textarea.focus();
  textarea.setSelectionRange(1, 2);
  paste.dispatchEvent(new doc.defaultView.Event("pointerdown", { bubbles: true }));
  paste.click();
  await flush();
  assert.equal(textarea.value, "기붙여넣을 문장");
  assert.equal(decoy.value, "건드리면 안 됨");
  assert.equal(doc.activeElement, textarea);
  assert.equal(submitted, 0);
  assert.equal(entered, 0);
  assert.equal(doc.querySelector("[data-dcp-paste]").parentElement.querySelector(".dcp-status").textContent, MESSAGES.ko.pasted);
});

test("empty and denied clipboard reads do not change the input or show success", async () => {
  const dom = mount();
  const doc = dom.window.document;
  const clipboard = createClipboard({ text: "   " });
  const controller = createController({
    adapter: createFixtureAdapter(doc),
    document: doc,
    window: dom.window,
    clipboard,
    getLanguage: () => "ko"
  });
  controller.start();
  const textarea = doc.querySelector("[data-fixture='composer']");
  textarea.value = "유지";
  doc.querySelector("[data-dcp-paste]").click();
  await flush();
  assert.equal(textarea.value, "유지");
  let status = doc.querySelector("[data-dcp-paste]").parentElement.querySelector(".dcp-status");
  assert.equal(status.textContent, MESSAGES.ko.clipboardEmpty);
  assert.equal(status.dataset.dcpState, "error");

  clipboard.state.text = "새 텍스트";
  clipboard.state.readError = "NotAllowedError";
  doc.querySelector("[data-dcp-paste]").click();
  await flush();
  assert.equal(textarea.value, "유지");
  status = doc.querySelector("[data-dcp-paste]").parentElement.querySelector(".dcp-status");
  assert.equal(status.textContent, MESSAGES.ko.clipboardDenied);
  assert.equal(status.dataset.dcpState, "error");
});

test("a missing or unknown composer is not modified", async () => {
  const dom = mount(`
    <section data-fixture="thread"></section>
    <div data-fixture="no-composer"></div>
    <textarea id="decoy">유지</textarea>
    <div id="other" contenteditable="true">다른 편집기</div>
  `);
  const doc = dom.window.document;
  const controller = createController({
    adapter: createFixtureAdapter(doc),
    document: doc,
    window: dom.window,
    clipboard: createClipboard(),
    getLanguage: () => "en"
  });
  const started = controller.start();
  assert.equal(started.active, true);
  assert.equal(doc.querySelector("[data-dcp-paste]"), null);
  assert.equal(doc.getElementById("decoy").value, "유지");
  assert.equal(doc.getElementById("other").textContent, "다른 편집기");
});

test("duplicate buttons are not created and our DOM updates do not keep scanning", async () => {
  const { adapter, controller, doc } = setup(mount());
  controller.start();
  const first = doc.querySelectorAll("[data-dcp-copy='text']").length;
  doc.querySelector("[data-fixture='thread']").append(doc.createElement("span"));
  await flush();
  assert.equal(doc.querySelectorAll("[data-dcp-copy='text']").length, first);
  assert.ok(controller.scanCount < 10);
  assert.ok(adapter.messagesInCalls.length < 15);
  controller.start();
  assert.equal(doc.querySelectorAll("[data-dcp-copy='text']").length, first);
});

test("a replaced message gets its own body and a removed thread is observed again", async () => {
  const { clipboard, controller, doc } = setup(mount());
  controller.start();
  const thread = doc.querySelector("[data-fixture='thread']");
  const article = doc.createElement("article");
  article.setAttribute("data-fixture-role", "user");
  article.setAttribute("data-fixture-generating", "false");
  article.innerHTML = `<div data-fixture="body"><p>새 메시지</p></div>`;
  thread.append(article);
  await flush();
  article.querySelector("[data-dcp-copy='text']").click();
  await flush();
  assert.equal(clipboard.calls.at(-1)[1], "새 메시지");

  const parent = thread.parentElement;
  const replacement = thread.cloneNode(false);
  replacement.setAttribute("data-fixture", "thread");
  const next = doc.createElement("article");
  next.setAttribute("data-fixture-role", "assistant");
  next.setAttribute("data-fixture-generating", "false");
  next.innerHTML = `<div data-fixture="body"><p>전환된 대화</p></div>`;
  replacement.append(next);
  parent.replaceChild(replacement, thread);
  await flush();
  replacement.querySelector("[data-dcp-copy='text']").click();
  await flush();
  assert.equal(clipboard.calls.at(-1)[1], "전환된 대화");
});

test("sidebar mutations and a non-dot page do not activate controls", async () => {
  const dom = mount();
  const { adapter, controller, doc } = setup(dom);
  controller.start();
  const before = adapter.messagesInCalls.length;
  doc.querySelector("[data-fixture='conversation-list']").append(doc.createElement("button"));
  await flush();
  assert.equal(adapter.messagesInCalls.length, before);

  controller.stop();
  const plain = loadDom(`<textarea id="prompt">일반 대화</textarea><article><p>본문</p></article>`, "https://chatgpt.com/c/123");
  const live = createController({
    adapter: liveAdapter,
    document: plain.window.document,
    window: plain.window,
    clipboard: createClipboard(),
    getLanguage: () => "ko"
  });
  assert.equal(live.start().reason, "not-dot-path");
  assert.equal(plain.window.document.querySelector("[data-dcp-ui]"), null);
  assert.equal(plain.window.document.getElementById("prompt").value, "일반 대화");

  const other = loadDom(`<textarea></textarea>`, "https://example.com/");
  const external = createController({
    adapter: liveAdapter,
    document: other.window.document,
    window: other.window,
    clipboard: createClipboard(),
    getLanguage: () => "en"
  });
  assert.equal(external.start().active, false);
  assert.equal(other.window.document.querySelector("button"), null);
});

test("disabling the extension removes buttons and does not read the clipboard", async () => {
  const dom = mount();
  let enabled = true;
  const clipboard = createClipboard();
  let listener = () => {};
  const chrome = {
    storage: {
      local: {
        async get() {
          return { settings: { enabled, language: "en" } };
        },
        async set(value) {
          enabled = value.settings.enabled;
        }
      },
      onChanged: {
        addListener(fn) {
          listener = fn;
        }
      }
    },
    i18n: { getUILanguage: () => "en" }
  };
  await startApp({
    chrome,
    window: dom.window,
    document: dom.window.document,
    adapter: createFixtureAdapter(dom.window.document),
    clipboard
  });
  assert.ok(dom.window.document.querySelector("[data-dcp-copy='text']"));
  enabled = false;
  listener({ settings: { newValue: { enabled: false } } }, "local");
  await flush();
  assert.equal(dom.window.document.querySelector("[data-dcp-ui]"), null);
  assert.equal(clipboard.calls.some((call) => call[0] === "read"), false);
});

test("English paste denial uses the English sentence", async () => {
  const dom = mount();
  const clipboard = createClipboard({ text: "x", readError: "NotAllowedError" });
  const controller = createController({
    adapter: createFixtureAdapter(dom.window.document),
    document: dom.window.document,
    window: dom.window,
    clipboard,
    getLanguage: () => "en"
  });
  controller.start();
  dom.window.document.querySelector("[data-dcp-paste]").click();
  await flush();
  const status = dom.window.document.querySelector("[data-dcp-paste]").parentElement.querySelector(".dcp-status");
  assert.equal(status.textContent, MESSAGES.en.clipboardDenied);
});
