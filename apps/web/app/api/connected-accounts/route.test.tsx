import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/api/connected-accounts/route";

const {
  authMock,
  crossOriginRejectionMock,
  deleteConnectedAccountForUserMock,
  hostedModeMock,
  isConnectedAccountProviderMock,
  listConnectedAccountsForUserMock,
  mintWebProviderLinkIntentMock,
  recentAuthMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  crossOriginRejectionMock: vi.fn(),
  deleteConnectedAccountForUserMock: vi.fn(),
  hostedModeMock: vi.fn(),
  isConnectedAccountProviderMock: vi.fn(),
  listConnectedAccountsForUserMock: vi.fn(),
  mintWebProviderLinkIntentMock: vi.fn(),
  recentAuthMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@lib/api-proxy", () => ({
  resolveCrossOriginRejection: crossOriginRejectionMock,
}));

vi.mock("@lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/connected-accounts", () => ({
  ConnectedAccountNotFoundError: class ConnectedAccountNotFoundError extends Error {},
  LastSignInMethodError: class LastSignInMethodError extends Error {},
  deleteConnectedAccountForUser: deleteConnectedAccountForUserMock,
  isConnectedAccountProvider: isConnectedAccountProviderMock,
  listConnectedAccountsForUser: listConnectedAccountsForUserMock,
}));

vi.mock("@lib/web-provider-link", () => ({
  mintWebProviderLinkIntent: mintWebProviderLinkIntentMock,
}));

vi.mock("@lib/recent-auth", () => ({
  RECENT_AUTH_REQUIRED_MESSAGE:
    "Sign in again before changing sign-in methods.",
  hasRecentSessionAuthentication: recentAuthMock,
}));

describe("/api/connected-accounts", () => {
  beforeEach(() => {
    authMock.mockReset();
    authMock.mockResolvedValue(null);
    crossOriginRejectionMock.mockReset();
    crossOriginRejectionMock.mockReturnValue(null);
    deleteConnectedAccountForUserMock.mockReset();
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(true);
    isConnectedAccountProviderMock.mockReset();
    isConnectedAccountProviderMock.mockImplementation(
      (provider) => provider === "google" || provider === "github",
    );
    listConnectedAccountsForUserMock.mockReset();
    listConnectedAccountsForUserMock.mockResolvedValue([]);
    mintWebProviderLinkIntentMock.mockReset();
    mintWebProviderLinkIntentMock.mockResolvedValue(
      "finhance.provider-link=secure-intent; Path=/api/auth; HttpOnly",
    );
    recentAuthMock.mockReset();
    recentAuthMock.mockResolvedValue(true);
  });

  it("returns an empty list outside hosted mode", async () => {
    hostedModeMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("lists connected accounts for the current session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    listConnectedAccountsForUserMock.mockResolvedValue([
      {
        id: "account-1",
        provider: "google",
        providerLabel: "Google",
        providerEmail: "person@example.com",
        providerEmailVerified: true,
        providerDisplayName: "Person",
        createdAt: "2026-07-09T10:00:00.000Z",
        isPrimaryEmail: true,
      },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listConnectedAccountsForUserMock).toHaveBeenCalledWith("user-1");
    expect(await response.json()).toEqual([
      {
        id: "account-1",
        provider: "google",
        providerLabel: "Google",
        providerEmail: "person@example.com",
        providerEmailVerified: true,
        providerDisplayName: "Person",
        createdAt: "2026-07-09T10:00:00.000Z",
        isPrimaryEmail: true,
      },
    ]);
  });

  it("issues a provider-link intent only after recent authentication", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const response = await POST(
      new Request("https://finhance.test/api/connected-accounts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://finhance.test",
        },
        body: JSON.stringify({ provider: "github" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(recentAuthMock).toHaveBeenCalledWith("user-1");
    expect(mintWebProviderLinkIntentMock).toHaveBeenCalledWith({
      request: expect.any(Request),
      userId: "user-1",
      provider: "github",
    });
    expect(response.headers.get("set-cookie")).toContain("secure-intent");
  });

  it("rejects provider-link intent creation from a stale session", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    recentAuthMock.mockResolvedValue(false);

    const response = await POST(
      new Request("https://finhance.test/api/connected-accounts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://finhance.test",
        },
        body: JSON.stringify({ provider: "google" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(mintWebProviderLinkIntentMock).not.toHaveBeenCalled();
  });

  it("deletes connected accounts only after recent authentication", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const request = new Request(
      "https://finhance.test/api/connected-accounts",
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "https://finhance.test",
        },
        body: JSON.stringify({ accountId: " account-1 " }),
      },
    );

    const response = await DELETE(request);

    expect(response.status).toBe(204);
    expect(recentAuthMock).toHaveBeenCalledWith("user-1");
    expect(deleteConnectedAccountForUserMock).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "account-1",
    });
  });

  it("rejects connected account deletion without recent authentication", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    recentAuthMock.mockResolvedValue(false);

    const response = await DELETE(
      new Request("https://finhance.test/api/connected-accounts", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "https://finhance.test",
        },
        body: JSON.stringify({ accountId: "account-1" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Sign in again before changing sign-in methods.",
    });
    expect(deleteConnectedAccountForUserMock).not.toHaveBeenCalled();
  });

  it("rejects malformed deletion bodies", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const response = await DELETE(
      new Request("https://finhance.test/api/connected-accounts", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          origin: "https://finhance.test",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(deleteConnectedAccountForUserMock).not.toHaveBeenCalled();
  });
});
