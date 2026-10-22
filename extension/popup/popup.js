import { wirePopup } from "../src/popup-controller.js";

const popup = wirePopup(document, {
  chrome,
  version: chrome.runtime.getManifest().version
});

popup.init().catch((error) => {
  const name = error && typeof error.name === "string" ? error.name : "Error";
  console.error("[Dot Copy Paste]", name);
});
