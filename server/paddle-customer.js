export function sandboxApiBase(env) {
  return env?.DCP_PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "";
}

export function sandboxKey(env) {
  const key = env?.DCP_PADDLE_API_KEY;
  return typeof key === "string" && key.startsWith("pdl_sdbx_") ? key : "";
}

export async function readCustomerEmail(env, customerId, fetchImpl = fetch) {
  const base = sandboxApiBase(env);
  const key = sandboxKey(env);
  if (!base || !key || typeof customerId !== "string" || !/^ctm_[A-Za-z0-9]+$/.test(customerId)) return "";
  try {
    const response = await fetchImpl(`${base}/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (!response?.ok || typeof response.json !== "function") return "";
    const body = await response.json();
    return typeof body?.data?.email === "string" ? body.data.email : "";
  } catch {
    return "";
  }
}
