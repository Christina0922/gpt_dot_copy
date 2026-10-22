export const MESSAGES = {
  en: {
    copyBusy: "You can copy after the reply finishes",
    copyAsText: "Copy as text",
    copyAsMarkdown: "Copy as Markdown",
    paste: "Paste",
    copied: "Copied",
    pasted: "Pasted",
    copyFailed: "Couldn't copy. Try again, or select the text and press Ctrl+C.",
    clipboardDenied: "The clipboard could not be read. Use Ctrl+V in the input field.",
    clipboardEmpty: "The clipboard has no text.",
    composerMissing: "The input field was not found. Nothing was changed.",
    insertRejected: "The input field did not accept the paste. Nothing was changed.",
    popupTitle: "Dot Copy Paste",
    popupIntro: "Turns copy and paste buttons on or off and shows the version.",
    enabledLabel: "Use copy and paste buttons",
    languageLabel: "Language",
    languageKo: "Korean",
    languageEn: "English",
    clipboardHeading: "Clipboard reading",
    clipboardExplain: "Plain text is read only when you click Paste. Allowing this permission lets that click read the clipboard without an extra browser prompt. Copy keeps working if you decline. If reading fails, use Ctrl+V in the input field.",
    allowClipboard: "Allow clipboard reading",
    revokeClipboard: "Remove clipboard permission",
    clipboardAllowed: "Clipboard reading is allowed.",
    clipboardNotAllowed: "Clipboard reading is not allowed.",
    clipboardRequestFailed: "The permission request did not finish. Copy still works, and you can use Ctrl+V in the input field.",
    unofficial: "Independently developed extension. Not an official OpenAI product.",
    versionLabel: "Version",
    domUnverified: "The Dot conversation screen has not been verified, so buttons are not added to the page.",
    trademark: "The public product name and trademark review are not finished. Dot Copy Paste is the working name."
  },
  ko: {
    copyBusy: "답변이 끝난 뒤 복사할 수 있습니다",
    copyAsText: "텍스트로 복사",
    copyAsMarkdown: "마크다운으로 복사",
    paste: "붙여넣기",
    copied: "복사됨",
    pasted: "붙여넣음",
    copyFailed: "복사하지 못했습니다. 다시 시도하거나 텍스트를 선택한 뒤 Ctrl+C를 사용해 주세요.",
    clipboardDenied: "클립보드를 읽을 수 없습니다. 입력창에서 Ctrl+V를 사용해 주세요.",
    clipboardEmpty: "클립보드에 텍스트가 없습니다.",
    composerMissing: "입력창을 찾지 못했습니다. 입력한 내용은 바꾸지 않았습니다.",
    insertRejected: "입력창이 붙여넣기를 받아들이지 않았습니다. 입력한 내용은 바꾸지 않았습니다.",
    popupTitle: "Dot Copy Paste",
    popupIntro: "복사·붙여넣기 버튼을 켜거나 끄고, 버전을 확인합니다.",
    enabledLabel: "복사·붙여넣기 버튼 사용",
    languageLabel: "언어",
    languageKo: "한국어",
    languageEn: "영어",
    clipboardHeading: "클립보드 읽기",
    clipboardExplain: "일반 텍스트는 붙여넣기 버튼을 눌렀을 때만 읽습니다. 이 권한을 허용하면 그 클릭에서 추가 확인 없이 클립보드를 읽을 수 있습니다. 권한을 거절해도 복사는 계속 사용할 수 있습니다. 읽기에 실패하면 입력창에서 Ctrl+V를 사용해 주세요.",
    allowClipboard: "클립보드 읽기 허용",
    revokeClipboard: "클립보드 권한 철회",
    clipboardAllowed: "클립보드 읽기가 허용되어 있습니다.",
    clipboardNotAllowed: "클립보드 읽기가 허용되어 있지 않습니다.",
    clipboardRequestFailed: "권한 요청이 끝나지 않았습니다. 복사는 계속 사용할 수 있고, 입력창에서 Ctrl+V를 사용할 수 있습니다.",
    unofficial: "독립적으로 개발된 확장프로그램입니다. OpenAI의 공식 제품이 아닙니다.",
    versionLabel: "버전",
    domUnverified: "닷 대화 화면이 아직 확인되지 않아 페이지에 버튼을 넣지 않습니다.",
    trademark: "공개 제품명과 상표 검토는 끝나지 않았습니다. Dot Copy Paste는 작업명입니다."
  }
};

// English unless Korean was picked in the popup; the browser language is not consulted.
export function resolveLanguage(setting) {
  return setting === "ko" ? "ko" : "en";
}

export function translate(language, key) {
  const lang = language === "ko" ? "ko" : "en";
  return MESSAGES[lang][key] || MESSAGES.en[key] || key;
}

export function createTranslator(language) {
  return (key) => translate(language, key);
}
