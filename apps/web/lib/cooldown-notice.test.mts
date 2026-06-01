import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCooldownNotice,
  parseCooldownNotice,
} from "./cooldown-notice.ts";

test("parseCooldownNotice extracts the countdown prefix and seconds", () => {
  assert.deepEqual(
    parseCooldownNotice("Refresh is cooling down. Try again in 36s."),
    {
      prefix: "Refresh is cooling down. Try again in ",
      seconds: 36,
    },
  );
});

test("parseCooldownNotice ignores non-countdown notices", () => {
  assert.equal(
    parseCooldownNotice("Snapshot capture already in progress."),
    null,
  );
  assert.equal(parseCooldownNotice(null), null);
});

test("formatCooldownNotice rebuilds the message with updated seconds", () => {
  const parsed = parseCooldownNotice(
    "Recurring materialization is cooling down. Try again in 15s.",
  );

  assert.ok(parsed);
  assert.equal(
    formatCooldownNotice(parsed, 9),
    "Recurring materialization is cooling down. Try again in 9s.",
  );
  assert.equal(
    formatCooldownNotice(parsed, 0),
    "Recurring materialization is cooling down. Try again in 0s.",
  );
});
