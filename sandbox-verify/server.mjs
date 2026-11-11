import { createLicenseHandler } from "../server/http.js";
import { createMemoryRuntime } from "../server/runtime.js";

export const SANDBOX_VERIFY_ENV = Object.freeze({
  DCP_PADDLE_ENV: "sandbox",
  DCP_SANDBOX_EXPORT: "verify",
  DCP_PADDLE_WEBHOOK_SECRET: "test-only-webhook-secret",
  DCP_PADDLE_PRODUCT_ID: "dot-copy-paste-export",
  DCP_PADDLE_PRICE_ID: "pri_dcp_export_test",
  DCP_LICENSE_API_BASE: "http://127.0.0.1:8787"
});

export function createSandboxVerifyRuntime(now = () => Date.now()) {
  const runtime = createMemoryRuntime();
  return {
    runtime,
    handle: createLicenseHandler({ runtime, env: SANDBOX_VERIFY_ENV, now, mailer() { return { sent: false, reason: "mail-not-used" }; } })
  };
}
