import { createTranslator, resolveLanguage } from "./i18n.js";
import { loadSettings, normalizeSettings, saveSettings } from "./settings.js";

export function wirePopup(doc, { chrome, version }) {
  const storage = chrome.storage.local;
  const nodes = {
    title: doc.querySelector("[data-i18n='popupTitle']"),
    intro: doc.querySelector("[data-i18n='popupIntro']"),
    enabledLabel: doc.querySelector("[data-i18n='enabledLabel']"),
    languageLabel: doc.querySelector("[data-i18n='languageLabel']"),
    unofficial: doc.querySelector("[data-i18n='unofficial']"),
    trademark: doc.querySelector("[data-i18n='trademark']"),
    domUnverified: doc.querySelector("[data-i18n='domUnverified']"),
    version: doc.querySelector("[data-role='version']"),
    versionLabel: doc.querySelector("[data-i18n='versionLabel']"),
    enabled: doc.querySelector("[data-setting='enabled']"),
    language: doc.querySelector("[data-setting='language']")
  };

  let settings = normalizeSettings(null);
  let language = "en";

  function t(key) {
    return createTranslator(language)(key);
  }

  function uiLanguage() {
    return chrome.i18n?.getUILanguage?.() || "en";
  }

  function paint() {
    language = resolveLanguage(settings.language, uiLanguage());
    doc.documentElement.lang = language === "ko" ? "ko" : "en";
    for (const node of Object.values(nodes)) {
      if (!node || !node.dataset || !node.dataset.i18n) continue;
      node.textContent = t(node.dataset.i18n);
    }
    nodes.version.textContent = version;
    nodes.enabled.checked = settings.enabled;
    nodes.language.value = language;
    for (const option of nodes.language.options) {
      if (option.value === "ko") option.textContent = t("languageKo");
      if (option.value === "en") option.textContent = t("languageEn");
    }
  }

  nodes.enabled.addEventListener("change", async () => {
    settings = await saveSettings(storage, { ...settings, enabled: nodes.enabled.checked });
    paint();
  });

  nodes.language.addEventListener("change", async () => {
    settings = await saveSettings(storage, { ...settings, language: nodes.language.value, languageChosen: true });
    paint();
  });

  return {
    async init() {
      settings = await loadSettings(storage);
      paint();
    }
  };
}
