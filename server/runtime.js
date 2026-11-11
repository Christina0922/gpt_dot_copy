import { createAccount, accountFromToken, createMemoryStore, revokeToken } from "./accounts.js";
import { accountIdForEmail, allowRestoreAttempt, consumeLoginLink, emailHash, issueLoginLink } from "./login.js";
import { applyDecision, statusForToken } from "./purchase.js";
import { createPostgresStore } from "./postgres.js";

export function createMemoryRuntime() {
  const store = createMemoryStore();
  return {
    kind: "memory",
    store,
    async createAccount(now = Date.now()) {
      return createAccount(store, undefined, now);
    },
    async readStatus(token, now = Date.now()) {
      if (store.failReads) return { status: 503, body: { entitled: false, state: "unavailable", source: "server" } };
      const account = accountFromToken(store, token);
      if (!account || account.expiresAt == null || account.expiresAt <= now) {
        if (account) revokeToken(store, token);
        return { status: 401, body: { entitled: false, state: "unauthorized", source: "server" } };
      }
      return { status: 200, body: statusForToken(store, token) };
    },
    async revokeSession(token) {
      return revokeToken(store, token);
    },
    async allowRestore(input) {
      return allowRestoreAttempt(store, input);
    },
    async applyNotification(decision, email) {
      const result = applyDecision(store, decision);
      const hash = emailHash(email);
      if (result.granted && hash) store.emails.set(decision.accountId, hash);
      return result;
    },
    async accountIdForEmail(email) {
      return accountIdForEmail(store, email);
    },
    async issueLink(input) {
      return issueLoginLink(store, input);
    },
    async consumeLink(token, now) {
      return consumeLoginLink(store, token, now);
    }
  };
}

export function databaseUrl(env = {}) {
  const value = env.DATABASE_URL || env.POSTGRES_URL || env.DCP_DATABASE_URL || "";
  return typeof value === "string" ? value : "";
}

export function runtimeFromEnv(env = {}) {
  const url = databaseUrl(env);
  if (!url) return { kind: "missing" };
  return createPostgresStore(url);
}
