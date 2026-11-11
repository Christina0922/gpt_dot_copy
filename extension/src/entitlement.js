import { PRODUCT_ID, SALE } from "./sale.js";

export async function readEntitlement({ storage, sale = SALE, request } = {}) {
  const stored = await readStorage(storage);
  if (!sale || sale.open !== true || sale.fullExportVerified !== true || !sale.apiBase) {
    return { entitled: false, state: "sale-closed", source: "local-config" };
  }
  if (typeof request !== "function") {
    return { entitled: false, state: "unavailable", source: "local-config" };
  }
  const token = typeof stored?.licenseSession?.token === "string" ? stored.licenseSession.token : "";
  let response;
  try {
    response = await request({ token });
  } catch {
    return { entitled: false, state: "unavailable", source: "server" };
  }
  return entitlementFromServer(response);
}

export function entitlementFromServer(body) {
  if (!body || typeof body !== "object" || body.source !== "server") {
    return { entitled: false, state: "unavailable", source: "server" };
  }
  if (body.state === "unavailable") {
    return { entitled: false, state: "unavailable", source: "server" };
  }
  const matches = body.entitled === true
    && body.state === "entitled"
    && body.productId === PRODUCT_ID
    && body.amount === 4900
    && body.currency === "KRW";
  if (matches) return { entitled: true, state: "entitled", source: "server" };
  if (body.state === "refunded") return { entitled: false, state: "refunded", source: "server" };
  return { entitled: false, state: "not-purchased", source: "server" };
}

export async function readPurchaseStatus({ storage, sale = SALE, request } = {}) {
  if (!sale?.statusBase) return readEntitlement({ storage, sale, request });
  if (typeof request !== "function") return { entitled: false, state: "unavailable", source: "local-config" };
  const stored = await readStorage(storage);
  const token = typeof stored?.licenseSession?.token === "string" ? stored.licenseSession.token : "";
  try {
    return entitlementFromServer(await request({ token }));
  } catch {
    return { entitled: false, state: "unavailable", source: "server" };
  }
}

export function mayExport(entitlement) {
  return entitlement?.entitled === true && entitlement.state === "entitled" && entitlement.source === "server";
}

export function statusMessageKey(entitlement, { saleOpen = false } = {}) {
  switch (entitlement?.state) {
    case "entitled":
      return saleOpen ? "purchaseActive" : "purchaseRecorded";
    case "not-purchased":
      return "purchaseNone";
    case "refunded":
      return "purchaseRefunded";
    case "sale-closed":
      return "salePreparing";
    default:
      return "purchaseUnavailable";
  }
}

async function readStorage(storage) {
  if (!storage || typeof storage.get !== "function") return {};
  const stored = await storage.get(["licenseSession", "pro", "settings"]);
  return stored && typeof stored === "object" ? stored : {};
}
