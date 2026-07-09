import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMobileCodeRedirectLocation,
  computePkceChallenge,
  isValidPkceChallenge,
  mintMobileAuthCode,
  mintMobilePasskeyChallengeToken,
  mintMobilePasskeyRegChallengeToken,
  mintMobileSessionToken,
  hasRecentMobileIssuedAt,
  readBearerToken,
  resolveActiveMobileTokenClaims,
  resolveMobileRedirectTarget,
  verifyMobileAuthCode,
  verifyMobilePasskeyChallengeToken,
  verifyMobilePasskeyRegChallengeToken,
  verifyMobileSessionToken,
  verifyPkceVerifier,
} from "./mobile-auth.core.ts";

const AUTH_SECRET = "test-secret-for-mobile-tokens";

// SHA-256("abc") — FIPS 180-2 test vector.
const ABC_CHALLENGE =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

function activeUser(
  overrides: Partial<{
    id: string;
    email: string | null;
    isActive: boolean;
    mobileTokensRevokedAt: Date | null;
  }> = {},
) {
  return {
    id: "user-123",
    email: "user@example.com",
    isActive: true,
    mobileTokensRevokedAt: null,
    ...overrides,
  };
}

test("mobile session tokens round-trip with user id, email, and issue time", async () => {
  const before = Date.now();
  const token = await mintMobileSessionToken({
    userId: "user-123",
    email: "user@example.com",
    authSecret: AUTH_SECRET,
  });

  const claims = await verifyMobileSessionToken(token, AUTH_SECRET);

  assert.equal(claims?.userId, "user-123");
  assert.equal(claims?.email, "user@example.com");
  assert.ok(claims?.issuedAt instanceof Date);
  assert.ok(claims.issuedAt.getTime() >= Math.floor(before / 1000) * 1000);
});

test("mobile session tokens omit email when absent", async () => {
  const token = await mintMobileSessionToken({
    userId: "user-123",
    authSecret: AUTH_SECRET,
  });

  const claims = await verifyMobileSessionToken(token, AUTH_SECRET);

  assert.equal(claims?.userId, "user-123");
  assert.equal(claims?.email, null);
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

test("passkey challenge tokens round-trip the embedded challenge", async () => {
  const challenge = "Zm9vYmFyLWNoYWxsZW5nZQ"; // base64url-ish value
  const token = await mintMobilePasskeyChallengeToken({
    challenge,
    authSecret: AUTH_SECRET,
  });

  assert.equal(
    await verifyMobilePasskeyChallengeToken(token, AUTH_SECRET),
    challenge,
  );
});

test("passkey challenge tokens reject the wrong secret and a session token", async () => {
  const token = await mintMobilePasskeyChallengeToken({
    challenge: "abc123",
    authSecret: AUTH_SECRET,
  });
  assert.equal(
    await verifyMobilePasskeyChallengeToken(token, "other-secret"),
    null,
  );

  // A session token must not satisfy the challenge audience.
  const sessionToken = await mintMobileSessionToken({
    userId: "user-123",
    authSecret: AUTH_SECRET,
  });
  assert.equal(
    await verifyMobilePasskeyChallengeToken(sessionToken, AUTH_SECRET),
    null,
  );
});

test("passkey registration challenge tokens bind the challenge to the user", async () => {
  const token = await mintMobilePasskeyRegChallengeToken({
    challenge: "registration-challenge",
    userId: "user-123",
    authSecret: AUTH_SECRET,
  });

  const claims = await verifyMobilePasskeyRegChallengeToken(token, AUTH_SECRET);

  assert.equal(claims?.challenge, "registration-challenge");
  assert.equal(claims?.userId, "user-123");
  assert.ok(claims?.jti && claims.jti.length > 0);
});

test("passkey registration challenge tokens carry unique jtis", async () => {
  const mint = () =>
    mintMobilePasskeyRegChallengeToken({
      challenge: "registration-challenge",
      userId: "user-123",
      authSecret: AUTH_SECRET,
    });

  const [first, second] = await Promise.all([mint(), mint()]);
  const [firstClaims, secondClaims] = await Promise.all([
    verifyMobilePasskeyRegChallengeToken(first, AUTH_SECRET),
    verifyMobilePasskeyRegChallengeToken(second, AUTH_SECRET),
  ]);

  assert.ok(firstClaims?.jti);
  assert.ok(secondClaims?.jti);
  assert.notEqual(firstClaims?.jti, secondClaims?.jti);
});

test("passkey registration challenge tokens reject other audiences", async () => {
  const authToken = await mintMobilePasskeyChallengeToken({
    challenge: "auth-challenge",
    authSecret: AUTH_SECRET,
  });

  assert.equal(
    await verifyMobilePasskeyRegChallengeToken(authToken, AUTH_SECRET),
    null,
  );
});

test("sign-in codes round-trip with the bound challenge", async () => {
  const code = await mintMobileAuthCode({
    userId: "user-123",
    email: "user@example.com",
    challenge: ABC_CHALLENGE,
    authSecret: AUTH_SECRET,
  });

  const claims = await verifyMobileAuthCode(code, AUTH_SECRET);

  assert.deepEqual(claims, {
    userId: "user-123",
    email: "user@example.com",
    challenge: ABC_CHALLENGE,
  });
});

test("sign-in codes are not accepted as session tokens and vice versa", async () => {
  const code = await mintMobileAuthCode({
    userId: "user-123",
    challenge: ABC_CHALLENGE,
    authSecret: AUTH_SECRET,
  });
  const token = await mintMobileSessionToken({
    userId: "user-123",
    authSecret: AUTH_SECRET,
  });

  assert.equal(await verifyMobileSessionToken(code, AUTH_SECRET), null);
  assert.equal(await verifyMobileAuthCode(token, AUTH_SECRET), null);
});

test("pkce challenge validation accepts only 64-char lowercase hex", () => {
  assert.equal(isValidPkceChallenge(ABC_CHALLENGE), true);
  assert.equal(isValidPkceChallenge(ABC_CHALLENGE.toUpperCase()), false);
  assert.equal(isValidPkceChallenge(ABC_CHALLENGE.slice(1)), false);
  assert.equal(isValidPkceChallenge(""), false);
  assert.equal(isValidPkceChallenge(null), false);
});

test("pkce verifier hashing matches the known sha-256 vector", async () => {
  assert.equal(await computePkceChallenge("abc"), ABC_CHALLENGE);
  assert.equal(await verifyPkceVerifier("abc", ABC_CHALLENGE), true);
  assert.equal(await verifyPkceVerifier("abd", ABC_CHALLENGE), false);
});

test("active user resolution rejects inactive mobile token users", () => {
  const claims = {
    userId: "user-123",
    email: "token@example.com",
    issuedAt: new Date(),
  };

  assert.equal(
    resolveActiveMobileTokenClaims(claims, activeUser({ isActive: false })),
    null,
  );
});

test("active user resolution prefers the stored user email", () => {
  const claims = {
    userId: "user-123",
    email: "token@example.com",
    issuedAt: new Date("2026-06-01T10:00:00Z"),
  };

  assert.deepEqual(resolveActiveMobileTokenClaims(claims, activeUser()), {
    userId: "user-123",
    email: "user@example.com",
    issuedAt: new Date("2026-06-01T10:00:00Z"),
  });
});

test("active user resolution rejects tokens issued before a revocation", () => {
  const claims = {
    userId: "user-123",
    email: null,
    issuedAt: new Date("2026-06-01T10:00:00Z"),
  };

  assert.equal(
    resolveActiveMobileTokenClaims(
      claims,
      activeUser({ mobileTokensRevokedAt: new Date("2026-06-01T10:00:05Z") }),
    ),
    null,
  );
});

test("active user resolution keeps tokens issued after a revocation", () => {
  const claims = {
    userId: "user-123",
    email: null,
    issuedAt: new Date("2026-06-01T10:00:10Z"),
  };

  assert.ok(
    resolveActiveMobileTokenClaims(
      claims,
      activeUser({ mobileTokensRevokedAt: new Date("2026-06-01T10:00:05Z") }),
    ),
  );
});

test("active user resolution survives a same-second revocation re-sign-in", () => {
  const claims = {
    userId: "user-123",
    email: null,
    issuedAt: new Date("2026-06-01T10:00:05.000Z"),
  };

  assert.ok(
    resolveActiveMobileTokenClaims(
      claims,
      activeUser({
        mobileTokensRevokedAt: new Date("2026-06-01T10:00:05.900Z"),
      }),
    ),
  );
});

test("active user resolution fails closed for tokens without an issue time", () => {
  const claims = { userId: "user-123", email: null, issuedAt: null };

  assert.equal(
    resolveActiveMobileTokenClaims(
      claims,
      activeUser({ mobileTokensRevokedAt: new Date() }),
    ),
    null,
  );
  assert.ok(resolveActiveMobileTokenClaims(claims, activeUser()));
});

test("recent mobile auth accepts only fresh issue times", () => {
  const now = new Date("2026-07-08T10:15:00Z").getTime();

  assert.equal(
    hasRecentMobileIssuedAt(new Date("2026-07-08T10:00:00Z"), now),
    true,
  );
  assert.equal(
    hasRecentMobileIssuedAt(new Date("2026-07-08T09:59:59Z"), now),
    false,
  );
  assert.equal(
    hasRecentMobileIssuedAt(new Date("2026-07-08T10:16:00Z"), now),
    false,
  );
  assert.equal(hasRecentMobileIssuedAt(null, now), false);
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

test("code redirect location carries the code in the fragment", () => {
  assert.equal(
    buildMobileCodeRedirectLocation("finhance://auth", "cod e"),
    "finhance://auth#code=cod%20e",
  );
});
