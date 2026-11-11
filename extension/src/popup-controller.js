import { readEntitlement, statusMessageKey } from "./entitlement.js";
import { createTranslator, resolveLanguage } from "./i18n.js";
import { purchasePresentation } from "./sale.js";
import { loadSettings, normalizeSettings, saveSettings } from "./settings.js";

const EXPORT_CODES = {
  "sale-closed": "salePreparing",
  "not-purchased": "purchaseNone",
  refunded: "purchaseRefunded",
  unavailable: "purchaseUnavailable",
  "not-dot-screen": "notDotPage",
  "no-page": "noPage",
  "bad-format": "badFormat",
  "exported-loaded": "exportedLoaded",
  "exported-full": "exportedFull"
};

export function wirePopup(doc, { chrome, version, askPage, licenseRequest } = {}) {
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
    language: doc.querySelector("[data-setting='language']"),
    exportFormat: doc.querySelector("[data-setting='export-format']"),
    buy: doc.querySelector("[data-action='buy-pro']"),
    purchaseStatus: doc.querySelector("[data-role='purchase-status']")
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
    const purchase = purchasePresentation();
    nodes.buy.dataset.i18n = purchase.labelKey;
    nodes.buy.disabled = purchase.disabled;
    for (const node of doc.querySelectorAll("[data-i18n]")) {
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

  function showPurchase(key) {
    nodes.purchaseStatus.textContent = t(key);
  }

  async function showEntitlement() {
    const entitlement = await readEntitlement({ storage, request: licenseRequest });
    showPurchase(statusMessageKey(entitlement));
    return entitlement;
  }

  nodes.enabled.addEventListener("change", async () => {
    settings = await saveSettings(storage, { ...settings, enabled: nodes.enabled.checked });
    paint();
  });

  nodes.language.addEventListener("change", async () => {
    settings = await saveSettings(storage, { ...settings, language: nodes.language.value, languageChosen: true });
    paint();
    if (nodes.purchaseStatus.textContent) await showEntitlement();
  });

  nodes.buy.addEventListener("click", () => {
    showPurchase("salePreparing");
  });

  doc.querySelector("[data-action='restore-purchase']").addEventListener("click", () => {
    showEntitlement();
  });

  doc.querySelector("[data-action='purchase-status']").addEventListener("click", () => {
    showEntitlement();
  });

  doc.querySelector("[data-action='export']").addEventListener("click", async () => {
    const entitlement = await readEntitlement({ storage, request: licenseRequest });
    if (entitlement.state !== "entitled") {
      showPurchase(statusMessageKey(entitlement));
      return;
    }
    const format = nodes.exportFormat.value === "markdown" ? "markdown" : "txt";
    const result = typeof askPage === "function"
      ? await askPage({ type: "dcp-export", format })
      : { ok: false, code: "no-page" };
    showPurchase(EXPORT_CODES[result?.code] || "purchaseUnavailable");
  });

  return {
    async init() {
      settings = await loadSettings(storage);
      paint();
      await showEntitlement();
    }
  };
}
