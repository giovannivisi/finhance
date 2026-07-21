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
  mobileConsumedRefreshTokenCreateMock,
  mobileConsumedRefreshTokenFindUniqueMock,
  mobileSessionCreateMock,
  mobileSessionFindUniqueMock,
  mobileSessionUpdateManyMock,
  prismaMock,
  userFindUniqueMock,
} = vi.hoisted(() => {
  const userFindUniqueMock = vi.fn();
  const mobileConsumedRefreshTokenCreateMock = vi.fn();
  const mobileConsumedRefreshTokenFindUniqueMock = vi.fn();
  const mobileSessionCreateMock = vi.fn();
  const mobileSessionFindUniqueMock = vi.fn();
  const mobileSessionUpdateManyMock = vi.fn();

  const prismaMock = {
    user: { findUnique: userFindUniqueMock },
    mobileConsumedRefreshToken: {
      create: mobileConsumedRefreshTokenCreateMock,
      findUnique: mobileConsumedRefreshTokenFindUniqueMock,
    },
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
  };

  prismaMock.$transaction.mockImplementation(
    async (callback: (tx: typeof prismaMock) => unknown) =>
      callback(prismaMock),
  );

  return {
    consumeOneShotKeyMock: vi.fn(),
    userFindUniqueMock,
    mobileConsumedRefreshTokenCreateMock,
    mobileConsumedRefreshTokenFindUniqueMock,
    mobileSessionCreateMock,
    mobileSessionFindUniqueMock,
    mobileSessionUpdateManyMock,
    prismaMock,
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
    mobileConsumedRefreshTokenCreateMock.mockReset();
    mobileConsumedRefreshTokenFindUniqueMock.mockReset();
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

  it("revokes the session when a consumed refresh token is replayed", async () => {
    mobileSessionFindUniqueMock
      .mockResolvedValueOnce({
        id: "session-123",
        userId: "user-123",
        authenticatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        user: { id: "user-123", email: "user@example.com", isActive: true },
      })
      .mockResolvedValueOnce(null);
    mobileConsumedRefreshTokenFindUniqueMock.mockResolvedValueOnce({
      sessionId: "session-123",
    });
    mobileSessionUpdateManyMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
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
    expect(mobileConsumedRefreshTokenCreateMock).toHaveBeenCalledWith({
      data: {
        sessionId: "session-123",
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(mobileSessionUpdateManyMock).toHaveBeenCalledTimes(2);
    expect(mobileSessionUpdateManyMock).toHaveBeenLastCalledWith({
      where: { id: "session-123", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("does not revoke a session for an unknown refresh token", async () => {
    mobileSessionFindUniqueMock.mockResolvedValue(null);
    mobileConsumedRefreshTokenFindUniqueMock.mockResolvedValue(null);

    await expect(
      refreshMobileSession({
        refreshToken: "unknown-refresh-token",
        env: { AUTH_SECRET, NODE_ENV: "test" } as NodeJS.ProcessEnv,
      }),
    ).resolves.toBeNull();

    expect(mobileSessionUpdateManyMock).not.toHaveBeenCalled();
  });
});
