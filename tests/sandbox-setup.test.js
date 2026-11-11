import assert from "node:assert/strict";
import test from "node:test";
import { classifyPaddleKey, ensureSandbox, sandboxConnectionCheck } from "../scripts/sandbox-setup-lib.mjs";

test("a live Paddle key stops before any API call", async () => {
  let called = 0;
  const result = await ensureSandbox({
    paddleKey: "pdl_live_example",
    paddleEnv: "sandbox",
    fetchImpl() {
      called += 1;
      throw new Error("called");
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.lines.includes("refusing=live"), true);
  assert.equal(called, 0);
});

test("sandbox connection checks reject a mismatched host or client token", () => {
  assert.equal(classifyPaddleKey("pdl_sdbx_example"), "sandbox");
  assert.equal(classifyPaddleKey("pdl_live_example"), "live");
  assert.equal(classifyPaddleKey(""), "missing");
  assert.equal(sandboxConnectionCheck({
    keyKind: "sandbox",
    paddleEnv: "sandbox",
    apiBase: "https://api.paddle.com",
    clientToken: "test_example"
  }), "api-host");
  assert.equal(sandboxConnectionCheck({
    keyKind: "sandbox",
    paddleEnv: "sandbox",
    clientToken: "live_example"
  }), "client-token");
  assert.equal(sandboxConnectionCheck({
    keyKind: "sandbox",
    paddleEnv: "sandbox",
    clientToken: "test_example"
  }), "ok");
});
