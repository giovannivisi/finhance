// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeOneShotKeyMock, cookieGetMock, resolveAuthSecretMock } =
  vi.hoisted(() => ({
    consumeOneShotKeyMock: vi.fn(),
    cookieGetMock: vi.fn(),
    resolveAuthSecretMock: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGetMock }),
}));
vi.mock("./auth-config", () => ({
  resolveAuthSecret: resolveAuthSecretMock,
}));
vi.mock("./request-rate-limit", () => ({
  consumeOneShotKey: consumeOneShotKeyMock,
}));

import {
  consumeWebProviderLinkIntent,
  mintWebProviderLinkIntent,
  readWebProviderLinkIntentFromCookies,
  WEB_PROVIDER_LINK_COOKIE,
} from "./web-provider-link";

function readCookieValue(serializedCookie: string): string {
  const rawValue = serializedCookie.split(";", 1)[0]?.split("=", 2)[1];
  if (!rawValue) {
    throw new Error("Expected a provider-link cookie value.");
  }
  return decodeURIComponent(rawValue);
}

describe("web provider-link intent", () => {
  beforeEach(() => {
    consumeOneShotKeyMock.mockReset();
    consumeOneShotKeyMock.mockResolvedValue(true);
    cookieGetMock.mockReset();
    resolveAuthSecretMock.mockReset();
    resolveAuthSecretMock.mockReturnValue(
      "test-auth-secret-with-enough-entropy",
    );
  });

  it("round-trips a short-lived intent bound to its user and provider", async () => {
    const serializedCookie = await mintWebProviderLinkIntent({
      request: new Request("https://finhance.test/api/connected-accounts"),
      userId: "user-1",
      provider: "github",
    });
    const token = readCookieValue(serializedCookie);
    cookieGetMock.mockImplementation((name) =>
      name === WEB_PROVIDER_LINK_COOKIE ? { value: token } : undefined,
    );

    const intent = await readWebProviderLinkIntentFromCookies();

    expect(intent).toMatchObject({ userId: "user-1", provider: "github" });
    expect(intent?.jti).toEqual(expect.any(String));
    expect(serializedCookie).toContain("HttpOnly");
    expect(serializedCookie).toContain("SameSite=Lax");
    expect(serializedCookie).toContain("Secure");
    expect(serializedCookie).toContain("Path=/api/auth");
  });

  it("rejects a token after the signing secret changes", async () => {
    const serializedCookie = await mintWebProviderLinkIntent({
      request: new Request("https://finhance.test/api/connected-accounts"),
      userId: "user-1",
      provider: "google",
    });
    cookieGetMock.mockReturnValue({ value: readCookieValue(serializedCookie) });
    resolveAuthSecretMock.mockReturnValue("a-different-test-auth-secret-value");

    await expect(readWebProviderLinkIntentFromCookies()).resolves.toBeNull();
  });

  it("consumes each verified jti through the one-shot store", async () => {
    const intent = {
      userId: "user-1",
      provider: "google",
      jti: "intent-1",
    } as const;

    await expect(consumeWebProviderLinkIntent(intent)).resolves.toBe(true);
    expect(consumeOneShotKeyMock).toHaveBeenCalledWith(
      "web-provider-link-intent",
      "intent-1",
      300_000,
    );
  });
});
