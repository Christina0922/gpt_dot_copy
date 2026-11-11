import { mailReady, sendLoginMail } from "./mail.js";
import { renderPage } from "./pages.js";
import { interpretNotification } from "./purchase.js";
import { verifySignature } from "./signature.js";

const CATALOG_PRODUCT_ID = "dot-copy-paste-export";
const MAX_BODY = 100_000;

export function createLicenseHandler({ runtime = { kind: "missing" }, env = {}, now = () => Date.now(), mailer = sendLoginMail } = {}) {
  return async function handle(request) {
    const method = request?.method || "GET";
    const path = routePath(request?.path || "/").split("?")[0];
    const headers = lowerHeaders(request?.headers);
    const body = typeof request?.body === "string" ? request.body : "";
    if (body.length > MAX_BODY) return json(413, { ok: false, state: "unavailable" });

    if (method === "GET" && path === "/api/health") return health(runtime, env);
    if (method === "POST" && path === "/api/session") return createSession(runtime);
    if (method === "GET" && path === "/api/status") return readStatus(runtime, headers);
    if (method === "POST" && path === "/api/webhook") return webhook(runtime, env, headers, body, now);
    if (method === "POST" && path === "/api/restore") return restore(runtime, env, headers, body, now, mailer);
    if (method === "GET" && (path === "/api/restore/consume" || path === "/api/consume")) return consume(runtime, request?.path || "", now);
    if (path === "/api/client-success") return json(400, { granted: false });
    if (method === "GET" || method === "POST") return page(path, env);
    return json(405, { ok: false });
  };
}

export function routePath(input) {
  const [rawPath, query = ""] = String(input || "/").split("?");
  let path = normalizeSitePath(rawPath).split("?")[0];
  if (path === "/api/page" || path.startsWith("/api/page/")) {
    path = path.slice("/api/page".length) || "/";
    if (path === "/home") path = "/";
  }
  return query ? `${path}?${query}` : path;
}

export function normalizeSitePath(input) {
  const [rawPath, query = ""] = String(input || "/").split("?");
  const marker = "/api/site/";
  const index = rawPath.indexOf(marker);
  const path = index >= 0 ? `/${rawPath.slice(index + marker.length)}` : rawPath || "/";
  const normalized = path === "/home" ? "/" : path.replace(/\/+$/, "") || "/";
  return query ? `${normalized}?${query}` : normalized;
}

async function health(runtime, env) {
  if (runtime?.kind === "postgres") {
    try {
      const ok = await runtime.ping();
      if (!ok) return json(503, healthBody(runtime, env, "unavailable"));
    } catch {
      return json(503, healthBody(runtime, env, "unavailable"));
    }
  }
  return json(200, healthBody(runtime, env, runtime?.kind === "postgres" ? "postgres" : runtime?.kind || "missing"));
}

function healthBody(runtime, env, database) {
  const paddle = env.DCP_PADDLE_ENV === "sandbox" || env.DCP_PADDLE_ENV === "live" ? env.DCP_PADDLE_ENV : "missing";
  return {
    ok: database === "postgres" || database === "memory",
    service: "dot-copy-paste-license",
    sale: "preparing",
    database,
    paddle,
    mail: mailReady(env) ? "configured" : "missing",
    fullExport: "unverified"
  };
}

async function createSession(runtime) {
  if (!ready(runtime)) return json(503, { ok: false, state: "unavailable" });
  try {
    const account = await runtime.createAccount();
    return json(200, { accountId: account.accountId, token: account.token });
  } catch {
    return json(503, { ok: false, state: "unavailable" });
  }
}

async function readStatus(runtime, headers) {
  if (!ready(runtime)) return json(503, { entitled: false, state: "unavailable", source: "server" });
  const token = bearer(headers.authorization) || readCookie(headers.cookie, "dcp_session");
  if (!token) return json(401, { entitled: false, state: "unauthorized", source: "server" });
  try {
    const result = await runtime.readStatus(token);
    return json(result.status, result.body);
  } catch {
    return json(503, { entitled: false, state: "unavailable", source: "server" });
  }
}

async function webhook(runtime, env, headers, body, now) {
  if (!ready(runtime)) return json(503, { granted: false, state: "unavailable" });
  const header = headers["paddle-signature"] || "";
  if (!verifySignature(body, header, env.DCP_PADDLE_WEBHOOK_SECRET, now())) return json(401, { granted: false });
  let notification;
  try {
    notification = JSON.parse(body);
  } catch {
    return json(400, { granted: false });
  }
  try {
    const decision = interpretNotification(notification, expectedFromEnv(env));
    const result = await runtime.applyNotification(decision, notification?.data?.customer?.email || "");
    return json(200, { granted: result.granted === true, duplicate: result.duplicate === true });
  } catch {
    return json(503, { granted: false, state: "unavailable" });
  }
}

async function restore(runtime, env, headers, body, now, mailer) {
  const form = (headers["content-type"] || "").includes("application/x-www-form-urlencoded");
  if (!ready(runtime)) return restoreResult(form, 503, { sent: false, reason: "unavailable" });
  const email = readEmail(body, headers["content-type"] || "");
  try {
    const accountId = await runtime.accountIdForEmail(email);
    if (!accountId) return restoreResult(form, 200, { sent: false, reason: "not-purchased" });
    const issued = await runtime.issueLink({ accountId, email, now: now() });
    if (!issued.ok) return restoreResult(form, 200, { sent: false, reason: "not-purchased" });
    const origin = httpsOrigin(env.DCP_LICENSE_API_BASE);
    if (!origin) return restoreResult(form, 503, { sent: false, reason: "mail-not-configured" });
    const mail = await mailer({
      to: email,
      link: `${origin}/api/consume?token=${issued.token}`,
      env
    });
    if (!mail?.sent) return restoreResult(form, 503, { sent: false, reason: mail?.reason || "mail-failed" });
    return restoreResult(form, 200, { sent: true });
  } catch {
    return restoreResult(form, 503, { sent: false, reason: "unavailable" });
  }
}

async function consume(runtime, rawPath, now) {
  if (!ready(runtime)) return html(503, renderPage({ path: "/failure" }));
  const token = new URL(rawPath, "https://license.local").searchParams.get("token") || "";
  try {
    const result = await runtime.consumeLink(token, now());
    if (!result.ok) return html(400, consumeFailure(result.reason));
    return {
      status: 303,
      headers: {
        location: "/restore/done",
        "set-cookie": `dcp_session=${result.token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
        "cache-control": "no-store"
      },
      body: ""
    };
  } catch {
    return html(503, renderPage({ path: "/failure" }));
  }
}

function page(path, env) {
  const clean = path.split("?")[0];
  if (clean === "/sandbox") return html(200, renderPage({ path: clean, sandbox: sandboxConfig(env) }));
  const known = ["/", "/price", "/purchase", "/success", "/failure", "/restore", "/restore/done", "/privacy", "/terms", "/refund"];
  if (!known.includes(clean)) return html(404, renderPage({ path: "/missing" }));
  return html(200, renderPage({ path: clean }));
}

function expectedFromEnv(env) {
  return {
    productId: text(env.DCP_PADDLE_PRODUCT_ID),
    priceId: text(env.DCP_PADDLE_PRICE_ID),
    amount: 4900,
    currency: "KRW",
    catalogProductId: CATALOG_PRODUCT_ID
  };
}

function sandboxConfig(env) {
  if (env.DCP_PADDLE_ENV !== "sandbox") return null;
  const clientToken = text(env.DCP_PADDLE_CLIENT_TOKEN);
  const priceId = text(env.DCP_PADDLE_PRICE_ID);
  if (!/^test_[A-Za-z0-9_]+$/.test(clientToken) || !/^pri_[A-Za-z0-9_]+$/.test(priceId)) return null;
  const origin = httpsOrigin(env.DCP_LICENSE_API_BASE);
  return {
    environment: "sandbox",
    clientToken,
    priceId,
    successUrl: origin ? `${origin}/success` : ""
  };
}

function ready(runtime) {
  return runtime && (runtime.kind === "memory" || runtime.kind === "postgres");
}

function restoreResult(form, status, body) {
  if (!form) return json(status, body);
  const message = body.sent === true
    ? "복원 링크를 보냈습니다."
    : body.reason === "not-purchased"
      ? "이 이메일로 확인된 구매가 없습니다. 메일을 보내지 않았습니다."
      : "메일을 보내지 못했습니다.";
  return html(status, `<!doctype html><html lang="ko"><meta charset="utf-8"><title>구매 복원</title><p>${message}</p><p><a href="/restore">돌아가기</a></p>`);
}

function consumeFailure(reason) {
  const message = {
    expired: "만료된 링크입니다.",
    used: "이미 사용한 링크입니다.",
    mismatch: "이 링크는 다른 계정의 구매에 연결할 수 없습니다.",
    unknown: "링크를 확인할 수 없습니다."
  }[reason] || "링크를 확인할 수 없습니다.";
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>구매 복원</title><p>${message}</p>`;
}

function readEmail(body, contentType) {
  if (contentType.includes("application/x-www-form-urlencoded")) return new URLSearchParams(body).get("email") || "";
  try {
    const parsed = JSON.parse(body);
    return typeof parsed?.email === "string" ? parsed.email : "";
  } catch {
    return "";
  }
}

function bearer(authorization) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization || "");
  return match ? match[1] : "";
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function httpsOrigin(value) {
  if (typeof value !== "string" || !value.startsWith("https://")) return "";
  try {
    const url = new URL(value);
    if (url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function lowerHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) result[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : String(value ?? "");
  return result;
}

function json(status, body) {
  return { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body };
}

function html(status, body) {
  return { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body };
}
