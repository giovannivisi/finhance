import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RECENT_AUTH_REQUIRED_CODE } from "@finhance/shared/users";

import { ApiError } from "./client";
import {
  deleteConnectedAccount,
  formatPasskeyTitle,
  isRecentAuthError,
  linkConnectedAccount,
} from "./passkeys";

const expoMocks = vi.hoisted(() => ({
  createURL: vi.fn(),
  digestStringAsync: vi.fn(),
  getRandomBytes: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));

vi.mock("react-native-passkeys", () => ({
  create: vi.fn(),
}));

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: expoMocks.digestStringAsync,
  getRandomBytes: expoMocks.getRandomBytes,
}));

vi.mock("expo-linking", () => ({
  createURL: expoMocks.createURL,
}));

vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: expoMocks.openAuthSessionAsync,
}));

beforeEach(() => {
  expoMocks.createURL.mockReturnValue("finhance://auth");
  expoMocks.digestStringAsync.mockResolvedValue("a".repeat(64));
  expoMocks.getRandomBytes.mockReturnValue(
    new Uint8Array(Array.from({ length: 32 }, (_, index) => index)),
  );
  expoMocks.openAuthSessionAsync.mockResolvedValue({
    type: "success",
    url: "finhance://auth#code=provider-link-code",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("mobile passkey helpers", () => {
  it("formats passkey titles", () => {
    expect(
      formatPasskeyTitle({
        credentialId: "credential",
        createdAt: "2026-07-08T10:00:00.000Z",
        lastUsedAt: null,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
        transports: null,
      }),
    ).toBe("Multi device passkey (backed up)");
  });

  it("detects recent-auth errors", () => {
    expect(
      isRecentAuthError(
        new ApiError("Confirm it is you.", {
          status: 403,
          code: RECENT_AUTH_REQUIRED_CODE,
        }),
      ),
    ).toBe(true);
    expect(isRecentAuthError(new Error("nope"))).toBe(false);
  });

  it("links a provider with a PKCE-bound browser callback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ authorizationUrl: "https://oauth.example/link" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            connectedAccount: {
              id: "account-1",
              provider: "google",
              providerLabel: "Google",
              providerEmail: "person@example.com",
              providerEmailVerified: true,
              providerDisplayName: "Person",
              createdAt: "2026-07-09T20:00:00.000Z",
              isPrimaryEmail: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await linkConnectedAccount(
      "https://finhance.example",
      "mobile-token",
      "google",
    );

    expect(result.connectedAccount.id).toBe("account-1");

    expect(expoMocks.openAuthSessionAsync).toHaveBeenCalledWith(
      "https://oauth.example/link",
      "finhance://auth",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [startUrl, startRequest] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(startUrl).toBe(
      "https://finhance.example/api/mobile/connected-accounts/link/start",
    );
    expect(startRequest.headers).toMatchObject({
      Authorization: "Bearer mobile-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(startRequest.body as string)).toEqual({
      provider: "google",
      challenge: "a".repeat(64),
      redirect: "finhance://auth",
    });

    const [confirmUrl, confirmRequest] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(confirmUrl).toBe(
      "https://finhance.example/api/mobile/connected-accounts/link/confirm",
    );
    expect(JSON.parse(confirmRequest.body as string)).toEqual({
      code: "provider-link-code",
      verifier:
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    });
  });

  it("does not confirm a cancelled provider sign-in", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ authorizationUrl: "https://oauth.example/link" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    expoMocks.openAuthSessionAsync.mockResolvedValue({ type: "cancel" });

    await expect(
      linkConnectedAccount(
        "https://finhance.example",
        "mobile-token",
        "github",
      ),
    ).rejects.toThrow("Provider sign-in was cancelled before it completed.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removes a connected provider with the hosted mobile token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteConnectedAccount(
      "https://finhance.example",
      "mobile-token",
      "account-1",
    );

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://finhance.example/api/mobile/connected-accounts");
    expect(request.method).toBe("DELETE");
    expect(request.headers).toMatchObject({
      Authorization: "Bearer mobile-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(request.body as string)).toEqual({
      accountId: "account-1",
    });
  });
});
