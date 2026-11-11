import fs from "node:fs";
import { ensureSandbox } from "./sandbox-setup-lib.mjs";

let vercelToken = "";
try {
  const auth = JSON.parse(fs.readFileSync(`${process.env.APPDATA}\\com.vercel.cli\\Data\\auth.json`, "utf8"));
  vercelToken = auth.token || "";
} catch {
  vercelToken = "";
}

const result = await ensureSandbox({
  paddleKey: process.env.DCP_PADDLE_API_KEY || "",
  paddleEnv: process.env.DCP_PADDLE_ENV || "",
  licenseBase: process.env.DCP_LICENSE_API_BASE || "",
  vercelToken
});
for (const line of result.lines) console.log(line);
process.exit(result.ok ? 0 : 2);
