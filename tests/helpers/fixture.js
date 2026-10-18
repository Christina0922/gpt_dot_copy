export const threadHtml = `
  <aside data-fixture="conversation-list"><button type="button">다른 대화</button></aside>
  <main>
    <section data-fixture="thread">
      <article data-fixture-role="user" data-fixture-id="m1" data-fixture-generating="false">
        <span data-fixture="avatar">U</span>
        <time datetime="10:00">10:00</time>
        <div data-fixture="body">
          <p>첫 문단</p>
          <p>둘째 문단</p>
          <div data-dcp-exclude>도구 실행 패널</div>
          <span hidden>숨긴 문장</span>
          <span aria-hidden="true">중복 안내</span>
          <span style="display:none">화면 밖 문장</span>
        </div>
        <button type="button">반응</button>
      </article>
      <article data-fixture-role="assistant" data-fixture-id="m2" data-fixture-generating="false">
        <time datetime="10:01">10:01</time>
        <div data-fixture="status">작업 상태</div>
        <div data-fixture="body">
          <p>설명입니다.</p>
          <ul>
            <li>하나</li>
            <li>둘</li>
          </ul>
          <pre><code>function hello() {\n  return "안녕";\n}</code></pre>
        </div>
        <button type="button">메뉴</button>
      </article>
      <article data-fixture-role="assistant" data-fixture-id="m3" data-fixture-attachment-only="true">
        <div data-fixture="file">image.png</div>
      </article>
      <article data-fixture-role="assistant" data-fixture-id="m4" data-fixture-native-copy="true" data-fixture-generating="false">
        <div data-fixture="body"><p>기본 복사 버튼이 있는 메시지</p></div>
        <button type="button">Copy</button>
      </article>
      <article data-fixture-role="assistant" data-fixture-id="m5">
        <div data-fixture="body"><p>생성 상태를 모르는 답변 😀</p></div>
      </article>
      <article data-fixture-role="assistant" data-fixture-id="m6" data-fixture-generating="true">
        <div data-fixture="body"><p>아직 이어지는 답변</p></div>
      </article>
    </section>
  </main>
  <form id="composer-form">
    <textarea data-fixture="composer"></textarea>
    <button type="submit">Send</button>
  </form>
  <textarea id="decoy">건드리면 안 됨</textarea>
`;

export function createFixtureAdapter(doc) {
  const messagesInCalls = [];
  return {
    messagesInCalls,
    detect() {
      return doc.querySelector("[data-fixture='dot-screen'], [data-fixture='thread']")
        ? { active: true, reason: "fixture" }
        : { active: false, reason: "not-fixture" };
    },
    getObserverRoot() {
      return doc.querySelector("[data-fixture='thread']");
    },
    messagesIn(node) {
      messagesInCalls.push(node);
      if (!node || node.nodeType !== 1) return [];
      const found = [];
      if (node.matches?.("[data-fixture-role]")) found.push(node);
      if (typeof node.querySelectorAll === "function") found.push(...node.querySelectorAll("[data-fixture-role]"));
      return found;
    },
    messageFromNode(node) {
      const element = node?.nodeType === 1 ? node : node?.parentElement;
      return element?.closest?.("[data-fixture-role]") || null;
    },
    getBodyElement(message) {
      if (message.hasAttribute("data-fixture-attachment-only")) return null;
      return message.querySelector("[data-fixture='body']");
    },
    getGenerationState(message) {
      const value = message.getAttribute("data-fixture-generating");
      if (value === "true") return "generating";
      if (value === "false") return "complete";
      return "unknown";
    },
    hasNativeCopy(message) {
      return message.getAttribute("data-fixture-native-copy") === "true";
    },
    getComposer() {
      if (doc.querySelector("[data-fixture='no-composer']")) return null;
      const unknown = doc.querySelector("[data-fixture='composer-unknown']");
      if (unknown) return { kind: "unknown", element: unknown };
      const textarea = doc.querySelector("textarea[data-fixture='composer']");
      if (textarea) return { kind: "textarea", element: textarea };
      const editable = doc.querySelector("[data-fixture='composer'][contenteditable='true']");
      if (editable) return { kind: "contenteditable", element: editable };
      return null;
    }
  };
}
