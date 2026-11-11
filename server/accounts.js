import { createHash, randomBytes } from "node:crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createMemoryStore() {
  return {
    accounts: new Map(),
    purchases: new Map(),
    events: new Set(),
    byAccount: new Map(),
    emails: new Map(),
    loginLinks: new Map(),
    adjustments: new Map(),
    failReads: false
  };
}

export function createAccount(store, bytes = randomBytes(48), now = Date.now()) {
  const accountId = bytes.subarray(0, 16).toString("hex");
  const token = bytes.subarray(16, 48).toString("hex");
  store.accounts.set(hashToken(token), { accountId, expiresAt: now + SESSION_TTL_MS });
  return { accountId, token };
}

export function accountFromToken(store, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return store.accounts.get(hashToken(token)) || null;
}

export function addToken(store, accountId, bytes = randomBytes(32), expiresAt = Date.now() + SESSION_TTL_MS) {
  if (!accountExists(store, accountId)) return null;
  const token = bytes.toString("hex");
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  store.accounts.set(hashToken(token), { accountId, expiresAt });
  return { accountId, token };
}

export function revokeToken(store, token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return false;
  return store.accounts.delete(hashToken(token));
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
