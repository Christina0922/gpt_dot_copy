import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createMemoryStore } from "./accounts.js";
import { emailHash } from "./login.js";
import { LOGIN_LINK_TTL_MS } from "./login.js";
import { applyDecision } from "./purchase.js";

const PRODUCT_ID = "dot-copy-paste-export";

export function createPostgresStore(databaseUrl) {
  if (typeof databaseUrl !== "string" || !databaseUrl) throw new Error("database-missing");
  const sql = neon(databaseUrl);
  let schema = null;

  async function ensureSchema() {
    if (!schema) {
      schema = (async () => {
        await sql`CREATE TABLE IF NOT EXISTS dcp_accounts (token_hash text PRIMARY KEY, account_id text NOT NULL)`;
        await sql`CREATE INDEX IF NOT EXISTS dcp_accounts_account ON dcp_accounts (account_id)`;
        await sql`CREATE TABLE IF NOT EXISTS dcp_emails (account_id text PRIMARY KEY, email_hash text UNIQUE NOT NULL)`;
        await sql`CREATE TABLE IF NOT EXISTS dcp_purchases (
          transaction_id text PRIMARY KEY,
          account_id text UNIQUE NOT NULL,
          product_id text NOT NULL,
          amount integer NOT NULL,
          currency text NOT NULL,
          status text NOT NULL
        )`;
        await sql`ALTER TABLE dcp_purchases ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0`;
        await sql`CREATE TABLE IF NOT EXISTS dcp_adjustments (
          adjustment_id text PRIMARY KEY,
          transaction_id text NOT NULL,
          status text NOT NULL,
          amount integer NOT NULL,
          kind text NOT NULL,
          product_ok boolean NOT NULL,
          occurred_at timestamptz
        )`;
        await sql`CREATE TABLE IF NOT EXISTS dcp_events (
          event_id text PRIMARY KEY,
          transaction_id text NOT NULL,
          action text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )`;
        await sql`CREATE TABLE IF NOT EXISTS dcp_login_links (
          token_hash text PRIMARY KEY,
          account_id text NOT NULL,
          email_hash text NOT NULL,
          expires_at timestamptz NOT NULL,
          used_at timestamptz
        )`;
        await sql`CREATE TABLE IF NOT EXISTS dcp_marker (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`;
      })().catch((error) => {
        schema = null;
        throw error;
      });
    }
    await schema;
  }

  return {
    kind: "postgres",
    async ping() {
      await ensureSchema();
      const rows = await sql`SELECT 1 AS ok`;
      return rows[0]?.ok === 1;
    },
    async writeProbe(id) {
      await ensureSchema();
      await sql`INSERT INTO dcp_marker (id) VALUES (${id}) ON CONFLICT (id) DO NOTHING`;
    },
    async readProbe(id) {
      await ensureSchema();
      const rows = await sql`SELECT id FROM dcp_marker WHERE id = ${id}`;
      return rows.length === 1;
    },
    async deleteProbe(id) {
      await ensureSchema();
      await sql`DELETE FROM dcp_marker WHERE id = ${id}`;
    },
    async createAccount() {
      await ensureSchema();
      const bytes = randomBytes(48);
      const accountId = bytes.subarray(0, 16).toString("hex");
      const token = bytes.subarray(16, 48).toString("hex");
      await sql`INSERT INTO dcp_accounts (token_hash, account_id) VALUES (${sha256(token)}, ${accountId})`;
      return { accountId, token };
    },
    async readStatus(token) {
      await ensureSchema();
      if (!/^[a-f0-9]{64}$/.test(token || "")) {
        return { status: 401, body: { entitled: false, state: "unauthorized", source: "server" } };
      }
      const rows = await sql`
        SELECT a.account_id, p.product_id, p.amount, p.currency, p.status, p.refunded_amount
        FROM dcp_accounts a
        LEFT JOIN dcp_purchases p ON p.account_id = a.account_id
        WHERE a.token_hash = ${sha256(token)}
        LIMIT 1
      `;
      if (!rows.length) return { status: 401, body: { entitled: false, state: "unauthorized", source: "server" } };
      const row = rows[0];
      if (!row.status) {
        return { status: 200, body: { entitled: false, state: "not-purchased", source: "server", productId: PRODUCT_ID } };
      }
      const refundedAmount = Number(row.refunded_amount || 0);
      if (row.status === "refunded") {
        return { status: 200, body: { entitled: false, state: "refunded", source: "server", productId: row.product_id, refund: "full" } };
      }
      return {
        status: 200,
        body: {
          entitled: true,
          state: "entitled",
          source: "server",
          productId: row.product_id,
          amount: Number(row.amount),
          currency: row.currency,
          refund: refundedAmount > 0 ? "partial" : "none",
          refundedAmount
        }
      };
    },
    async applyNotification(decision, email) {
      await ensureSchema();
      if (!decision?.eventId) return { granted: false, duplicate: false, changed: false };
      const inserted = await sql`
        INSERT INTO dcp_events (event_id, transaction_id, action)
        VALUES (${decision.eventId}, ${decision.transactionId || ""}, ${decision.action || "ignore"})
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `;
      if (!inserted.length) return { granted: false, duplicate: true, changed: false };
      if (decision.action !== "grant" && decision.action !== "adjustment") {
        return { granted: false, duplicate: false, changed: false };
      }
      const local = createMemoryStore();
      const transactionId = decision.transactionId;
      if (decision.action === "grant") {
        const accounts = await sql`SELECT account_id FROM dcp_accounts WHERE account_id = ${decision.accountId} LIMIT 1`;
        if (accounts.length) local.accounts.set("seed", { accountId: decision.accountId });
      }
      const purchases = await sql`
        SELECT transaction_id, account_id, product_id, amount, currency, status, refunded_amount
        FROM dcp_purchases WHERE transaction_id = ${transactionId}
      `;
      if (purchases[0]) {
        local.purchases.set(purchases[0].transaction_id, {
          accountId: purchases[0].account_id,
          productId: purchases[0].product_id,
          amount: Number(purchases[0].amount),
          currency: purchases[0].currency,
          status: purchases[0].status,
          refundedAmount: Number(purchases[0].refunded_amount || 0)
        });
        local.byAccount.set(purchases[0].account_id, purchases[0].transaction_id);
      }
      const adjustments = await sql`
        SELECT adjustment_id, transaction_id, status, amount, kind, product_ok, occurred_at
        FROM dcp_adjustments WHERE transaction_id = ${transactionId}
      `;
      for (const row of adjustments) {
        local.adjustments.set(row.adjustment_id, {
          transactionId: row.transaction_id,
          status: row.status,
          amount: Number(row.amount),
          kind: row.kind,
          productOk: row.product_ok === true || row.product_ok === "t" || row.product_ok === "true",
          occurredAt: row.occurred_at ? new Date(row.occurred_at).getTime() : null
        });
      }
      const result = applyDecision(local, decision);
      const purchase = local.purchases.get(transactionId);
      if (purchase) {
        await sql`
          INSERT INTO dcp_purchases (transaction_id, account_id, product_id, amount, currency, status, refunded_amount)
          VALUES (
            ${transactionId},
            ${purchase.accountId},
            ${purchase.productId},
            ${purchase.amount},
            ${purchase.currency},
            ${purchase.status},
            ${purchase.refundedAmount || 0}
          )
          ON CONFLICT (transaction_id) DO UPDATE SET
            status = EXCLUDED.status,
            refunded_amount = EXCLUDED.refunded_amount
        `;
        const hash = emailHash(email);
        if (hash) {
          await sql`
            INSERT INTO dcp_emails (account_id, email_hash)
            VALUES (${purchase.accountId}, ${hash})
            ON CONFLICT (account_id) DO UPDATE SET email_hash = EXCLUDED.email_hash
          `;
        }
      }
      const adjustment = decision.adjustmentId ? local.adjustments.get(decision.adjustmentId) : null;
      if (adjustment) {
        await sql`
          INSERT INTO dcp_adjustments (adjustment_id, transaction_id, status, amount, kind, product_ok, occurred_at)
          VALUES (
            ${decision.adjustmentId},
            ${adjustment.transactionId},
            ${adjustment.status},
            ${adjustment.amount || 0},
            ${adjustment.kind || "none"},
            ${adjustment.productOk === true},
            ${adjustment.occurredAt ? new Date(adjustment.occurredAt).toISOString() : null}
          )
          ON CONFLICT (adjustment_id) DO UPDATE SET
            status = EXCLUDED.status,
            amount = EXCLUDED.amount,
            kind = EXCLUDED.kind,
            product_ok = EXCLUDED.product_ok,
            occurred_at = EXCLUDED.occurred_at
        `;
      }
      return result;
    },
    async accountIdForEmail(email) {
      await ensureSchema();
      const hash = emailHash(email);
      if (!hash) return "";
      const rows = await sql`SELECT account_id FROM dcp_emails WHERE email_hash = ${hash} LIMIT 1`;
      return rows[0]?.account_id || "";
    },
    async issueLink({ accountId, email, now = Date.now(), ttlMs = LOGIN_LINK_TTL_MS, token = randomBytes(32).toString("hex") }) {
      await ensureSchema();
      const hash = emailHash(email);
      if (!hash || !/^[a-f0-9]{64}$/.test(token || "")) return { ok: false, reason: "not-purchased" };
      const rows = await sql`SELECT email_hash FROM dcp_emails WHERE account_id = ${accountId} LIMIT 1`;
      if (rows[0]?.email_hash !== hash) return { ok: false, reason: "not-purchased" };
      const expiresAt = new Date(now + ttlMs).toISOString();
      await sql`
        INSERT INTO dcp_login_links (token_hash, account_id, email_hash, expires_at)
        VALUES (${sha256(token)}, ${accountId}, ${hash}, ${expiresAt})
      `;
      return { ok: true, token, expiresAt: now + ttlMs };
    },
    async consumeLink(token, now = Date.now()) {
      await ensureSchema();
      if (!/^[a-f0-9]{64}$/.test(token || "")) return { ok: false, reason: "unknown" };
      const hash = sha256(token);
      const rows = await sql`
        SELECT account_id, email_hash, expires_at, used_at
        FROM dcp_login_links
        WHERE token_hash = ${hash}
        LIMIT 1
      `;
      if (!rows.length) return { ok: false, reason: "unknown" };
      const link = rows[0];
      if (link.used_at) return { ok: false, reason: "used" };
      if (new Date(link.expires_at).getTime() < now) return { ok: false, reason: "expired" };
      const emails = await sql`SELECT email_hash FROM dcp_emails WHERE account_id = ${link.account_id} LIMIT 1`;
      if (emails[0]?.email_hash !== link.email_hash) return { ok: false, reason: "mismatch" };
      const marked = await sql`
        UPDATE dcp_login_links
        SET used_at = now()
        WHERE token_hash = ${hash} AND used_at IS NULL
        RETURNING account_id
      `;
      if (!marked.length) return { ok: false, reason: "used" };
      const sessionToken = randomBytes(32).toString("hex");
      await sql`INSERT INTO dcp_accounts (token_hash, account_id) VALUES (${sha256(sessionToken)}, ${link.account_id})`;
      return { ok: true, accountId: link.account_id, token: sessionToken };
    }
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
