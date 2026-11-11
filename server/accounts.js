import { createHash, randomBytes } from "node:crypto";

export function createMemoryStore() {
  return {
    accounts: new Map(),
    purchases: new Map(),
    events: new Set(),
    byAccount: new Map(),
    failReads: false
  };
}

export function createAccount(store, bytes = randomBytes(48)) {
  const accountId = bytes.subarray(0, 16).toString("hex");
  const token = bytes.subarray(16, 48).toString("hex");
  store.accounts.set(hashToken(token), { accountId });
  return { accountId, token };
}

export function accountFromToken(store, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return store.accounts.get(hashToken(token)) || null;
}

export function accountExists(store, accountId) {
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/.test(accountId)) return false;
  for (const account of store.accounts.values()) {
    if (account.accountId === accountId) return true;
  }
  return false;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
