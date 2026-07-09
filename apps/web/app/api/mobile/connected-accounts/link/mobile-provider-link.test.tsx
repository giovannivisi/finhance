// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const { cookiesMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import {
  clearMobileProviderLinkCookie,
  createMobileProviderLinkCookie,
  mintMobileProviderLinkResult,
  mintMobileProviderLinkStart,
  verifyMobileProviderLinkResult,
  verifyMobileProviderLinkStart,
} from "@lib/mobile-provider-link";

const ENV: NodeJS.ProcessEnv = {
  AUTH_SECRET: "test-mobile-provider-link-secret",
  NODE_ENV: "test",
};
const START = {
  userId: "user-1",
  provider: "google" as const,
  challenge:
    "1e5f3192d4f5b2a14738e1a2e4712ef5af5250477d1cfc1f581d60317348d7f5",
  redirect: "finhance://auth",
};

describe("mobile provider-link secure handoff", () => {
  it("encrypts and authenticates the short-lived browser start state", async () => {
    const state = await mintMobileProviderLinkStart({ ...START, env: ENV });

    expect(state).not.toContain(START.userId);
    expect(state).not.toContain(START.challenge);
    await expect(verifyMobileProviderLinkStart(state, ENV)).resolves.toMatchObject(
      START,
    );
    await expect(
      verifyMobileProviderLinkStart(`${state}tampered`, ENV),
    ).resolves.toBeNull();
    await expect(
      verifyMobileProviderLinkStart(state, {
        AUTH_SECRET: "different-secret",
        NODE_ENV: "test",
      }),
    ).resolves.toBeNull();
  });

  it("binds a confidential OAuth result to the same user and PKCE challenge", async () => {
    const start = await verifyMobileProviderLinkStart(
      await mintMobileProviderLinkStart({ ...START, env: ENV }),
      ENV,
    );

    expect(start).not.toBeNull();
    if (!start) {
      return;
    }

    const result = await mintMobileProviderLinkResult({
      start,
      accountId: "provider-account-1",
      metadata: {
        providerEmail: "person@example.com",
        providerEmailVerified: true,
        providerDisplayName: "Person",
      },
      env: ENV,
    });

    expect(result).not.toContain("person@example.com");
    await expect(verifyMobileProviderLinkResult(result, ENV)).resolves.toMatchObject({
      ...START,
      accountId: "provider-account-1",
      providerEmail: "person@example.com",
      providerEmailVerified: true,
    });
  });

  it("uses a narrow HttpOnly cookie for the browser-only handoff", () => {
    const request = new Request(
      "https://finhance.test/api/mobile/connected-accounts/link/authorize",
      { headers: { "x-forwarded-proto": "https" } },
    );

    expect(createMobileProviderLinkCookie(request, "opaque-state")).toContain(
      "HttpOnly",
    );
    expect(createMobileProviderLinkCookie(request, "opaque-state")).toContain(
      "SameSite=Lax",
    );
    expect(createMobileProviderLinkCookie(request, "opaque-state")).toContain(
      "Path=/api",
    );
    expect(createMobileProviderLinkCookie(request, "opaque-state")).toContain(
      "Secure",
    );
    expect(clearMobileProviderLinkCookie(request)).toContain("Max-Age=0");
  });
});
