import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as AUTHORIZE } from "@/api/mobile/connected-accounts/link/authorize/route";
import { GET as COMPLETE } from "@/api/mobile/connected-accounts/link/complete/route";
import { POST as CONFIRM } from "@/api/mobile/connected-accounts/link/confirm/route";
import { GET as OAUTH } from "@/api/mobile/connected-accounts/link/oauth/route";
import { POST as START } from "@/api/mobile/connected-accounts/link/start/route";
import { DELETE as UNLINK } from "@/api/mobile/connected-accounts/route";

const {
  consumeOneShotKeyMock,
  buildMobileCodeRedirectLocationMock,
  createMobileProviderLinkCookieMock,
  crossOriginRejectionMock,
  deleteConnectedAccountForUserMock,
  hostedModeMock,
  isConnectedAccountProviderMock,
  isValidPkceChallengeMock,
  linkConnectedAccountForUserMock,
  mintMobileProviderLinkStartMock,
  rateLimitRequestMock,
  redirectTargetMock,
  readMobileProviderLinkStateFromRequestMock,
  resolveMobileApiUserMock,
  signInMock,
  verifyMobileProviderLinkResultMock,
  verifyMobileProviderLinkStartMock,
  verifyPkceVerifierMock,
} = vi.hoisted(() => ({
  consumeOneShotKeyMock: vi.fn(),
  buildMobileCodeRedirectLocationMock: vi.fn(),
  createMobileProviderLinkCookieMock: vi.fn(),
  crossOriginRejectionMock: vi.fn(),
  deleteConnectedAccountForUserMock: vi.fn(),
  hostedModeMock: vi.fn(),
  isConnectedAccountProviderMock: vi.fn(),
  isValidPkceChallengeMock: vi.fn(),
  linkConnectedAccountForUserMock: vi.fn(),
  mintMobileProviderLinkStartMock: vi.fn(),
  rateLimitRequestMock: vi.fn(),
  redirectTargetMock: vi.fn(),
  readMobileProviderLinkStateFromRequestMock: vi.fn(),
  resolveMobileApiUserMock: vi.fn(),
  signInMock: vi.fn(),
  verifyMobileProviderLinkResultMock: vi.fn(),
  verifyMobileProviderLinkStartMock: vi.fn(),
  verifyPkceVerifierMock: vi.fn(),
}));

vi.mock("@lib/api-proxy", () => ({
  resolveCrossOriginRejection: crossOriginRejectionMock,
}));

vi.mock("@lib/auth", () => ({
  signIn: signInMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/connected-accounts", () => ({
  ConnectedAccountAlreadyLinkedError: class ConnectedAccountAlreadyLinkedError extends Error {},
  ConnectedAccountNotFoundError: class ConnectedAccountNotFoundError extends Error {},
  LastSignInMethodError: class LastSignInMethodError extends Error {},
  deleteConnectedAccountForUser: deleteConnectedAccountForUserMock,
  isConnectedAccountProvider: isConnectedAccountProviderMock,
  linkConnectedAccountForUser: linkConnectedAccountForUserMock,
}));

vi.mock("@lib/mobile-api-auth", () => ({
  resolveMobileApiUser: resolveMobileApiUserMock,
}));

vi.mock("@lib/mobile-auth", () => ({
  areDevRedirectsAllowed: vi.fn(() => false),
}));

vi.mock("@lib/mobile-auth.core", () => ({
  buildMobileCodeRedirectLocation: buildMobileCodeRedirectLocationMock,
  isValidPkceChallenge: isValidPkceChallengeMock,
  resolveMobileRedirectTarget: redirectTargetMock,
  verifyPkceVerifier: verifyPkceVerifierMock,
}));

vi.mock("@lib/mobile-provider-link", () => ({
  MOBILE_PROVIDER_LINK_AUTH_CALLBACK_TARGET:
    "/api/mobile/connected-accounts/link/complete?flow=mobile-provider-link",
  MOBILE_PROVIDER_LINK_RESULT_SCOPE: "mobile-provider-link-result",
  MOBILE_PROVIDER_LINK_START_SCOPE: "mobile-provider-link-start",
  MOBILE_PROVIDER_LINK_TTL_MS: 300_000,
  createMobileProviderLinkCookie: createMobileProviderLinkCookieMock,
  mintMobileProviderLinkStart: mintMobileProviderLinkStartMock,
  readMobileProviderLinkStateFromRequest:
    readMobileProviderLinkStateFromRequestMock,
  verifyMobileProviderLinkResult: verifyMobileProviderLinkResultMock,
  verifyMobileProviderLinkStart: verifyMobileProviderLinkStartMock,
}));

vi.mock("@lib/request-rate-limit", () => ({
  MOBILE_AUTH_RATE_LIMITS: {
    providerLinkConfirm: { limit: 10, scope: "confirm", windowMs: 60_000 },
    providerLinkAuthorize: {
      limit: 10,
      scope: "authorize",
      windowMs: 60_000,
    },
    providerLinkDelete: { limit: 10, scope: "delete", windowMs: 60_000 },
    providerLinkStart: { limit: 10, scope: "start", windowMs: 60_000 },
  },
  consumeOneShotKey: consumeOneShotKeyMock,
  rateLimitRequest: rateLimitRequestMock,
}));

const MOBILE_USER = {
  userId: "user-1",
  email: "person@example.com",
  issuedAt: new Date("2026-07-09T10:00:00.000Z"),
};
const RESULT = {
  userId: "user-1",
  provider: "google" as const,
  challenge: "a".repeat(64),
  redirect: "finhance://auth",
  jti: "result-jti",
  accountId: "provider-account-1",
  providerEmail: "person@example.com",
  providerEmailVerified: true,
  providerDisplayName: "Person",
};

describe("mobile connected-provider routes", () => {
  beforeEach(() => {
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(true);
    crossOriginRejectionMock.mockReset();
    crossOriginRejectionMock.mockReturnValue(null);
    rateLimitRequestMock.mockReset();
    rateLimitRequestMock.mockResolvedValue({
      allowed: true,
      headers: { "X-RateLimit-Remaining": "9" },
    });
    resolveMobileApiUserMock.mockReset();
    resolveMobileApiUserMock.mockResolvedValue({ ok: true, user: MOBILE_USER });
    isConnectedAccountProviderMock.mockReset();
    isConnectedAccountProviderMock.mockImplementation(
      (provider) => provider === "google" || provider === "github",
    );
    isValidPkceChallengeMock.mockReset();
    isValidPkceChallengeMock.mockReturnValue(true);
    redirectTargetMock.mockReset();
    redirectTargetMock.mockReturnValue("finhance://auth");
    readMobileProviderLinkStateFromRequestMock.mockReset();
    readMobileProviderLinkStateFromRequestMock.mockResolvedValue({
      userId: "user-1",
      provider: "google",
      challenge: "a".repeat(64),
      redirect: "finhance://auth",
      jti: "start-jti",
    });
    signInMock.mockReset();
    signInMock.mockResolvedValue(undefined);
    buildMobileCodeRedirectLocationMock.mockReset();
    buildMobileCodeRedirectLocationMock.mockReturnValue(
      "finhance://auth#code=encrypted-result",
    );
    mintMobileProviderLinkStartMock.mockReset();
    mintMobileProviderLinkStartMock.mockResolvedValue("encrypted-start");
    verifyMobileProviderLinkResultMock.mockReset();
    verifyMobileProviderLinkResultMock.mockResolvedValue(RESULT);
    verifyMobileProviderLinkStartMock.mockReset();
    verifyMobileProviderLinkStartMock.mockResolvedValue({
      userId: "user-1",
      provider: "google",
      challenge: "a".repeat(64),
      redirect: "finhance://auth",
      jti: "start-jti",
    });
    createMobileProviderLinkCookieMock.mockReset();
    createMobileProviderLinkCookieMock.mockReturnValue(
      "finhance.mobile-provider-link=opaque; HttpOnly",
    );
    verifyPkceVerifierMock.mockReset();
    verifyPkceVerifierMock.mockResolvedValue(true);
    consumeOneShotKeyMock.mockReset();
    consumeOneShotKeyMock.mockResolvedValue(true);
    linkConnectedAccountForUserMock.mockReset();
    linkConnectedAccountForUserMock.mockResolvedValue({
      id: "account-1",
      provider: "google",
      providerLabel: "Google",
      providerEmail: "person@example.com",
      providerEmailVerified: true,
      providerDisplayName: "Person",
      createdAt: "2026-07-09T10:00:00.000Z",
      isPrimaryEmail: true,
    });
    deleteConnectedAccountForUserMock.mockReset();
  });

  it("starts a browser handoff only after recent bearer authentication", async () => {
    const response = await START(
      createJsonRequest("/api/mobile/connected-accounts/link/start", {
        provider: "google",
        challenge: "a".repeat(64),
        redirect: "finhance://auth",
      }),
    );

    expect(response.status).toBe(200);
    expect(resolveMobileApiUserMock).toHaveBeenCalledWith(
      expect.any(Request),
      { requireRecentAuth: true },
    );
    expect(mintMobileProviderLinkStartMock).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "google",
      challenge: "a".repeat(64),
      redirect: "finhance://auth",
    });
    expect(await response.json()).toEqual({
      authorizationUrl:
        "https://finhance.test/api/mobile/connected-accounts/link/authorize?state=encrypted-start",
    });
  });

  it("consumes the browser start JTI before creating the OAuth handoff cookie", async () => {
    const response = await AUTHORIZE(
      new Request(
        "https://finhance.test/api/mobile/connected-accounts/link/authorize?state=encrypted-start",
      ),
    );

    expect(response.status).toBe(302);
    expect(consumeOneShotKeyMock).toHaveBeenCalledWith(
      "mobile-provider-link-start",
      "start-jti",
      300_000,
    );
    expect(createMobileProviderLinkCookieMock).toHaveBeenCalledWith(
      expect.any(Request),
      "encrypted-start",
    );
    expect(response.headers.get("location")).toBe(
      "https://finhance.test/api/mobile/connected-accounts/link/oauth",
    );
  });

  it("marks the Auth.js callback before starting the provider flow", async () => {
    const response = await OAUTH(
      new Request("https://finhance.test/api/mobile/connected-accounts/link/oauth"),
    );

    expect(response.status).toBe(500);
    expect(signInMock).toHaveBeenCalledWith("google", {
      redirectTo:
        "/api/mobile/connected-accounts/link/complete?flow=mobile-provider-link",
    });
  });

  it("hands the pending result back through the native callback fragment", async () => {
    const response = await COMPLETE(
      new Request(
        "https://finhance.test/api/mobile/connected-accounts/link/complete?code=encrypted-result",
      ),
    );

    expect(response.status).toBe(302);
    expect(buildMobileCodeRedirectLocationMock).toHaveBeenCalledWith(
      "finhance://auth",
      "encrypted-result",
    );
    expect(response.headers.get("location")).toBe(
      "finhance://auth#code=encrypted-result",
    );
  });

  it("does not write a provider account until a matching PKCE verifier is confirmed", async () => {
    verifyPkceVerifierMock.mockResolvedValue(false);

    const response = await CONFIRM(
      createJsonRequest("/api/mobile/connected-accounts/link/confirm", {
        code: "encrypted-result",
        verifier: "app-only-verifier",
      }),
    );

    expect(response.status).toBe(401);
    expect(consumeOneShotKeyMock).not.toHaveBeenCalled();
    expect(linkConnectedAccountForUserMock).not.toHaveBeenCalled();
  });

  it("consumes the result once then atomically links the provider for the bearer user", async () => {
    const response = await CONFIRM(
      createJsonRequest("/api/mobile/connected-accounts/link/confirm", {
        code: "encrypted-result",
        verifier: "app-only-verifier",
      }),
    );

    expect(response.status).toBe(200);
    expect(consumeOneShotKeyMock).toHaveBeenCalledWith(
      "mobile-provider-link-result",
      "result-jti",
      300_000,
    );
    expect(linkConnectedAccountForUserMock).toHaveBeenCalledWith({
      userId: "user-1",
      provider: "google",
      providerAccountId: "provider-account-1",
      metadata: {
        providerEmail: "person@example.com",
        providerEmailVerified: true,
        providerDisplayName: "Person",
      },
    });
  });

  it("requires recent mobile authentication before unlinking a provider", async () => {
    resolveMobileApiUserMock.mockResolvedValue({
      ok: false,
      response: Response.json({ code: "RECENT_AUTH_REQUIRED" }, { status: 403 }),
    });

    const response = await UNLINK(
      createJsonRequest("/api/mobile/connected-accounts", {
        accountId: "account-1",
      }),
    );

    expect(response.status).toBe(403);
    expect(deleteConnectedAccountForUserMock).not.toHaveBeenCalled();
  });
});

function createJsonRequest(path: string, body: unknown): Request {
  return new Request(`https://finhance.test${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer mobile-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
