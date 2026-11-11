import { createServer } from "node:http";
import { createSandboxVerifyRuntime } from "./server.mjs";

const { handle } = createSandboxVerifyRuntime();
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const result = await handle({
    method: request.method,
    path: request.url,
    headers: request.headers,
    body: Buffer.concat(chunks).toString("utf8")
  });
  const headers = { ...(result.headers || {}), "cache-control": "no-store" };
  if (!headers["content-type"]) {
    headers["content-type"] = typeof result.body === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
  }
  response.writeHead(result.status, headers);
  response.end(typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {}));
});

server.listen(8787, "127.0.0.1", () => {
  console.log("sandbox_verify_server=http://127.0.0.1:8787");
  console.log("sale=preparing");
  console.log("sandboxExport=verify");
});
