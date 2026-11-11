import { createPostgresStore } from "../server/postgres.js";
import { databaseUrl } from "../server/runtime.js";

const url = databaseUrl(process.env);
if (!url) {
  console.log("database=missing");
  process.exit(2);
}

const store = createPostgresStore(url);
const stamp = Date.now().toString(36);
const email = "dcp-link-check@example.com";
let accountId = "";
let transactionId = "";

try {
  const before = await store.recordSummary();
  const account = await store.createAccount();
  accountId = account.accountId;
  transactionId = `txn_linkcheck_${stamp}`;
  const granted = await store.applyNotification({
    eventId: `evt_linkcheck_${stamp}`,
    action: "grant",
    transactionId,
    accountId,
    amount: 4900,
    currency: "KRW",
    productId: "dot-copy-paste-export",
    catalogProductId: "dot-copy-paste-export",
    environment: "sandbox"
  }, email);
  if (granted.granted !== true) throw new Error("grant-failed");
  const issued = await store.issueLink({ accountId, email });
  if (!issued.ok) throw new Error("issue-failed");
  const first = await consume(issued.token);
  const cookie = /dcp_session=([a-f0-9]{64})/.exec(first.cookie || "");
  const status = await fetch("https://dot-copy-paste.vercel.app/api/status", {
    headers: { cookie: `dcp_session=${cookie?.[1] || ""}` }
  });
  const statusBody = await status.json();
  const second = await consume(issued.token);
  const stale = await store.issueLink({ accountId, email, now: Date.now() - (16 * 60 * 1000) });
  const expired = await consume(stale.token);
  const after = await store.recordSummary();
  console.log(JSON.stringify({
    mailSent: false,
    first: first.status,
    restored: status.status,
    state: statusBody.state,
    entitled: statusBody.entitled,
    channel: statusBody.channel,
    reused: second.status,
    reusedUsed: second.used,
    expired: expired.status,
    expiredExpired: expired.expired,
    tokenEcho: first.echo || second.echo || expired.echo,
    accountsBefore: before.dcp_accounts,
    accountsDuring: after.dcp_accounts
  }));
} catch (error) {
  const message = error instanceof Error ? error.message : "link-check-failed";
  console.log(`link_check_error=${message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 160)}`);
  process.exitCode = 1;
} finally {
  if (accountId) {
    const removed = await store.removeAccount(accountId);
    const after = await store.recordSummary();
    console.log(`removed=${removed}`);
    console.log(`accountsAfter=${after.dcp_accounts}`);
    console.log(`purchasesAfter=${after.dcp_purchases}`);
  }
}

async function consume(token) {
  const response = await fetch(`https://dot-copy-paste.vercel.app/api/consume?token=${token}`, { redirect: "manual" });
  const text = await response.text();
  return {
    status: response.status,
    cookie: response.headers.get("set-cookie") || "",
    used: text.includes("이미 사용한 링크입니다"),
    expired: text.includes("만료된 링크입니다"),
    echo: text.includes(token)
  };
}
