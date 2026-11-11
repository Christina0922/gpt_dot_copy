import { classifyPaddleKey } from "./sandbox-setup-lib.mjs";

const key = process.env.DCP_PADDLE_API_KEY || "";
const kind = classifyPaddleKey(key);
console.log(`key_kind=${kind}`);
if (kind !== "sandbox") process.exit(2);

const response = await fetch("https://sandbox-api.paddle.com/event-types?per_page=1", {
  headers: { authorization: `Bearer ${key}` }
});
let code = "";
try {
  const body = await response.json();
  code = body?.error?.code || "";
  console.log(`auth_rows=${Array.isArray(body.data) ? body.data.length : 0}`);
} catch {
  console.log("auth_rows=0");
}
console.log(`auth_status=${response.status}`);
console.log(`auth=${response.ok ? "ok" : "rejected"}`);
if (code) console.log(`auth_code=${code}`);
process.exit(response.ok ? 0 : 2);
