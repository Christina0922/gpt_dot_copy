import { readEntitlement, readPurchaseStatus, statusMessageKey } from "./entitlement.js";
import { createTranslator, resolveLanguage } from "./i18n.js";
import { purchasePresentation, SALE } from "./sale.js";
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
    const restore = doc.querySelector("[data-action='restore-purchase']");
    restore.href = SALE.statusBase ? `${SALE.statusBase}/restore` : "";
    for (const node of doc.querySelectorAll("[data-i18n]")) {
      node.textContent = t(node.dataset.i18n);
    }
    nodes.version.textContent = version;
    const origin = typeof SALE.statusBase === "string" ? SALE.statusBase.replace(/\/$/, "") : "";
    for (const link of doc.querySelectorAll("[data-guide]")) {
      link.href = origin ? `${origin}${link.dataset.guide}` : "";
    }
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
    const entitlement = await readPurchaseStatus({ storage, request: licenseRequest });
    showPurchase(statusMessageKey(entitlement, { saleOpen: SALE.open === true }));
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

  doc.querySelector("[data-action='restore-purchase']").addEventListener("click", (event) => {
    const href = event.currentTarget.getAttribute("href") || "";
    if (href.startsWith("https://")) return;
    event.preventDefault();
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
