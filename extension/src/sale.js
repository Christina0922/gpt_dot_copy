// Shipped sale state. Full-thread export is not confirmed on the live dot page,
// so this build does not open checkout or call a payment provider.
export const PRODUCT_ID = "dot-copy-paste-export";

export const SALE = Object.freeze({
  open: false,
  fullExportVerified: false,
  provider: "paddle",
  apiBase: "",
  statusBase: "https://dot-copy-paste.vercel.app",
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
