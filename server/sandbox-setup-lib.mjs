const teamId = "team_7A2C5vQUsgoJuv19XuiFZ0j7";
const projectName = "dot-copy-paste";
const SANDBOX_API = "https://sandbox-api.paddle.com";

export function classifyPaddleKey(key) {
  if (typeof key !== "string" || !key) return "missing";
  if (key.startsWith("pdl_live_")) return "live";
  if (key.startsWith("pdl_sdbx_")) return "sandbox";
  return "other";
}

export function sandboxConnectionCheck({ keyKind, paddleEnv, apiBase = SANDBOX_API, clientToken = "" } = {}) {
  if (keyKind === "live" || paddleEnv === "live") return "live";
  if (keyKind !== "sandbox" || paddleEnv !== "sandbox") return "missing";
  if (apiBase !== SANDBOX_API) return "api-host";
  if (clientToken && !/^test_[A-Za-z0-9_]+$/.test(clientToken)) return "client-token";
  return "ok";
}

export async function ensureSandbox({ paddleKey = "", paddleEnv = "", licenseBase = "", vercelToken = "", fetchImpl = fetch } = {}) {
  const lines = [];
  const log = (line) => lines.push(line);
  const keyKind = classifyPaddleKey(paddleKey);
  log(`key_kind=${keyKind}`);
  const connection = sandboxConnectionCheck({ keyKind, paddleEnv, apiBase: SANDBOX_API });
  if (connection === "live") return finish(lines, false, "refusing=live");
  if (connection !== "ok") return finish(lines, false, "paddle=missing");
  async function paddle(path, options = {}) {
    const response = await fetchImpl(`${SANDBOX_API}${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${paddleKey}`,
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
    if (!response.ok) {
      const code = body?.error?.code || response.status;
      throw new Error(`paddle-${code}`);
    }
    return body;
  }

  let auth;
  try {
    auth = await paddle("/event-types?per_page=1");
  } catch (error) {
    log("auth=rejected");
    log(`auth_error=${error instanceof Error ? error.message : "paddle-error"}`);
    return { ok: false, lines };
  }
  log("auth=ok");
  log(`auth_rows=${Array.isArray(auth.data) ? auth.data.length : 0}`);

  const products = await paddle("/products?per_page=200");
  const rows = Array.isArray(products.data) ? products.data : [];
  const blocked = (name) => /status monitor|ai status/i.test(name || "");
  if (rows.some((product) => blocked(product.name) && product.name === "Dot Copy Paste")) return finish(lines, false, "refusing=name-conflict");
  let product = rows.find((item) => item.name === "Dot Copy Paste" && !blocked(item.name));
  if (!product) {
    const created = await paddle("/products", {
      method: "POST",
      body: JSON.stringify({
        name: "Dot Copy Paste",
        tax_category: "standard",
        description: "One-time loaded-message export for Dot Copy Paste. Full-thread export is not included.",
        custom_data: { catalog: "dot-copy-paste-export" }
      })
    });
    product = created.data;
    log("product_created=true");
  } else {
    log("product_created=false");
  }
  if (!product?.id || blocked(product.name)) return finish(lines, false, "refusing=product");

  const prices = await paddle(`/prices?product_id=${encodeURIComponent(product.id)}&per_page=200`);
  const priceRows = Array.isArray(prices.data) ? prices.data : [];
  let price = priceRows.find((item) => item.unit_price?.amount === "4900" && item.unit_price?.currency_code === "KRW" && item.tax_mode === "internal" && item.status !== "archived");
  if (!price) {
    const created = await paddle("/prices", {
      method: "POST",
      body: JSON.stringify({
        product_id: product.id,
        description: "Dot Copy Paste one-time KRW 4900",
        unit_price: { amount: "4900", currency_code: "KRW" },
        unit_price_overrides: [
          { country_codes: ["KR"], unit_price: { amount: "4900", currency_code: "KRW" } }
        ],
        tax_mode: "internal",
        quantity: { minimum: 1, maximum: 1 }
      })
    });
    price = created.data;
    log("price_created=true");
  } else {
    log("price_created=false");
  }
  log(`product=${product.id}`);
  log(`price=${price.id}`);
  log(`amount=${price.unit_price?.amount || ""}`);
  log(`currency=${price.unit_price?.currency_code || ""}`);
  log(`tax_mode=${price.tax_mode || ""}`);

  const preview = await paddle("/pricing-preview", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: price.id, quantity: 1 }],
      address: { country_code: "KR" },
      currency_code: "KRW"
    })
  });
  const line = preview.data?.details?.line_items?.[0]?.totals || {};
  const overall = preview.data?.details?.totals || {};
  const currency = overall.currency_code || preview.data?.currency_code || "";
  const paid = String(overall.grand_total || overall.total || line.total || "");
  log(`preview_currency=${currency}`);
  log(`preview_subtotal=${overall.subtotal || line.subtotal || ""}`);
  log(`preview_tax=${overall.tax || line.tax || ""}`);
  log(`preview_total=${paid}`);
  const itemCount = Array.isArray(preview.data?.details?.line_items) ? preview.data.details.line_items.length : 0;
  if (paid !== "4900" || currency !== "KRW" || itemCount !== 1) return finish(lines, false, "refusing=tax-total");

  const tokens = await paddle("/client-tokens?per_page=200");
  const tokenRows = Array.isArray(tokens.data) ? tokens.data : [];
  let client = tokenRows.find((item) => item.name === "Dot Copy Paste sandbox" && item.status !== "revoked" && /^test_[A-Za-z0-9_]+$/.test(item.token || ""));
  if (!client) {
    const created = await paddle("/client-tokens", {
      method: "POST",
      body: JSON.stringify({
        name: "Dot Copy Paste sandbox",
        description: "Sandbox checkout for Dot Copy Paste only."
      })
    });
    client = created.data;
    log("client_token_created=true");
  } else {
    log("client_token_created=false");
  }
  const clientToken = client?.token || "";
  log(`client_token_present=${/^test_[A-Za-z0-9_]+$/.test(clientToken)}`);
  if (!/^test_[A-Za-z0-9_]+$/.test(clientToken)) return finish(lines, false, "refusing=client-token");

  const origin = (licenseBase || "https://dot-copy-paste.vercel.app").replace(/\/$/, "");
  const destination = `${origin}/api/webhook`;
  const events = ["transaction.completed", "adjustment.created", "adjustment.updated"];
  const existing = await paddle("/notification-settings?per_page=200");
  const destinations = Array.isArray(existing.data) ? existing.data : [];
  if (destinations.some((item) => /status monitor|ai-status-monitor/i.test(`${item.description || ""} ${item.destination || ""}`) && item.destination === destination)) {
    return finish(lines, false, "refusing=webhook-conflict");
  }
  const current = destinations.find((item) => item.destination === destination && item.description === "Dot Copy Paste sandbox");
  let webhookSecret = "";
  if (!current) {
    const created = await paddle("/notification-settings", {
      method: "POST",
      body: JSON.stringify({
        description: "Dot Copy Paste sandbox",
        type: "url",
        destination,
        subscribed_events: events,
        traffic_source: "all",
        api_version: 1
      })
    });
    webhookSecret = created.data?.endpoint_secret_key || "";
    log("webhook=created");
    log(`subscribed=${events.join(",")}`);
  } else {
    const subscribed = (current.subscribed_events || []).map((item) => item.name || item);
    log("webhook=present");
    log(`subscribed=${subscribed.join(",")}`);
    if (events.some((name) => !subscribed.includes(name)) || subscribed.includes("transaction.refunded")) {
      await paddle(`/notification-settings/${encodeURIComponent(current.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ subscribed_events: events, traffic_source: "all" })
      });
      log("webhook_events=updated");
    }
  }
  log(`secret_received=${Boolean(webhookSecret)}`);
  log(`destination_host=${new URL(destination).host}`);

  const saved = await saveSettings(vercelToken, {
    DCP_PADDLE_ENV: "sandbox",
    DCP_PADDLE_PRODUCT_ID: product.id,
    DCP_PADDLE_PRICE_ID: price.id,
    DCP_PADDLE_CLIENT_TOKEN: clientToken,
    ...(webhookSecret ? { DCP_PADDLE_WEBHOOK_SECRET: webhookSecret } : {})
  });
  for (const [name, status] of Object.entries(saved)) log(`saved_${name}=${status}`);
  const required = ["DCP_PADDLE_ENV", "DCP_PADDLE_PRODUCT_ID", "DCP_PADDLE_PRICE_ID", "DCP_PADDLE_CLIENT_TOKEN"];
  if (webhookSecret) required.push("DCP_PADDLE_WEBHOOK_SECRET");
  const savedOk = required.every((name) => saved[name] === "created" || saved[name] === "unchanged");
  return { ok: savedOk, lines };
}

function finish(lines, ok, line) {
  lines.push(line);
  return { ok, lines };
}

async function saveSettings(token, entries) {
  const result = {};
  if (!token) {
    for (const name of Object.keys(entries)) result[name] = "unreadable-auth";
    return result;
  }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const listed = await fetch(`https://api.vercel.com/v9/projects/${projectName}/env?teamId=${teamId}`, { headers });
  const body = await listed.json();
  const rows = Array.isArray(body.envs) ? body.envs : [];
  for (const [name, value] of Object.entries(entries)) {
    if (/^(POSTGRES|PG|DATABASE|NEON)/.test(name) || name === "DCP_PADDLE_API_KEY") {
      result[name] = "refused";
      continue;
    }
    if (rows.some((row) => row.key === name)) {
      result[name] = "unchanged";
      continue;
    }
    const type = name === "DCP_PADDLE_ENV" || name.endsWith("_ID") ? "plain" : "sensitive";
    const response = await fetch(`https://api.vercel.com/v10/projects/${projectName}/env?teamId=${teamId}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ key: name, value, type, target: ["production", "preview"] })
    });
    result[name] = response.status === 200 || response.status === 201 ? "created" : `http-${response.status}`;
  }
  return result;
}
