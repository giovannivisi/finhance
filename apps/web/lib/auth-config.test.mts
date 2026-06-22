import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_SIGNUP_MODE_BOOTSTRAP,
  AUTH_SIGNUP_MODE_OPEN,
  LOCAL_DEV_AUTH_SECRET,
  resolveAuthSignupMode,
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

test("resolveBootstrapEmail only requires the bootstrap email in hosted bootstrap mode", () => {
  assert.equal(
    resolveBootstrapEmail(
      createEnv({
        AUTH_MODE: "hosted",
        AUTH_SIGNUP_MODE: "open",
      }),
    ),
    null,
  );
  assert.equal(
    resolveBootstrapEmail(
      createEnv({
        AUTH_MODE: "local",
      }),
    ),
    null,
  );
  assert.throws(
    () =>
      resolveBootstrapEmail(
        createEnv({
          AUTH_MODE: "hosted",
          AUTH_SIGNUP_MODE: "bootstrap",
        }),
      ),
    /AUTH_BOOTSTRAP_EMAIL/,
  );
});

test("resolveAuthSignupMode defaults to bootstrap and accepts open mode", () => {
  assert.equal(
    resolveAuthSignupMode(createEnv({})),
    AUTH_SIGNUP_MODE_BOOTSTRAP,
  );
  assert.equal(
    resolveAuthSignupMode(createEnv({ AUTH_SIGNUP_MODE: " open " })),
    AUTH_SIGNUP_MODE_OPEN,
  );
  assert.throws(
    () => resolveAuthSignupMode(createEnv({ AUTH_SIGNUP_MODE: "public" })),
    /AUTH_SIGNUP_MODE/,
  );
});
