import { createLicenseHandler } from "../server/http.js";
import { runtimeFromEnv } from "../server/runtime.js";

export const config = {
  api: {
    bodyParser: false
  }
};

const handle = createLicenseHandler({
  runtime: runtimeFromEnv(process.env),
  env: process.env
});

function readRaw(req) {
  if (typeof req.body === "string") return Promise.resolve(req.body);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body.toString("utf8"));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export default async function vercelHandler(req, res) {
  try {
    const body = req.method === "GET" || req.method === "HEAD" ? "" : await readRaw(req);
    const result = await handle({
      method: req.method,
      path: req.url || "/",
      headers: req.headers || {},
      body
    });
    res.statusCode = result.status;
    for (const [key, value] of Object.entries(result.headers || {})) {
      if (value) res.setHeader(key, value);
    }
    res.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body));
  } catch {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, state: "unavailable" }));
  }
}
