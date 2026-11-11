import { SALE } from "../src/sale.js";
import { wirePopup } from "../src/popup-controller.js";

async function licenseRequest({ token }) {
  if (!SALE.statusBase) return { source: "local-config", state: "sale-closed" };
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${SALE.statusBase}/api/status`, { headers, credentials: "include" });
  return response.json();
}

async function askPage(message) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs && tabs[0] ? tabs[0].id : undefined;
  if (typeof tabId !== "number") return { ok: false, code: "no-page" };
  try {
    return await chrome.tabs.sendMessage(tabId, { type: message && message.type, format: message && message.format });
  } catch {
    return { ok: false, code: "no-page" };
  }
}

const popup = wirePopup(document, {
  chrome,
  version: chrome.runtime.getManifest().version,
  askPage,
  licenseRequest
});

popup.init().catch((error) => {
  const name = error && typeof error.name === "string" ? error.name : "Error";
  console.error("[Dot Copy Paste]", name);
});
