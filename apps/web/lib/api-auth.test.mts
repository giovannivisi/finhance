import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidApiPathError,
  normalizeDirectApiPath,
  resolveDirectApiUrl,
} from "./api-url.ts";

test("normalizeDirectApiPath accepts relative API paths", () => {
  assert.equal(
    normalizeDirectApiPath("/accounts?archived=false"),
    "/accounts?archived=false",
  );
  assert.equal(normalizeDirectApiPath("accounts"), "/accounts");
});

test("normalizeDirectApiPath rejects absolute and protocol-relative paths", () => {
  assert.throws(
    () => normalizeDirectApiPath("//attacker.example"),
    InvalidApiPathError,
  );
  assert.throws(
    () => normalizeDirectApiPath("\\\\attacker.example"),
    InvalidApiPathError,
  );
  assert.throws(
    () => normalizeDirectApiPath("https://attacker.example"),
    InvalidApiPathError,
  );
  assert.throws(
    () => normalizeDirectApiPath("/\\\\attacker.example"),
    InvalidApiPathError,
  );
});

test("resolveDirectApiUrl keeps requests pinned to the configured API origin", () => {
  assert.equal(
    resolveDirectApiUrl(
      "/accounts?archived=false",
      "https://api.finhance.test/",
    ),
    "https://api.finhance.test/accounts?archived=false",
  );
});
