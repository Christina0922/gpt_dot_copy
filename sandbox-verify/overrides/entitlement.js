import { PRODUCT_ID, SALE } from "./sale.js";

export async function readEntitlement({ storage, sale = SALE, request } = {}) {
  if (sale?.sandboxExport !== "verify") {
    return { entitled: false, state: "sale-closed", source: "local-config" };
  }
  if (typeof request !== "function") {
    return { entitled: false, state: "unavailable", source: "local-config" };
  }
  const stored = await readStorage(storage);
  const token = typeof stored?.licenseSession?.token === "string" ? stored.licenseSession.token : "";
  try {
    return fromSandboxVerify(await request({ token }));
  } catch {
    return { entitled: false, state: "unavailable", source: "server" };
  }
}

export function entitlementFromServer(body) {
  return fromSandboxVerify(body);
}

export async function readPurchaseStatus({ storage, sale = SALE, request } = {}) {
  return readEntitlement({ storage, sale, request });
}

export function mayExport(entitlement) {
  return entitlement?.entitled === true
    && entitlement.state === "sandbox-verify"
    && entitlement.channel === "sandbox"
    && entitlement.source === "server";
}

export function statusMessageKey(entitlement) {
  switch (entitlement?.state) {
    case "sandbox-verify":
      return "purchaseSandboxVerify";
    case "sandbox":
      return "purchaseSandbox";
    case "unauthorized":
      return "purchaseSignIn";
    case "refunded":
      return "purchaseRefunded";
    case "not-purchased":
      return "purchaseNone";
    default:
      return "purchaseUnavailable";
  }
}

function fromSandboxVerify(body) {
  if (!body || typeof body !== "object" || body.source !== "server") {
    return { entitled: false, state: "unavailable", source: "server" };
  }
  if (body.state === "unavailable") return { entitled: false, state: "unavailable", source: "server" };
  if (body.state === "unauthorized") return { entitled: false, state: "unauthorized", source: "server" };
  if (body.state === "refunded") return { entitled: false, state: "refunded", source: "server" };
  const sandboxPurchase = body.state === "sandbox"
    && body.channel === "sandbox"
    && body.entitled === false
    && body.exportVerify === "sandbox"
    && body.productId === PRODUCT_ID
    && body.amount === 4900
    && body.currency === "KRW";
  if (sandboxPurchase) {
    return { entitled: true, state: "sandbox-verify", channel: "sandbox", source: "server" };
  }
  if (body.state === "sandbox") return { entitled: false, state: "sandbox", source: "server" };
  return { entitled: false, state: "not-purchased", source: "server" };
}

async function readStorage(storage) {
  if (!storage || typeof storage.get !== "function") return {};
  const stored = await storage.get(["licenseSession", "pro", "settings"]);
  return stored && typeof stored === "object" ? stored : {};
}
