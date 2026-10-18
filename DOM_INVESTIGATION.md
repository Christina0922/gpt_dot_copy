# 닷 화면 조사

조사일: 2026-10-19

2026-10-19에 로그인된 닷 대화의 구조를 확인했습니다. 아래 "로그인된 대화"가 그 결과입니다. 그 앞의 로그인 전 조사 기록은 그대로 두었습니다.

## 로그인된 대화

확인 위치는 Cursor 브라우저에 이미 열려 있던 `https://chatgpt.com/dots/home`입니다. 문서 제목은 "내 하인"이었습니다. 사용자의 Chrome 프로세스는 종료하지 않았고, 별도 프로필로 다시 열지 않았습니다. 대화 원문, 입력 내용, 계정 정보, 전체 HTML, 전체 URL은 저장하지 않았습니다.

확인한 구조:

- 메시지 목록 루트는 `[data-role="messages-scroll"]`입니다. 조사 시점의 `article[data-message-id]`는 70개였습니다.
- 본문은 `[data-markdown-text-style]`입니다. 이 속성 값은 작성자를 뜻하지 않습니다. 본문 안에 "Reply", "Choose a reaction", 오전/오후 표시가 들어간 경우는 0개였습니다.
- 텍스트 메시지의 작성자는 `[data-action]` 순서로 구분됩니다. `reply`가 `toggle-reaction-picker`보다 앞이면 사용자 메시지이고, 반대면 닷 메시지입니다. 사용자 22개, 닷 40개로 집계되었습니다.
- `open-image`가 있는 메시지 8개는 같은 동작 순서를 좌우 정렬과 관계없이 사용하므로 작성자를 정하지 않습니다. 본문이 없는 메시지는 2개였고 복사 버튼을 만들지 않습니다.
- 메시지 전체 복사 버튼은 없었습니다. "Copy table"은 표 전용입니다.
- 생성 중과 완료를 구분하는 안정적인 속성은 찾지 못했습니다. 닷 메시지 복사는 "현재 표시된 내용 복사"를 사용합니다. 사용자 텍스트 메시지는 완료로 봅니다.
- 입력창은 `[data-role="composer"]` 안의 `div[contenteditable="true"][role="textbox"]`입니다. 접근 이름은 "Message"입니다. `textarea`는 0개이고 입력창은 `form` 밖에 있습니다.
- 전송 컨트롤은 `button[aria-label="Send"]`이며 `type="button"`입니다.

활성 조건은 `chatgpt.com`이고 경로가 `/dots/`로 시작하며, 메시지 목록 루트와 위의 입력창이 모두 있는 경우입니다. `/c/` 같은 일반 대화 경로는 활성화하지 않습니다.

입력 확인:

- 빈 입력창에 `document.execCommand("insertText")`로 시험 문자열을 넣으면 DOM 텍스트는 바뀌지만 Send는 비활성으로 남고, 자리 표시도 빈 입력 상태로 남았습니다. 같은 방식으로 뒤에 추가하고 선택 구간만 바꾸는 DOM 동작은 확인한 뒤 지웠습니다.
- 브라우저 입력 경로로 같은 시험 문자열을 넣자 Send가 활성화되었습니다. Enter와 Send는 누르지 않았습니다. 메시지 수는 70개로 그대로였습니다. 시험 문자열은 지웠고, 이후 입력창은 비어 있으며 Send는 다시 비활성입니다.
- 따라서 확장프로그램의 비신뢰 입력은 닷 편집기가 초안으로 받아들이지 않는 것으로 확인했습니다. 빈 입력창에서 붙여넣기 뒤 Send가 계속 비활성이면 넣은 텍스트를 되돌리고, 성공으로 표시하지 않습니다.
- 이미 글이 있는 입력창에 대한 앱 상태 반영, Ctrl+V, Ctrl+Z, 생성 중 복사 비활성은 이 화면에서 확인하지 못했습니다.

## 로그인 전 조사

결론: 당시에는 닷 대화 화면의 DOM을 확인하지 못했습니다. 이 절의 내용은 그 시점의 기록입니다.

## 확인한 환경

- Cursor 내장 브라우저로 `https://chatgpt.com/dots`를 열었습니다. 페이지 제목은 ChatGPT였고, 로그인 또는 가입 화면이 보였습니다. 표시된 문장에는 "Use your ChatGPT account to get started with dots"가 포함되었습니다. 이메일 입력 필드의 `name`은 `username`이었습니다. 대화 목록, 메시지, 답변 생성 표시, 대화 입력창은 없었습니다.
- 같은 컴퓨터의 Chrome 155.0.8059.84로 새 프로필을 만들어 `https://chatgpt.com/dots`를 열었습니다. 표시된 문장은 "로그인 또는 회원가입 ChatGPT 계정으로 dot을 시작하세요"로 시작했습니다. `textarea`와 `contenteditable="true"` 요소는 0개였습니다. 이것도 대화 화면이 아닙니다.
- 사용자의 기본 Chrome 프로필은 원격 디버깅 포트가 열려 있지 않았고, 실행 중인 Chrome을 종료하거나 프로필을 복사하지 않았습니다. 따라서 로그인된 닷 대화에는 접근하지 못했습니다.
- OpenAI 도움말과 ChatGPT Learn 문서는 데스크톱 브라우저에서 `chatgpt.com/dots`로 닷에 들어간다고 설명합니다. 로그인 뒤의 대화 URL, DOM 구조, 기본 복사 기능, Ctrl+C와 Ctrl+V 동작은 그 문서에서 확인하지 못했고 화면에서도 확인하지 못했습니다.

## 확인하지 못한 항목

- 대화 화면을 식별하는 로그인 이후 URL
- 대화 목록과 메시지 영역의 구분
- 사용자 메시지와 닷 답변 컨테이너
- 본문과 시간, 버튼, 작업 상태, 첨부 파일의 구분
- 입력창이 `textarea`인지 `contenteditable`인지 다른 편집기인지
- 생성 중인 답변과 완료된 답변을 구분하는 속성
- 대화 전환 시 화면 갱신 방식
- 스크롤에 따른 이전 메시지 추가 또는 DOM 재사용
- 기본 복사 버튼이나 메뉴의 존재
- 닷 화면에서 Ctrl+C와 Ctrl+V의 실제 동작

일반 ChatGPT 대화창과 같다고 가정한 선택자는 사용하지 않았습니다.

## 연결 방식

`extension/src/live-adapter.js`가 실제 화면 연결을 담당합니다. `chatgpt.com`이 아니면 `not-chatgpt-host`, `/dots/`로 시작하지 않으면 `not-dot-path`, 메시지 목록 또는 입력창이 없으면 `dot-landmarks-missing`을 반환하고 버튼을 만들지 않습니다. 두 랜드마크가 있으면 `dot-conversation`으로 활성화합니다.

콘텐츠 스크립트 선언 범위는 `https://chatgpt.com/*`이지만, 기능 활성 조건은 어댑터의 확인 결과입니다.

복사, 붙여넣기, 본문 추출, 입력 처리, 버튼 배치는 `extension/src`의 나머지 모듈에 있습니다. 자동 테스트는 닷 DOM이라고 표시하지 않은 픽스처 어댑터로 이 모듈을 검사합니다. 픽스처 속성은 제품 코드의 화면 판별에 사용하지 않습니다.

확인한 `/dots/home` 구조는 `live-adapter.js`에 연결했습니다. 생성 중 표시, 대화 전환, 가상 스크롤은 아직 확인하지 못했으므로 이 버전을 닷 지원 완료로 볼 수 없습니다.

## 사용자가 확인할 최소 절차

아래 진단은 로그인 전 화면만 보였을 때의 절차입니다. `/dots/home` 구조는 이미 확인했으므로 지금 다시 실행할 필요는 없습니다.

```javascript
(() => {
  const path = location.pathname.replace(/[0-9a-f-]{8,}/gi, ":id");
  const describe = (el) => ({
    tag: el.tagName,
    role: el.getAttribute("role"),
    testid: el.getAttribute("data-testid"),
    contenteditable: el.getAttribute("contenteditable"),
    ariaLabelLength: (el.getAttribute("aria-label") || "").length
  });
  const sample = [...document.querySelectorAll("textarea, [contenteditable], time, form, [role]")]
    .slice(0, 80)
    .map(describe);
  const testids = [...new Set([...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")))].slice(0, 200);
  return { path, sample, testids };
})()
```

함께 확인할 항목:

1. 대화가 열린 URL의 경로. 식별자는 지워도 됩니다.
2. 사용자 메시지 하나와 완료된 닷 답변 하나의 태그, `role`, `data-testid`. 본문은 복사하지 않습니다.
3. 생성 중인 답변이 있을 때 완료된 답변과 다른 속성.
4. 입력창 요소의 태그와 `contenteditable` 여부.
5. 메시지에 기본 복사 버튼이 있는지.
6. 본문 일부를 선택하고 Ctrl+C가 되는지, 입력창에서 Ctrl+V가 되는지를 민감하지 않은 시험 문장으로 확인.

이 결과가 있어야 어댑터를 실제 화면에 연결할 수 있습니다.
