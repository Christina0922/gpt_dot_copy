# 개인정보처리방침 초안

대상: Dot Copy Paste 0.1.0  
상태: 초안. 공개 URL은 없습니다.  
개발 주체: 독립 개발. OpenAI의 공식 제품이나 제휴 제품이 아닙니다.  
공개 제품명과 상표 검토: 완료되지 않음

## 이 버전이 실제로 하는 일

확장프로그램의 콘텐츠 스크립트는 `https://chatgpt.com/*`에 주입되도록 선언되어 있습니다. 버전 0.1.0의 화면 어댑터는 닷 대화 구조를 확인하지 못했기 때문에 버튼을 만들지 않고, 메시지 본문을 읽지 않습니다.

팝업은 기능 사용 여부와 언어 설정만 이 브라우저의 `chrome.storage.local`에 저장합니다. 대화 내용, 클립보드 내용, 계정 정보는 저장하지 않습니다.

## 이후 화면이 확인되어 버튼이 생길 때의 처리

복사 버튼을 누르기 전에는 해당 메시지 본문을 읽지 않습니다. 사용자가 복사 버튼을 누르거나 키보드로 그 버튼을 실행하면, 그때 화면에 보이는 해당 메시지 본문만 일반 텍스트로 읽어 클립보드에 넣습니다.

붙여넣기 버튼을 누르기 전에는 클립보드를 읽지 않습니다. 페이지를 열 때 읽거나, 주기적으로 감시하거나, 자동으로 읽지 않습니다. 읽는 값은 일반 텍스트이며 HTML은 입력창에 넣지 않습니다.

읽은 대화 본문과 클립보드 텍스트는 메모리에서 버튼 동작을 처리하는 동안만 사용합니다. 확장프로그램 저장소, 파일, 외부 서버로 보내지 않습니다.

## 권한

- `storage`: 켜짐/꺼짐과 언어 설정
- `clipboardRead`: 선택 권한. 팝업에서 목적을 보여 준 뒤 사용자가 허용한 경우에만 사용합니다. 거절하거나 철회해도 복사 기능의 코드 경로는 유지됩니다. 실제 닷 화면의 복사 동작은 아직 검증되지 않았습니다.
- chatgpt.com 콘텐츠 스크립트: 버튼을 넣을 페이지를 이 사이트로 제한하기 위한 선언입니다.

분석, 광고, 추적 도구는 없습니다. 원격 코드와 CDN 스크립트는 사용하지 않습니다. 사용자 텍스트를 `innerHTML`로 넣지 않습니다.

## 오류 기록

예상된 실패는 페이지의 상태 문구로만 알립니다. 예외 이름 외의 본문이나 클립보드 내용을 콘솔에 남기지 않도록 작성했습니다.

## 연락과 공개

개인정보처리방침을 게시할 공개 URL은 아직 없습니다. 웹스토어 제출 전에는 실제 공개 URL이 필요합니다. 이 문서에 가짜 주소를 넣지 않았습니다.

## English summary

Dot Copy Paste 0.1.0 is an independent extension, not an official or affiliated OpenAI product. Its content script is declared for `https://chatgpt.com/*`. Version 0.1.0 does not read message text because the Dot conversation structure is unverified and no buttons are added. Only the on/off setting and language are stored locally. Clipboard text is designed to be read only when the user clicks Paste, and message text only when the user activates Copy. Nothing is sent to an external server. No public privacy-policy URL exists yet.
