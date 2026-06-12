import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_DEV_AUTH_SECRET,
  resolveAuthSecret,
  resolveBootstrapEmail,
} from "./auth-config.ts";

function createEnv(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

test("resolveAuthSecret requires AUTH_SECRET in hosted mode", () => {
  assert.throws(
    () =>
      resolveAuthSecret(
        createEnv({
          AUTH_MODE: "hosted",
        }),
      ),
    /AUTH_SECRET/,
  );
});

test("resolveAuthSecret keeps the local development fallback outside hosted mode", () => {
  assert.equal(
    resolveAuthSecret(
      createEnv({
        AUTH_MODE: "local",
      }),
    ),
    LOCAL_DEV_AUTH_SECRET,
  );
});

test("resolveAuthSecret prefers an explicit configured secret", () => {
  assert.equal(
    resolveAuthSecret(
      createEnv({
        AUTH_MODE: "hosted",
        AUTH_SECRET: " hosted-secret ",
      }),
    ),
    "hosted-secret",
  );
});

test("resolveBootstrapEmail normalizes the configured bootstrap email", () => {
  assert.equal(
    resolveBootstrapEmail(
      createEnv({
        AUTH_MODE: "hosted",
        AUTH_BOOTSTRAP_EMAIL: " Owner@Example.com ",
      }),
    ),
    "owner@example.com",
  );
});
