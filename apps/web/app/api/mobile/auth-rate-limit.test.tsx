import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as POST_PASSKEY_OPTIONS } from "@/api/mobile/passkey/options/route";
import { POST as POST_PASSKEY_VERIFY } from "@/api/mobile/passkey/verify/route";
import { POST as POST_TOKEN } from "@/api/mobile/token/route";
import {
  MOBILE_AUTH_RATE_LIMITS,
  resetRequestRateLimitsForTests,
} from "@lib/request-rate-limit";

const {
  createMobilePasskeyAuthenticationMock,
  exchangeMobileSignInCodeMock,
  hostedModeMock,
  prismaMock,
  requestRateLimitStore,
  verifyMobilePasskeyAuthenticationMock,
} = vi.hoisted(() => ({
  createMobilePasskeyAuthenticationMock: vi.fn(),
  exchangeMobileSignInCodeMock: vi.fn(),
  hostedModeMock: vi.fn(),
  requestRateLimitStore: new Map<
    string,
    {
      key: string;
      scope: string;
      clientKey: string;
      count: number;
      resetAt: Date;
    }
  >(),
  prismaMock: {
    $transaction: vi.fn((callback) => callback(prismaMock)),
    requestRateLimit: {
      deleteMany: vi.fn(({ where } = {}) => {
        const resetBefore = where?.resetAt?.lte;

        if (!resetBefore) {
          const count = requestRateLimitStore.size;
          requestRateLimitStore.clear();
          return Promise.resolve({ count });
        }

        let count = 0;
        for (const [key, record] of requestRateLimitStore) {
          if (record.resetAt <= resetBefore) {
            requestRateLimitStore.delete(key);
            count += 1;
          }
        }

        return Promise.resolve({ count });
      }),
      findUnique: vi.fn(({ where }) =>
        Promise.resolve(requestRateLimitStore.get(where.key) ?? null),
      ),
      update: vi.fn(({ where, data }) => {
        const current = requestRateLimitStore.get(where.key);

        if (!current) {
          throw new Error(`Missing rate-limit record ${where.key}`);
        }

        const next = {
          ...current,
          count: current.count + (data.count?.increment ?? 0),
        };
        requestRateLimitStore.set(where.key, next);

        return Promise.resolve(next);
      }),
      upsert: vi.fn(({ where, create, update }) => {
        const existing = requestRateLimitStore.get(where.key);
        const next = existing
          ? {
              ...existing,
              scope: update.scope,
              clientKey: update.clientKey,
              count: update.count,
              resetAt: update.resetAt,
            }
          : { ...create };

        requestRateLimitStore.set(where.key, next);

        return Promise.resolve(next);
      }),
    },
  },
  verifyMobilePasskeyAuthenticationMock: vi.fn(),
}));

vi.mock("@lib/auth-mode", () => ({
  isHostedAuthMode: hostedModeMock,
}));

vi.mock("@lib/passkey-mobile", () => ({
  createMobilePasskeyAuthentication: createMobilePasskeyAuthenticationMock,
  verifyMobilePasskeyAuthentication: verifyMobilePasskeyAuthenticationMock,
}));

vi.mock("@lib/mobile-auth", () => ({
  exchangeMobileSignInCode: exchangeMobileSignInCodeMock,
}));

vi.mock("@lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("mobile auth rate limits", () => {
  beforeEach(async () => {
    requestRateLimitStore.clear();
    prismaMock.$transaction.mockClear();
    prismaMock.requestRateLimit.deleteMany.mockClear();
    prismaMock.requestRateLimit.findUnique.mockClear();
    prismaMock.requestRateLimit.update.mockClear();
    prismaMock.requestRateLimit.upsert.mockClear();
    await resetRequestRateLimitsForTests();
    hostedModeMock.mockReset();
    hostedModeMock.mockReturnValue(true);
    createMobilePasskeyAuthenticationMock.mockReset();
    createMobilePasskeyAuthenticationMock.mockResolvedValue({
      options: { challenge: "challenge" },
      challenge: "signed-challenge",
    });
    verifyMobilePasskeyAuthenticationMock.mockReset();
    verifyMobilePasskeyAuthenticationMock.mockResolvedValue(null);
    exchangeMobileSignInCodeMock.mockReset();
    exchangeMobileSignInCodeMock.mockResolvedValue(null);
  });

  it("rate limits mobile passkey option requests by client address", async () => {
    for (
      let index = 0;
      index < MOBILE_AUTH_RATE_LIMITS.passkeyOptions.limit;
      index += 1
    ) {
      const response = await POST_PASSKEY_OPTIONS(
        createRequest("/api/mobile/passkey/options"),
      );

      expect(response.status).toBe(200);
    }

    const response = await POST_PASSKEY_OPTIONS(
      createRequest("/api/mobile/passkey/options"),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(await response.json()).toEqual({
      message: "Too many mobile sign-in attempts. Try again soon.",
    });
    expect(createMobilePasskeyAuthenticationMock).toHaveBeenCalledTimes(
      MOBILE_AUTH_RATE_LIMITS.passkeyOptions.limit,
    );
  });

  it("rate limits mobile passkey verification before WebAuthn verification", async () => {
    for (
      let index = 0;
      index < MOBILE_AUTH_RATE_LIMITS.passkeyVerify.limit;
      index += 1
    ) {
      const response = await POST_PASSKEY_VERIFY(
        createJsonRequest("/api/mobile/passkey/verify", {
          response: { id: "credential-1" },
          challenge: "signed-challenge",
        }),
      );

      expect(response.status).toBe(401);
    }

    const response = await POST_PASSKEY_VERIFY(
      createJsonRequest("/api/mobile/passkey/verify", {
        response: { id: "credential-1" },
        challenge: "signed-challenge",
      }),
    );

    expect(response.status).toBe(429);
    expect(verifyMobilePasskeyAuthenticationMock).toHaveBeenCalledTimes(
      MOBILE_AUTH_RATE_LIMITS.passkeyVerify.limit,
    );
  });

  it("rate limits mobile token exchanges before code verification", async () => {
    for (
      let index = 0;
      index < MOBILE_AUTH_RATE_LIMITS.tokenExchange.limit;
      index += 1
    ) {
      const response = await POST_TOKEN(
        createJsonRequest("/api/mobile/token", {
          code: "code",
          verifier: "verifier",
        }),
      );

      expect(response.status).toBe(401);
    }

    const response = await POST_TOKEN(
      createJsonRequest("/api/mobile/token", {
        code: "code",
        verifier: "verifier",
      }),
    );

    expect(response.status).toBe(429);
    expect(exchangeMobileSignInCodeMock).toHaveBeenCalledTimes(
      MOBILE_AUTH_RATE_LIMITS.tokenExchange.limit,
    );
  });
});

function createRequest(path: string): Request {
  return new Request(`https://finhance.test${path}`, {
    method: "POST",
    headers: {
      "x-forwarded-for": "203.0.113.10",
    },
  });
}

function createJsonRequest(path: string, body: unknown): Request {
  return new Request(`https://finhance.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}
