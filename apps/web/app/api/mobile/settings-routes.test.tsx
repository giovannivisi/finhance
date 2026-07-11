import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELETE as DELETE_ACCOUNT,
  GET as GET_ACCOUNT,
} from "@/api/mobile/account/route";
import { POST as POST_REGISTER_OPTIONS } from "@/api/mobile/passkey/register/options/route";
import { POST as POST_REGISTER_VERIFY } from "@/api/mobile/passkey/register/verify/route";
import {
  DELETE as DELETE_PASSKEY,
  GET as GET_PASSKEYS,
} from "@/api/mobile/passkeys/route";

const {
  createMobilePasskeyRegistrationMock,
  crossOriginRejectionMock,
  deletePasskeyForUserMock,
  fetchMock,
  getDirectApiUrlMock,
  getUserIdentityForUserMock,
  hostedModeMock,
  listPasskeysForUserMock,
  mintApiAccessTokenMock,
  rateLimitRequestMock,
  resolveMobileApiUserMock,
  toUpstreamResponseMock,
  verifyMobilePasskeyRegistrationMock,
} = vi.hoisted(() => ({
  createMobilePasskeyRegistrationMock: vi.fn(),
  crossOriginRejectionMock: vi.fn(),
  deletePasskeyForUserMock: vi.fn(),
  fetchMock: vi.fn(),
  getDirectApiUrlMock: vi.fn(),
  getUserIdentityForUserMock: vi.fn(),
  hostedModeMock: vi.fn(),
  listPasskeysForUserMock: vi.fn(),
  mintApiAccessTokenMock: vi.fn(),
  rateLimitRequestMock: vi.fn(),
  resolveMobileApiUserMock: vi.fn(),
  toUpstreamResponseMock: vi.fn(),
  verifyMobilePasskeyRegistrationMock: vi.fn(),
}));

vi.mock("@lib/api-auth", () => ({
  getDirectApiUrl: getDirectApiUrlMock,
  mintApiAccessToken: mintApiAccessTokenMock,
}));

vi.mock("@lib/api-proxy", () => ({
  resolveCrossOriginRejection: crossOriginRejectionMock,
  toUpstreamResponse: toUpstreamResponseMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/connected-accounts", () => ({
  getUserIdentityForUser: getUserIdentityForUserMock,
}));

vi.mock("@lib/mobile-api-auth", () => ({
  resolveMobileApiUser: resolveMobileApiUserMock,
}));

vi.mock("@lib/passkey-mobile", () => ({
  createMobilePasskeyRegistration: createMobilePasskeyRegistrationMock,
  verifyMobilePasskeyRegistration: verifyMobilePasskeyRegistrationMock,
}));

vi.mock("@lib/passkeys", () => ({
  deletePasskeyForUser: deletePasskeyForUserMock,
  listPasskeysForUser: listPasskeysForUserMock,
}));

vi.mock("@lib/request-rate-limit", () => ({
  MOBILE_AUTH_RATE_LIMITS: {
    accountDelete: {
      limit: 10,
      scope: "mobile-account-delete",
      windowMs: 60_000,
    },
    passkeyDelete: {
      limit: 10,
      scope: "mobile-passkey-delete",
      windowMs: 60_000,
    },
    passkeyRegisterOptions: {
      limit: 10,
      scope: "mobile-passkey-register-options",
      windowMs: 60_000,
    },
    passkeyRegisterVerify: {
      limit: 10,
      scope: "mobile-passkey-register-verify",
      windowMs: 60_000,
    },
  },
  rateLimitRequest: rateLimitRequestMock,
}));

const MOBILE_USER = {
  userId: "user-1",
  email: "user@example.com",
  issuedAt: new Date("2026-07-09T10:00:00.000Z"),
};

describe("mobile settings routes", () => {
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
    resolveMobileApiUserMock.mockResolvedValue({
      ok: true,
      user: MOBILE_USER,
    });
    listPasskeysForUserMock.mockReset();
    listPasskeysForUserMock.mockResolvedValue([]);
    deletePasskeyForUserMock.mockReset();
    createMobilePasskeyRegistrationMock.mockReset();
    createMobilePasskeyRegistrationMock.mockResolvedValue({
      options: { challenge: "registration-challenge" },
      challenge: "signed-registration-challenge",
    });
    verifyMobilePasskeyRegistrationMock.mockReset();
    verifyMobilePasskeyRegistrationMock.mockResolvedValue({
      credentialId: "credential-1",
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      transports: "internal",
      createdAt: "2026-07-09T10:00:00.000Z",
      lastUsedAt: null,
    });
    getDirectApiUrlMock.mockReset();
    getDirectApiUrlMock.mockReturnValue("https://api.test/users/me");
    getUserIdentityForUserMock.mockReset();
    getUserIdentityForUserMock.mockResolvedValue({
      email: "user@example.com",
      name: "User",
      image: null,
      connectedAccounts: [],
    });
    mintApiAccessTokenMock.mockReset();
    mintApiAccessTokenMock.mockResolvedValue("api-token");
    toUpstreamResponseMock.mockReset();
    toUpstreamResponseMock.mockImplementation((response) =>
      Promise.resolve(response),
    );
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("hides mobile account details outside hosted mode", async () => {
    hostedModeMock.mockReturnValue(false);

    const response = await GET_ACCOUNT(createRequest("/api/mobile/account"));

    expect(response.status).toBe(404);
    expect(resolveMobileApiUserMock).not.toHaveBeenCalled();
  });

  it("returns the resolved mobile account identity", async () => {
    getUserIdentityForUserMock.mockResolvedValue({
      email: "user@example.com",
      name: "User",
      image: "https://example.test/avatar.png",
      connectedAccounts: [
        {
          id: "account-1",
          provider: "google",
          providerLabel: "Google",
          providerEmail: "user@example.com",
          providerEmailVerified: true,
          providerDisplayName: "User",
          createdAt: "2026-07-09T10:00:00.000Z",
          isPrimaryEmail: true,
        },
      ],
    });

    const response = await GET_ACCOUNT(createRequest("/api/mobile/account"));

    expect(response.status).toBe(200);
    expect(getUserIdentityForUserMock).toHaveBeenCalledWith("user-1");
    expect(await response.json()).toEqual({
      email: "user@example.com",
      name: "User",
      image: "https://example.test/avatar.png",
      connectedAccounts: [
        {
          id: "account-1",
          provider: "google",
          providerLabel: "Google",
          providerEmail: "user@example.com",
          providerEmailVerified: true,
          providerDisplayName: "User",
          createdAt: "2026-07-09T10:00:00.000Z",
          isPrimaryEmail: true,
        },
      ],
    });
  });

  it("lists passkeys for the resolved mobile user", async () => {
    listPasskeysForUserMock.mockResolvedValue([
      {
        credentialId: "credential-1",
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        transports: "internal",
        createdAt: "2026-07-09T10:00:00.000Z",
        lastUsedAt: null,
      },
    ]);

    const response = await GET_PASSKEYS(createRequest("/api/mobile/passkeys"));

    expect(response.status).toBe(200);
    expect(listPasskeysForUserMock).toHaveBeenCalledWith("user-1");
    expect(await response.json()).toEqual([
      {
        credentialId: "credential-1",
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        transports: "internal",
        createdAt: "2026-07-09T10:00:00.000Z",
        lastUsedAt: null,
      },
    ]);
  });

  it("rate limits mobile passkey deletion before resolving recent auth", async () => {
    rateLimitRequestMock.mockResolvedValue({
      allowed: false,
      headers: { "Retry-After": "60" },
    });

    const response = await DELETE_PASSKEY(
      createJsonRequest("/api/mobile/passkeys", {
        credentialId: "credential-1",
      }),
    );

    expect(response.status).toBe(429);
    expect(resolveMobileApiUserMock).not.toHaveBeenCalled();
    expect(deletePasskeyForUserMock).not.toHaveBeenCalled();
  });

  it("deletes a passkey only after recent mobile auth", async () => {
    const request = createJsonRequest("/api/mobile/passkeys", {
      credentialId: " credential-1 ",
    });

    const response = await DELETE_PASSKEY(request);

    expect(response.status).toBe(204);
    expect(resolveMobileApiUserMock).toHaveBeenCalledWith(request, {
      requireRecentAuth: true,
    });
    expect(deletePasskeyForUserMock).toHaveBeenCalledWith(
      "user-1",
      "credential-1",
    );
  });

  it("creates passkey registration options after recent mobile auth", async () => {
    const request = createRequest("/api/mobile/passkey/register/options");

    const response = await POST_REGISTER_OPTIONS(request);

    expect(response.status).toBe(200);
    expect(resolveMobileApiUserMock).toHaveBeenCalledWith(request, {
      requireRecentAuth: true,
    });
    expect(createMobilePasskeyRegistrationMock).toHaveBeenCalledWith("user-1");
    expect(await response.json()).toEqual({
      options: { challenge: "registration-challenge" },
      challenge: "signed-registration-challenge",
    });
  });

  it("rejects malformed passkey registration verification bodies", async () => {
    const response = await POST_REGISTER_VERIFY(
      createJsonRequest("/api/mobile/passkey/register/verify", {
        challenge: "signed-registration-challenge",
      }),
    );

    expect(response.status).toBe(400);
    expect(verifyMobilePasskeyRegistrationMock).not.toHaveBeenCalled();
  });

  it("verifies passkey registration for the resolved mobile user", async () => {
    const body = {
      response: { id: "credential-1", response: {} },
      challenge: " signed-registration-challenge ",
    };

    const response = await POST_REGISTER_VERIFY(
      createJsonRequest("/api/mobile/passkey/register/verify", body),
    );

    expect(response.status).toBe(200);
    expect(verifyMobilePasskeyRegistrationMock).toHaveBeenCalledWith({
      userId: "user-1",
      response: body.response,
      challenge: "signed-registration-challenge",
    });
    expect(await response.json()).toEqual({
      credentialId: "credential-1",
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      transports: "internal",
      createdAt: "2026-07-09T10:00:00.000Z",
      lastUsedAt: null,
    });
  });

  it("requires a confirmation email before deleting the mobile account", async () => {
    const response = await DELETE_ACCOUNT(
      createJsonRequest("/api/mobile/account", {}),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies account deletion to the direct API with a minted API token", async () => {
    const request = createJsonRequest("/api/mobile/account", {
      email: "user@example.com",
    });

    const response = await DELETE_ACCOUNT(request);

    expect(response.status).toBe(204);
    expect(resolveMobileApiUserMock).toHaveBeenCalledWith(request, {
      requireRecentAuth: true,
    });
    expect(mintApiAccessTokenMock).toHaveBeenCalledWith({
      userId: "user-1",
      email: "user@example.com",
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/users/me", {
      method: "DELETE",
      headers: {
        authorization: "Bearer api-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com" }),
      cache: "no-store",
    });
  });
});

function createRequest(path: string): Request {
  return new Request(`https://finhance.test${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer mobile-token",
      "x-forwarded-for": "203.0.113.10",
    },
  });
}

function createJsonRequest(path: string, body: unknown): Request {
  return new Request(`https://finhance.test${path}`, {
    method:
      path.endsWith("/account") || path.endsWith("/passkeys")
        ? "DELETE"
        : "POST",
    headers: {
      authorization: "Bearer mobile-token",
      "content-type": "application/json",
      origin: "https://finhance.test",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}
