import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMobileTokenRedirectLocation,
  mintMobileSessionToken,
  readBearerToken,
  resolveMobileRedirectTarget,
  verifyMobileSessionToken,
} from "./mobile-auth.core.ts";

const AUTH_SECRET = "test-secret-for-mobile-tokens";

test("mobile session tokens round-trip with user id and email", async () => {
  const token = await mintMobileSessionToken({
    userId: "user-123",
    email: "user@example.com",
    authSecret: AUTH_SECRET,
  });

  const claims = await verifyMobileSessionToken(token, AUTH_SECRET);

  assert.deepEqual(claims, {
    userId: "user-123",
    email: "user@example.com",
  });
});

test("mobile session tokens omit email when absent", async () => {
  const token = await mintMobileSessionToken({
    userId: "user-123",
    authSecret: AUTH_SECRET,
  });

  const claims = await verifyMobileSessionToken(token, AUTH_SECRET);

  assert.deepEqual(claims, { userId: "user-123", email: null });
});

test("verification rejects the wrong secret", async () => {
  const token = await mintMobileSessionToken({
    userId: "user-123",
    authSecret: AUTH_SECRET,
  });

  assert.equal(await verifyMobileSessionToken(token, "other-secret"), null);
});

test("verification rejects expired tokens", async () => {
  const token = await mintMobileSessionToken({
    userId: "user-123",
    authSecret: AUTH_SECRET,
    ttl: "0s",
  });

  assert.equal(await verifyMobileSessionToken(token, AUTH_SECRET), null);
});

test("verification rejects garbage tokens", async () => {
  assert.equal(await verifyMobileSessionToken("not-a-jwt", AUTH_SECRET), null);
});

test("readBearerToken parses Authorization headers", () => {
  assert.equal(readBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(readBearerToken("bearer abc"), "abc");
  assert.equal(readBearerToken("Basic abc"), null);
  assert.equal(readBearerToken("Bearer "), null);
  assert.equal(readBearerToken(null), null);
});

test("redirect allowlist accepts the installed app target", () => {
  assert.equal(
    resolveMobileRedirectTarget("finhance://auth", {
      allowDevRedirects: false,
    }),
    "finhance://auth",
  );
});

test("redirect allowlist accepts Expo Go targets only in dev", () => {
  const expoRedirect = "exp://192.168.1.19:8081/--/auth";

  assert.equal(
    resolveMobileRedirectTarget(expoRedirect, { allowDevRedirects: true }),
    expoRedirect,
  );
  assert.equal(
    resolveMobileRedirectTarget(expoRedirect, { allowDevRedirects: false }),
    null,
  );
});

test("redirect allowlist rejects attacker-controlled targets", () => {
  const cases = [
    "https://evil.example/auth",
    "finhance://auth/extra",
    "finhance://other",
    "finhance://auth?leak=1",
    "exp://192.168.1.19:8081/--/other",
    "javascript:alert(1)",
    "",
    null,
  ];

  for (const candidate of cases) {
    assert.equal(
      resolveMobileRedirectTarget(candidate, { allowDevRedirects: true }),
      null,
      `expected rejection for ${candidate}`,
    );
  }
});

test("token redirect location carries the token in the fragment", () => {
  assert.equal(
    buildMobileTokenRedirectLocation("finhance://auth", "tok en"),
    "finhance://auth#token=tok%20en",
  );
});
