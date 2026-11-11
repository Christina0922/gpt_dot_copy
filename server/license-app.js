import { createAccount } from "./accounts.js";
import { applyDecision, interpretNotification, statusForToken } from "./purchase.js";
import { verifySignature } from "./signature.js";

export const EXPECTED_PRODUCT = Object.freeze({
  productId: "dot-copy-paste-export",
  priceId: "pri_dcp_export_test",
  amount: 4900,
  currency: "KRW"
});

export function createLicenseApp(store, { secret, expected = EXPECTED_PRODUCT, now = () => Date.now() } = {}) {
  return {
    createSession() {
      return createAccount(store);
    },
    status(authorization) {
      try {
        if (store.failReads) return { status: 503, body: { entitled: false, state: "unavailable", source: "server" } };
        const token = bearer(authorization);
        if (!token) return { status: 401, body: { entitled: false, state: "not-purchased", source: "server" } };
        return { status: 200, body: statusForToken(store, token) };
      } catch {
        return { status: 503, body: { entitled: false, state: "unavailable", source: "server" } };
      }
    },
    statusByEmail() {
      return { status: 401, body: { entitled: false, state: "not-purchased", source: "server" } };
    },
    webhook({ rawBody, header }) {
      if (!verifySignature(rawBody, header, secret, now())) return { status: 401, granted: false };
      let notification;
      try {
        notification = JSON.parse(rawBody);
      } catch {
        return { status: 400, granted: false };
      }
      const result = applyDecision(store, interpretNotification(notification, expected));
      return { status: 200, granted: result.granted === true, duplicate: result.duplicate === true };
    },
    clientSuccess() {
      return { status: 400, granted: false };
    },
    confirmByLookup({ transactionId, accountId, lookup }) {
      if (typeof lookup !== "function") return Promise.resolve({ granted: false, reason: "no-provider-lookup" });
      return Promise.resolve()
        .then(() => lookup(transactionId))
        .then((remote) => {
          const decision = interpretNotification({
            event_id: `lookup:${transactionId}`,
            event_type: "transaction.completed",
            data: remote
          }, expected);
          if (decision.action !== "grant" || decision.accountId !== accountId) return { granted: false };
          return applyDecision(store, decision);
        })
        .catch(() => ({ granted: false, reason: "lookup-failed" }));
    }
  };
}

export function paddleConfigFromEnv(env = {}) {
  const environment = env.DCP_PADDLE_ENV === "sandbox" || env.DCP_PADDLE_ENV === "live" ? env.DCP_PADDLE_ENV : "";
  return {
    environment,
    apiKeyPresent: Boolean(env.DCP_PADDLE_API_KEY),
    webhookSecretPresent: Boolean(env.DCP_PADDLE_WEBHOOK_SECRET),
    priceId: typeof env.DCP_PADDLE_PRICE_ID === "string" ? env.DCP_PADDLE_PRICE_ID : "",
    productId: typeof env.DCP_PADDLE_PRODUCT_ID === "string" ? env.DCP_PADDLE_PRODUCT_ID : "",
    apiBase: typeof env.DCP_LICENSE_API_BASE === "string" ? env.DCP_LICENSE_API_BASE : "",
    providerApiOrigin: "https://api.paddle.com"
  };
}

export function paddleReady(config) {
  return Boolean(
    config
    && (config.environment === "sandbox" || config.environment === "live")
    && config.apiKeyPresent
    && config.webhookSecretPresent
    && config.priceId
    && config.productId
    && /^https:\/\//.test(config.apiBase)
  );
}

function bearer(authorization) {
  if (typeof authorization !== "string") return "";
  const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization);
  return match ? match[1] : "";
}
