import { wirePopup } from "../src/popup-controller.js";

const popup = wirePopup(document, {
  chrome,
  uiLanguage: chrome.i18n.getUILanguage(),
  version: chrome.runtime.getManifest().version
});

popup.init().catch((error) => {
  const name = error && typeof error.name === "string" ? error.name : "Error";
  console.error("[Dot Copy Paste]", name);
});
