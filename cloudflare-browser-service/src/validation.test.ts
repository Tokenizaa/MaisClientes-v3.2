import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SESSION_TTL_MS, MAX_SESSION_TTL_MS, MIN_SESSION_TTL_MS, isValidSessionId, parseSessionTtl } from "./validation.ts";

test("session TTL defaults safely", () => {
  assert.equal(parseSessionTtl(undefined), DEFAULT_SESSION_TTL_MS);
});

test("session TTL accepts documented Cloudflare bounds", () => {
  assert.equal(parseSessionTtl(MIN_SESSION_TTL_MS), MIN_SESSION_TTL_MS);
  assert.equal(parseSessionTtl(MAX_SESSION_TTL_MS), MAX_SESSION_TTL_MS);
});

test("session TTL rejects invalid values", () => {
  for (const value of [0, 9_999, 1_200_001, 1.5, "600000"]) {
    assert.throws(() => parseSessionTtl(value));
  }
});

test("session IDs must be UUIDs", () => {
  assert.equal(isValidSessionId("1909cef7-23e8-4394-bc31-27404bf4348f"), true);
  assert.equal(isValidSessionId("../other-session"), false);
});
