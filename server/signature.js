import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

export function signBody(rawBody, secret, now = Date.now()) {
  const timestamp = Math.floor(now / 1000);
  const hash = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  return `ts=${timestamp};h1=${hash}`;
}

export function verifySignature(rawBody, header, secret, now = Date.now()) {
  if (typeof rawBody !== "string" || typeof header !== "string" || !secret) return false;
  let timestamp = "";
  const hashes = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") timestamp = value;
    if (key === "h1" && value) hashes.push(value);
  }
  if (!/^\d+$/.test(timestamp) || hashes.length === 0) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > MAX_SKEW_MS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  return hashes.some((hash) => {
    const actual = Buffer.from(hash);
    return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
  });
}
