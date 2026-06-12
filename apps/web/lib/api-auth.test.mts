import assert from "node:assert/strict";
import test from "node:test";
import { resolveServerApiBaseUrl } from "./api-base-url.ts";
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

test("resolveServerApiBaseUrl prefers an explicit internal API URL", () => {
  assert.equal(
    resolveServerApiBaseUrl({
      API_INTERNAL_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_API_URL: "https://api.finhance.test",
      NODE_ENV: "development",
    }),
    "http://127.0.0.1:3100",
  );
});

test("resolveServerApiBaseUrl prefers loopback during local development", () => {
  assert.equal(
    resolveServerApiBaseUrl({
      NEXT_PUBLIC_API_URL: "https://api.finhance.test",
      NODE_ENV: "development",
    }),
    "http://127.0.0.1:3000",
  );
});

test("resolveServerApiBaseUrl keeps the configured public URL in production", () => {
  assert.equal(
    resolveServerApiBaseUrl({
      NEXT_PUBLIC_API_URL: "https://api.finhance.test",
      NODE_ENV: "production",
    }),
    "https://api.finhance.test",
  );
});
