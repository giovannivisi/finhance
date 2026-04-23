import assert from "node:assert/strict";
import test from "node:test";
import { shouldIgnoreRepeatedActionError } from "./request-safety.ts";

test("shouldIgnoreRepeatedActionError ignores expected repeat-action statuses", () => {
  assert.equal(shouldIgnoreRepeatedActionError(409), true);
  assert.equal(shouldIgnoreRepeatedActionError(429), true);
  assert.equal(shouldIgnoreRepeatedActionError(500), false);
  assert.equal(shouldIgnoreRepeatedActionError(null), false);
});
