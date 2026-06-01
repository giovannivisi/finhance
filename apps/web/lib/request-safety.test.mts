import assert from "node:assert/strict";
import test from "node:test";
import { getRepeatedActionNotice } from "./request-safety.ts";

test("getRepeatedActionNotice returns a calm notice for known lock and cooldown messages", () => {
  assert.equal(
    getRepeatedActionNotice({
      status: 409,
      error: "Refresh already in progress.",
    }),
    "Refresh already in progress.",
  );
  assert.equal(
    getRepeatedActionNotice({
      status: 429,
      error: "Refresh is cooling down. Try again in 5s.",
    }),
    "Refresh is cooling down. Try again in 5s.",
  );
  assert.equal(
    getRepeatedActionNotice({
      status: 409,
      error: "Snapshot capture already in progress.",
    }),
    "Snapshot capture already in progress.",
  );
  assert.equal(
    getRepeatedActionNotice({
      status: 409,
      error: "Recurring materialization already in progress.",
    }),
    "Recurring materialization already in progress.",
  );
  assert.equal(
    getRepeatedActionNotice({
      status: 429,
      error: "Recurring materialization is cooling down. Try again in 15s.",
    }),
    "Recurring materialization is cooling down. Try again in 15s.",
  );
});

test("getRepeatedActionNotice leaves real throttle and unexpected failures alone", () => {
  assert.equal(
    getRepeatedActionNotice({
      status: 429,
      error: "ThrottlerException: Too Many Requests",
    }),
    null,
  );
  assert.equal(
    getRepeatedActionNotice({
      status: 409,
      error: "This Idempotency-Key was already used for a different request.",
    }),
    null,
  );
  assert.equal(
    getRepeatedActionNotice({
      status: 500,
      error: "Unexpected failure",
    }),
    null,
  );
  assert.equal(
    getRepeatedActionNotice({
      status: null,
      error: "Network down",
    }),
    null,
  );
});
