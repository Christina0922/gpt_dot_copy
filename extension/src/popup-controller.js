import { createTranslator, resolveLanguage } from "./i18n.js";
import { loadSettings, normalizeSettings, saveSettings } from "./settings.js";

export function wirePopup(doc, { chrome, version }) {
  const storage = chrome.storage.local;
  const permissions = chrome.permissions;
  const nodes = {
    title: doc.querySelector("[data-i18n='popupTitle']"),
    intro: doc.querySelector("[data-i18n='popupIntro']"),
    enabledLabel: doc.querySelector("[data-i18n='enabledLabel']"),
    languageLabel: doc.querySelector("[data-i18n='languageLabel']"),
    copyFormatLabel: doc.querySelector("[data-i18n='copyFormatLabel']"),
    clipboardHeading: doc.querySelector("[data-i18n='clipboardHeading']"),
    clipboardExplain: doc.querySelector("[data-i18n='clipboardExplain']"),
    allow: doc.querySelector("[data-action='allow-clipboard']"),
    revoke: doc.querySelector("[data-action='revoke-clipboard']"),
    permissionStatus: doc.querySelector("[data-role='permission-status']"),
    unofficial: doc.querySelector("[data-i18n='unofficial']"),
    trademark: doc.querySelector("[data-i18n='trademark']"),
    domUnverified: doc.querySelector("[data-i18n='domUnverified']"),
    version: doc.querySelector("[data-role='version']"),
    versionLabel: doc.querySelector("[data-i18n='versionLabel']"),
    enabled: doc.querySelector("[data-setting='enabled']"),
    language: doc.querySelector("[data-setting='language']"),
    copyFormat: doc.querySelector("[data-setting='copyFormat']")
  };

  let settings = normalizeSettings(null);
  let language = "en";

  function t(key) {
    return createTranslator(language)(key);
  }

  function paint() {
    language = resolveLanguage(settings.language);
    doc.documentElement.lang = language === "ko" ? "ko" : "en";
    for (const [key, node] of Object.entries(nodes)) {
      if (!node || !node.dataset || !node.dataset.i18n) continue;
      node.textContent = t(node.dataset.i18n);
    }
    nodes.allow.textContent = t("allowClipboard");
    nodes.revoke.textContent = t("revokeClipboard");
    nodes.version.textContent = version;
    nodes.enabled.checked = settings.enabled;
    nodes.language.value = settings.language;
    for (const option of nodes.language.options) {
      if (option.value === "ko") option.textContent = t("languageKo");
      if (option.value === "en") option.textContent = t("languageEn");
    }
    nodes.copyFormat.value = settings.copyFormat;
    for (const option of nodes.copyFormat.options) {
      option.textContent = t(option.value === "markdown" ? "copyFormatMarkdown" : "copyFormatText");
    }
  }

  async function paintPermission() {
    try {
      const allowed = await permissions.contains({ permissions: ["clipboardRead"] });
      nodes.permissionStatus.textContent = t(allowed ? "clipboardAllowed" : "clipboardNotAllowed");
      nodes.permissionStatus.dataset.dcpState = allowed ? "success" : "info";
    } catch {
      nodes.permissionStatus.textContent = t("clipboardNotAllowed");
      nodes.permissionStatus.dataset.dcpState = "error";
    }
  }

  nodes.enabled.addEventListener("change", async () => {
    settings = await saveSettings(storage, { ...settings, enabled: nodes.enabled.checked });
    paint();
  });

  nodes.language.addEventListener("change", async () => {
    settings = await saveSettings(storage, { ...settings, language: nodes.language.value, languageChosen: true });
    paint();
    await paintPermission();
  });

  nodes.copyFormat.addEventListener("change", async () => {
    settings = await saveSettings(storage, { ...settings, copyFormat: nodes.copyFormat.value });
    paint();
  });

  // The page menu also saves the format, so keep an open popup in step with it.
  chrome.storage.onChanged?.addListener?.((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = normalizeSettings(changes.settings.newValue);
    paint();
  });

  nodes.allow.addEventListener("click", async () => {
    try {
      const granted = await permissions.request({ permissions: ["clipboardRead"] });
      nodes.permissionStatus.textContent = t(granted ? "clipboardAllowed" : "clipboardNotAllowed");
      nodes.permissionStatus.dataset.dcpState = granted ? "success" : "info";
    } catch {
      nodes.permissionStatus.textContent = t("clipboardRequestFailed");
      nodes.permissionStatus.dataset.dcpState = "error";
    }
  });

  nodes.revoke.addEventListener("click", async () => {
    try {
      await permissions.remove({ permissions: ["clipboardRead"] });
    } catch {
      nodes.permissionStatus.textContent = t("clipboardRequestFailed");
      nodes.permissionStatus.dataset.dcpState = "error";
      return;
    }
    await paintPermission();
  });

  permissions.onRemoved.addListener(() => {
    paintPermission();
  });

  return {
    async init() {
      settings = await loadSettings(storage);
      paint();
      await paintPermission();
    }
  };
}
