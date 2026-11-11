// Test-only sale state. This file is copied into sandbox-verify/extension.
// The store package keeps extension/src/sale.js and does not load this file.
export const PRODUCT_ID = "dot-copy-paste-export";

export const SALE = Object.freeze({
  open: false,
  fullExportVerified: false,
  sandboxExport: "verify",
  provider: "paddle",
  apiBase: "http://127.0.0.1:8787",
  statusBase: "http://127.0.0.1:8787",
  productId: PRODUCT_ID,
  amount: 4900,
  currency: "KRW",
  interval: "one-time"
});

export function purchasePresentation(sale = SALE) {
  const ready = sale?.open === true && sale.fullExportVerified === true && typeof sale.apiBase === "string" && sale.apiBase !== "";
  if (!ready) return { state: "preparing", labelKey: "salePreparing", disabled: true };
  return { state: "open", labelKey: "buyPro", disabled: false };
}
