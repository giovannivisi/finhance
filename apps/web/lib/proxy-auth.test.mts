import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignInRedirectUrl,
  isPublicHostedProxyPath,
  resolveProxyAuthorization,
} from "./proxy-auth.ts";

test("buildSignInRedirectUrl preserves the requested path and query", () => {
  assert.equal(
    buildSignInRedirectUrl("https://finhance.test/review?month=2026-05"),
    "https://finhance.test/login?callbackUrl=%2Freview%3Fmonth%3D2026-05",
  );
});

test("isPublicHostedProxyPath allows public auth pages and the privacy notice without a hosted session", () => {
  assert.equal(isPublicHostedProxyPath("/"), true);
  assert.equal(isPublicHostedProxyPath("/login"), true);
  assert.equal(isPublicHostedProxyPath("/login/"), true);
  assert.equal(isPublicHostedProxyPath("/signup"), true);
  assert.equal(isPublicHostedProxyPath("/privacy"), true);
  assert.equal(isPublicHostedProxyPath("/privacy/"), true);
});

test("isPublicHostedProxyPath keeps workspace pages behind hosted auth", () => {
  assert.equal(isPublicHostedProxyPath("/dashboard"), false);
  assert.equal(isPublicHostedProxyPath("/privacy/settings"), false);
});

test("resolveProxyAuthorization returns a 401 response without a hosted session", async () => {
  const result = await resolveProxyAuthorization({
    hostedAuthMode: true,
    sessionUser: null,
    mintToken: async () => {
      throw new Error("mintToken should not run");
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected an authentication failure");
  }

  assert.equal(result.response.status, 401);
  assert.deepEqual(await result.response.json(), {
    message: "Authentication is required.",
  });
});

test("resolveProxyAuthorization forwards a bearer token for hosted sessions", async () => {
  const calls: Array<{ userId: string; email?: string | null }> = [];

  const result = await resolveProxyAuthorization({
    hostedAuthMode: true,
    sessionUser: {
      id: "user-123",
      email: "person@example.com",
    },
    mintToken: async (payload) => {
      calls.push(payload);
      return "signed-token";
    },
  });

  assert.deepEqual(calls, [
    {
      userId: "user-123",
      email: "person@example.com",
    },
  ]);
  assert.deepEqual(result, {
    ok: true,
    authorizationHeader: "Bearer signed-token",
  });
});

test("resolveProxyAuthorization skips token minting outside hosted mode", async () => {
  const result = await resolveProxyAuthorization({
    hostedAuthMode: false,
    sessionUser: null,
    mintToken: async () => {
      throw new Error("mintToken should not run");
    },
  });

  assert.deepEqual(result, {
    ok: true,
    authorizationHeader: null,
  });
});
