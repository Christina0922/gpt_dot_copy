# Dot Copy Paste privacy policy

대상: Dot Copy Paste 0.2.0  
상태: GitHub에 공개된 문서. Chrome Web Store 등록정보와 로컬 구현을 대조한 수정안.  
개발 주체: 독립 개발. OpenAI의 공식 제품이나 제휴 제품이 아닙니다.

이전 초안의 “닷 대화 구조를 확인하지 못해 버튼을 만들지 않는다”는 문장은 현재 스토어 설명 및 `extension/src/live-adapter.js`와 맞지 않아 아래 내용으로 대체합니다.

## 이 버전이 실제로 하는 일

콘텐츠 스크립트는 `https://chatgpt.com/*`에 선언되어 있습니다. 복사·붙여넣기 버튼은 ChatGPT 닷 대화 화면이 확인된 뒤에만 넣습니다. 로그인 전 화면과 `/c/` 같은 일반 대화에는 넣지 않습니다.

Chrome Web Store 개요의 첫 문장은 “Test build. Buttons stay hidden until a ChatGPT Dot chat page is verified.”입니다.

사용자가 복사 버튼을 누르기 전에는 해당 메시지 본문을 읽지 않습니다. 버튼을 실행하면 화면에 보이는 해당 메시지 본문만 읽어, 사용자가 고른 형식(일반 텍스트 또는 마크다운)으로 클립보드에 넣습니다.

붙여넣기는 스토어 설명과 구현 모두 시험 기능입니다. 버튼을 누르기 전에는 클립보드를 읽지 않습니다. 닷 입력창이 초안을 받지 못하면 삽입을 되돌리고 실패로 표시합니다. 메시지를 자동 전송하지 않습니다.

기능 사용 여부, 언어, 기본 복사 형식만 이 브라우저의 `chrome.storage.local`에 저장합니다. 대화 내용, 클립보드 내용, 계정 정보는 저장하지 않습니다.

읽은 대화 본문과 클립보드 텍스트는 버튼 동작을 처리하는 동안만 메모리에서 사용합니다. 확장프로그램 저장소, 파일, 외부 서버로 보내지 않습니다.

## 권한

- `storage`: 켜짐/꺼짐, 언어, 기본 복사 형식 설정
- `clipboardRead`: 선택 권한. 팝업에서 목적을 보여 준 뒤 사용자가 허용한 경우에만 붙여넣기에서 사용합니다.
- chatgpt.com 콘텐츠 스크립트: 버튼을 넣을 페이지를 이 사이트로 제한합니다.

분석, 광고, 추적 도구는 없습니다. 원격 코드와 CDN 스크립트는 사용하지 않습니다.

## 연락

connect.geniusbrain@gmail.com

공개 GitHub 경로: https://github.com/Christina0922/gpt_dot_copy/blob/main/PRIVACY_POLICY.md

## English summary

Dot Copy Paste 0.2.0 is an independent Chrome extension, not an official or affiliated OpenAI product. The Chrome Web Store overview calls it a test build and says buttons stay hidden until a ChatGPT Dot chat page is verified. Copy reads only the selected visible message after a user click and writes it as plain text or Markdown, as the user chose. Paste is experimental and does not send messages. Settings stay in local `chrome.storage`. Conversation and clipboard text are not sent to an external server.
