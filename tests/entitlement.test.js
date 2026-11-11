import assert from "node:assert/strict";
import test from "node:test";
import { entitlementFromServer, mayExport, statusMessageKey } from "../extension/src/entitlement.js";

test("sandbox, signed-out, unpaid, and outage states stay distinct and do not export", () => {
  const sandbox = entitlementFromServer({ entitled: false, state: "sandbox", source: "server" });
  const signedOut = entitlementFromServer({ entitled: false, state: "unauthorized", source: "server" });
  const unpaid = entitlementFromServer({ entitled: false, state: "not-purchased", source: "server" });
  const outage = entitlementFromServer({ entitled: false, state: "unavailable", source: "server" });
  assert.equal(mayExport(sandbox), false);
  assert.equal(mayExport(signedOut), false);
  assert.equal(statusMessageKey(sandbox), "purchaseSandbox");
  assert.equal(statusMessageKey(signedOut), "purchaseSignIn");
  assert.equal(statusMessageKey(unpaid), "purchaseNone");
  assert.equal(statusMessageKey(outage), "purchaseUnavailable");
});
