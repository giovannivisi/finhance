// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exchangeMobileSignInCode,
  refreshMobileSession,
} from "@lib/mobile-auth";
import {
  mintMobileAuthCode,
  verifyMobileSessionToken,
} from "@lib/mobile-auth.core";

const AUTH_SECRET = "test-secret-for-mobile-sessions";
const PKCE_CHALLENGE =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const {
  consumeOneShotKeyMock,
  mobileSessionCreateMock,
  mobileSessionFindUniqueMock,
  mobileSessionUpdateManyMock,
  prismaMock,
  userFindUniqueMock,
} = vi.hoisted(() => {
  const userFindUniqueMock = vi.fn();
  const mobileSessionCreateMock = vi.fn();
  const mobileSessionFindUniqueMock = vi.fn();
  const mobileSessionUpdateManyMock = vi.fn();

  return {
    consumeOneShotKeyMock: vi.fn(),
    userFindUniqueMock,
    mobileSessionCreateMock,
    mobileSessionFindUniqueMock,
    mobileSessionUpdateManyMock,
    prismaMock: {
      user: { findUnique: userFindUniqueMock },
      mobileSession: {
        create: mobileSessionCreateMock,
        delete: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: mobileSessionFindUniqueMock,
        updateMany: mobileSessionUpdateManyMock,
        update: vi.fn(),
        findMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("./prisma", () => ({ prisma: prismaMock }));
vi.mock("./request-rate-limit", () => ({
  consumeOneShotKey: consumeOneShotKeyMock,
}));

describe("mobile session security", () => {
  beforeEach(() => {
    consumeOneShotKeyMock.mockReset();
    userFindUniqueMock.mockReset();
    mobileSessionCreateMock.mockReset();
    mobileSessionFindUniqueMock.mockReset();
    mobileSessionUpdateManyMock.mockReset();

    userFindUniqueMock.mockResolvedValue({
      id: "user-123",
      email: "user@example.com",
      isActive: true,
    });
    mobileSessionCreateMock.mockResolvedValue({ id: "session-123" });
  });

  it("consumes a verified PKCE-bound sign-in code before it can mint another session", async () => {
    const consumed = new Set<string>();
    consumeOneShotKeyMock.mockImplementation(
      async (_scope: string, jti: string) => {
        if (consumed.has(jti)) {
          return false;
        }
        consumed.add(jti);
        return true;
      },
    );
    const code = await mintMobileAuthCode({
      userId: "user-123",
      email: "user@example.com",
      challenge: PKCE_CHALLENGE,
      authSecret: AUTH_SECRET,
    });
    const env = { AUTH_SECRET, NODE_ENV: "test" } as NodeJS.ProcessEnv;

    const first = await exchangeMobileSignInCode({
      code,
      verifier: "abc",
      env,
    });
    const replay = await exchangeMobileSignInCode({
      code,
      verifier: "abc",
      env,
    });

    expect(first).toEqual(
      expect.objectContaining({
        token: expect.any(String),
        refreshToken: expect.any(String),
      }),
    );
    expect(replay).toBeNull();
    expect(mobileSessionCreateMock).toHaveBeenCalledTimes(1);

    const claims = await verifyMobileSessionToken(first!.token, AUTH_SECRET);
    expect(claims?.sessionId).toBe("session-123");
  });

  it("does not let a failed PKCE guess consume the legitimate sign-in code", async () => {
    consumeOneShotKeyMock.mockResolvedValue(true);
    const code = await mintMobileAuthCode({
      userId: "user-123",
      challenge: PKCE_CHALLENGE,
      authSecret: AUTH_SECRET,
    });
    const env = { AUTH_SECRET, NODE_ENV: "test" } as NodeJS.ProcessEnv;

    const failedGuess = await exchangeMobileSignInCode({
      code,
      verifier: "not-the-verifier",
      env,
    });
    const legitimateExchange = await exchangeMobileSignInCode({
      code,
      verifier: "abc",
      env,
    });

    expect(failedGuess).toBeNull();
    expect(legitimateExchange).not.toBeNull();
    expect(consumeOneShotKeyMock).toHaveBeenCalledTimes(1);
  });

  it("rotates a refresh token only once, so a replay cannot mint another access token", async () => {
    mobileSessionFindUniqueMock.mockResolvedValue({
      id: "session-123",
      userId: "user-123",
      authenticatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { id: "user-123", email: "user@example.com", isActive: true },
    });
    mobileSessionUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const env = { AUTH_SECRET, NODE_ENV: "test" } as NodeJS.ProcessEnv;

    const first = await refreshMobileSession({
      refreshToken: "refresh-token",
      env,
    });
    const replay = await refreshMobileSession({
      refreshToken: "refresh-token",
      env,
    });

    expect(first).toEqual(
      expect.objectContaining({
        token: expect.any(String),
        refreshToken: expect.any(String),
      }),
    );
    expect(first?.refreshToken).not.toBe("refresh-token");
    expect(replay).toBeNull();
    expect(mobileSessionUpdateManyMock).toHaveBeenCalledTimes(2);
  });
});
