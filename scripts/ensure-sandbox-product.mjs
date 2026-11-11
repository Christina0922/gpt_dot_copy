const env = process.env;
const environment = env.DCP_PADDLE_ENV;
const key = env.DCP_PADDLE_API_KEY || "";

if (environment === "live") {
  console.log("refusing=live");
  process.exit(2);
}
if (environment !== "sandbox" || !key) {
  console.log("paddle=missing");
  process.exit(2);
}

const base = "https://sandbox-api.paddle.com";

async function paddle(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${key}`,
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

function blocked(name) {
  return /status monitor|ai status/i.test(name || "");
}

const products = await paddle("/products?per_page=200");
const rows = Array.isArray(products.data) ? products.data : [];
if (rows.some((product) => blocked(product.name) && product.name === "Dot Copy Paste")) {
  console.log("refusing=name-conflict");
  process.exit(2);
}

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
}

const prices = await paddle(`/prices?product_id=${encodeURIComponent(product.id)}&per_page=200`);
const priceRows = Array.isArray(prices.data) ? prices.data : [];
let price = priceRows.find((item) => item.unit_price?.amount === "4900" && item.unit_price?.currency_code === "KRW" && item.status !== "archived");
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
}

console.log(`product=${product.id}`);
console.log(`price=${price.id}`);
console.log(`amount=${price.unit_price?.amount || ""}`);
console.log(`currency=${price.unit_price?.currency_code || ""}`);
console.log(`tax_mode=${price.tax_mode || ""}`);

const origin = (env.DCP_LICENSE_API_BASE || "https://dot-copy-paste.vercel.app").replace(/\/$/, "");
const destination = `${origin}/api/webhook`;
const events = ["transaction.completed", "adjustment.created", "adjustment.updated"];
const existing = await paddle("/notification-settings?per_page=200");
const destinations = Array.isArray(existing.data) ? existing.data : [];
const current = destinations.find((item) => item.destination === destination);
if (destinations.some((item) => /status monitor|ai-status-monitor/i.test(`${item.description || ""} ${item.destination || ""}`) && item.destination === destination)) {
  console.log("refusing=webhook-conflict");
  process.exit(2);
}
if (!current) {
  const created = await paddle("/notification-settings", {
    method: "POST",
    body: JSON.stringify({
      description: "Dot Copy Paste sandbox",
      type: "url",
      destination,
      subscribed_events: events,
      api_version: 1
    })
  });
  const secret = created.data?.endpoint_secret_key || "";
  console.log("webhook=created");
  console.log(`secret_received=${Boolean(secret)}`);
  if (secret) await saveWebhookSecret(secret);
} else {
  console.log("webhook=present");
}
console.log(`events=${events.join(",")}`);

async function saveWebhookSecret(secret) {
  try {
    const fs = await import("node:fs");
    const auth = JSON.parse(fs.readFileSync(`${process.env.APPDATA}\\com.vercel.cli\\Data\\auth.json`, "utf8"));
    const response = await fetch("https://api.vercel.com/v10/projects/dot-copy-paste/env?teamId=team_7A2C5vQUsgoJuv19XuiFZ0j7", {
      method: "POST",
      headers: { authorization: `Bearer ${auth.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        key: "DCP_PADDLE_WEBHOOK_SECRET",
        value: secret,
        type: "encrypted",
        target: ["production", "preview"]
      })
    });
    console.log(`secret_saved=${response.status === 201 || response.status === 200}`);
  } catch {
    console.log("secret_saved=false");
  }
}
