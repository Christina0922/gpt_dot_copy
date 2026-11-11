import { createHash, randomBytes } from "node:crypto";
import { accountExists, addToken } from "./accounts.js";

export const LOGIN_LINK_TTL_MS = 15 * 60 * 1000;

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return "";
  if (/[\r\n\0]/.test(email)) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export function emailHash(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return "";
  return createHash("sha256").update(normalized).digest("hex");
}

export function issueLoginLink(store, { accountId, email, now = Date.now(), ttlMs = LOGIN_LINK_TTL_MS, token = randomBytes(32).toString("hex") } = {}) {
  const hash = emailHash(email);
  if (!hash || !accountExists(store, accountId)) return { ok: false, reason: "not-purchased" };
  if (store.emails.get(accountId) !== hash) return { ok: false, reason: "not-purchased" };
  if (!/^[a-f0-9]{64}$/.test(token)) return { ok: false, reason: "not-purchased" };
  store.loginLinks.set(sha256(token), {
    accountId,
    emailHash: hash,
    expiresAt: now + ttlMs,
    used: false
  });
  return { ok: true, token, expiresAt: now + ttlMs };
}

export function consumeLoginLink(store, token, now = Date.now()) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return { ok: false, reason: "unknown" };
  const link = store.loginLinks.get(sha256(token));
  if (!link) return { ok: false, reason: "unknown" };
  if (link.used) return { ok: false, reason: "used" };
  if (now > link.expiresAt) return { ok: false, reason: "expired" };
  if (store.emails.get(link.accountId) !== link.emailHash) return { ok: false, reason: "mismatch" };
  if (!accountExists(store, link.accountId)) return { ok: false, reason: "unknown" };
  link.used = true;
  const session = addToken(store, link.accountId);
  if (!session) return { ok: false, reason: "unknown" };
  return { ok: true, accountId: session.accountId, token: session.token };
}

export function accountIdForEmail(store, email) {
  const hash = emailHash(email);
  if (!hash) return "";
  for (const [accountId, stored] of store.emails) {
    if (stored === hash) return accountId;
  }
  return "";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
