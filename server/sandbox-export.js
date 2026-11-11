const PRODUCT_ID = "dot-copy-paste-export";

export function sandboxVerifyEnabled(env = {}) {
  return env.DCP_SANDBOX_EXPORT === "verify" && env.DCP_PADDLE_ENV === "sandbox";
}

export function withSandboxVerify(body, env) {
  if (!sandboxVerifyEnabled(env) || !body || typeof body !== "object") return body;
  const sandboxPurchase = body.entitled === false
    && body.state === "sandbox"
    && body.channel === "sandbox"
    && body.source === "server"
    && body.productId === PRODUCT_ID
    && body.amount === 4900
    && body.currency === "KRW";
  if (!sandboxPurchase) return body;
  return { ...body, exportVerify: "sandbox" };
}
