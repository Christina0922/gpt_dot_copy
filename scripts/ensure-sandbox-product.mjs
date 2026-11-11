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
