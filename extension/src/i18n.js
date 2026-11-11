export const MESSAGES = {
  en: {
    copyBusy: "You can copy after the reply finishes",
    copy: "Copy",
    copyVisible: "Copy visible text",
    copyAsText: "Copy as text",
    copyAsMarkdown: "Copy as Markdown",
    copyVisibleMarkdown: "Copy visible text as Markdown",
    copyMenu: "Markdown",
    paste: "Paste",
    copied: "Copied!",
    pasted: "Pasted",
    copyFailed: "Couldn't copy. Try again, or select the text and press Ctrl+C.",
    clipboardDenied: "The clipboard could not be read. Use Ctrl+V in the input field.",
    clipboardEmpty: "The clipboard has no text.",
    composerMissing: "The input field was not found. Nothing was changed.",
    insertRejected: "The input field did not accept the paste. Nothing was changed. Use Ctrl+V in the input field. This button does not guarantee selection restore or undo.",
    pasteUnavailable: "This button is off because the dot input cannot confirm a draft. Click the input and press Ctrl+V. Selection restore and undo are not guaranteed. Nothing was changed.",
    popupTitle: "Dot Copy Paste",
    popupIntro: "Turns copy and paste buttons on or off and shows the version.",
    enabledLabel: "Use copy and paste buttons",
    languageLabel: "Language",
    languageKo: "Korean",
    languageEn: "English",
    unofficial: "Independently developed extension. Not an official OpenAI product.",
    versionLabel: "Version",
    domUnverified: "Copy and paste buttons appear only on a ChatGPT dot conversation page.",
    trademark: "The public product name and trademark review are not finished. Dot Copy Paste is the working name."
  },
  ko: {
    copyBusy: "답변이 끝난 뒤 복사할 수 있습니다",
    copy: "복사",
    copyVisible: "현재 표시된 내용 복사",
    copyAsText: "텍스트로 복사",
    copyAsMarkdown: "마크다운으로 복사",
    copyVisibleMarkdown: "현재 표시된 내용을 마크다운으로 복사",
    copyMenu: "마크다운",
    paste: "붙여넣기",
    copied: "복사됨",
    pasted: "붙여넣음",
    copyFailed: "복사하지 못했습니다. 다시 시도하거나 텍스트를 선택한 뒤 Ctrl+C를 사용해 주세요.",
    clipboardDenied: "클립보드를 읽을 수 없습니다. 입력창에서 Ctrl+V를 사용해 주세요.",
    clipboardEmpty: "클립보드에 텍스트가 없습니다.",
    composerMissing: "입력창을 찾지 못했습니다. 입력한 내용은 바꾸지 않았습니다.",
    insertRejected: "입력창이 붙여넣기를 받아들이지 않았습니다. 입력한 내용은 바꾸지 않았습니다. 입력창에서 Ctrl+V를 사용해 주세요. 이 버튼은 선택 영역 복원과 실행 취소를 보장하지 않습니다.",
    pasteUnavailable: "닷 입력창의 초안 반영을 확인할 수 없어 이 버튼은 사용하지 않습니다. 입력창을 누른 뒤 Ctrl+V를 사용해 주세요. 선택 영역 복원과 실행 취소는 보장하지 않습니다. 입력한 내용은 바꾸지 않았습니다.",
    popupTitle: "Dot Copy Paste",
    popupIntro: "복사·붙여넣기 버튼을 켜거나 끄고, 버전을 확인합니다.",
    enabledLabel: "복사·붙여넣기 버튼 사용",
    languageLabel: "언어",
    languageKo: "한국어",
    languageEn: "영어",
    unofficial: "독립적으로 개발된 확장프로그램입니다. OpenAI의 공식 제품이 아닙니다.",
    versionLabel: "버전",
    domUnverified: "복사·붙여넣기 버튼은 ChatGPT 닷 대화 화면에만 나타납니다.",
    trademark: "공개 제품명과 상표 검토는 끝나지 않았습니다. Dot Copy Paste는 작업명입니다."
  }
};

// An explicit popup choice wins. Otherwise Korean browser languages use Korean, and every other language uses English.
export function resolveLanguage(setting, uiLanguage = "en") {
  if (setting === "ko" || setting === "en") return setting;
  return /^ko\b/i.test(String(uiLanguage || "")) ? "ko" : "en";
}

export function translate(language, key) {
  const lang = language === "ko" ? "ko" : "en";
  return MESSAGES[lang][key] || MESSAGES.en[key] || key;
}

export function createTranslator(language) {
  return (key) => translate(language, key);
}
