import { createHash, randomBytes } from "node:crypto";
import { accountExists, addToken, SESSION_TTL_MS } from "./accounts.js";

export const LOGIN_LINK_TTL_MS = 15 * 60 * 1000;
export const RESTORE_WINDOW_MS = 15 * 60 * 1000;
export const RESTORE_EMAIL_LIMIT = 5;
export const RESTORE_IP_LIMIT = 20;

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
  const session = addToken(store, link.accountId, randomBytes(32), now + SESSION_TTL_MS);
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

export function allowRestoreAttempt(store, { email = "", ip = "", now = Date.now() } = {}) {
  if (!store.restoreAttempts) store.restoreAttempts = new Map();
  const emailKey = emailHash(email);
  const ipKey = typeof ip === "string" && ip ? sha256(`ip:${ip}`) : "";
  const emailHits = emailKey ? bumpAttempt(store.restoreAttempts, `email:${emailKey}`, now) : 0;
  const ipHits = ipKey ? bumpAttempt(store.restoreAttempts, `ip:${ipKey}`, now) : 0;
  if (!emailKey && !ipKey) return bumpAttempt(store.restoreAttempts, "anon", now) <= RESTORE_IP_LIMIT;
  if (emailKey && emailHits > RESTORE_EMAIL_LIMIT) return false;
  if (ipKey && ipHits > RESTORE_IP_LIMIT) return false;
  return true;
}

function bumpAttempt(attempts, key, now) {
  const current = attempts.get(key);
  if (!current || now - current.start >= RESTORE_WINDOW_MS) {
    attempts.set(key, { start: now, hits: 1 });
    return 1;
  }
  current.hits += 1;
  return current.hits;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
