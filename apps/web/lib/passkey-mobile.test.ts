// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyMobilePasskeyAuthentication } from "@lib/passkey-mobile";

const {
  authenticatorFindUniqueMock,
  authenticatorUpdateMock,
  consumeOneShotKeyMock,
  createMobileSessionMock,
  userFindUniqueMock,
  verifyAuthenticationResponseMock,
  verifyMobilePasskeyChallengeTokenMock,
} = vi.hoisted(() => ({
  authenticatorFindUniqueMock: vi.fn(),
  authenticatorUpdateMock: vi.fn(),
  consumeOneShotKeyMock: vi.fn(),
  createMobileSessionMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  verifyAuthenticationResponseMock: vi.fn(),
  verifyMobilePasskeyChallengeTokenMock: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  verifyAuthenticationResponse: verifyAuthenticationResponseMock,
  verifyRegistrationResponse: vi.fn(),
}));

vi.mock("@lib/mobile-auth", () => ({
  createMobileSession: createMobileSessionMock,
}));

vi.mock("@lib/mobile-auth.core", () => ({
  mintMobilePasskeyChallengeToken: vi.fn(),
  mintMobilePasskeyRegChallengeToken: vi.fn(),
  verifyMobilePasskeyChallengeToken: verifyMobilePasskeyChallengeTokenMock,
  verifyMobilePasskeyRegChallengeToken: vi.fn(),
}));

vi.mock("@lib/passkey-encoding", () => ({
  decodeStoredPasskeyBytes: vi.fn(() => new Uint8Array([1, 2, 3])),
  toStoredPasskeyCredentialId: vi.fn((value: string) => `stored:${value}`),
  toWebAuthnCredentialId: vi.fn((value: string) => value),
}));

vi.mock("@lib/passkeys", () => ({
  PASSKEY_PROVIDER: "passkey",
  toPasskeyResponse: vi.fn(),
}));

vi.mock("@lib/prisma", () => ({
  prisma: {
    authAuthenticator: {
      findUnique: authenticatorFindUniqueMock,
      update: authenticatorUpdateMock,
    },
    user: { findUnique: userFindUniqueMock },
  },
}));

vi.mock("@lib/request-rate-limit", () => ({
  consumeOneShotKey: consumeOneShotKeyMock,
}));

const ENV = {
  AUTH_SECRET: "test-secret",
  AUTH_WEBAUTHN_ORIGIN: "https://finhance.test",
  AUTH_WEBAUTHN_RP_ID: "finhance.test",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv;

const RESPONSE = {
  id: "credential-1",
} as Parameters<typeof verifyMobilePasskeyAuthentication>[0]["response"];

describe("mobile passkey authentication", () => {
  beforeEach(() => {
    authenticatorFindUniqueMock.mockReset();
    authenticatorUpdateMock.mockReset();
    consumeOneShotKeyMock.mockReset();
    createMobileSessionMock.mockReset();
    userFindUniqueMock.mockReset();
    verifyAuthenticationResponseMock.mockReset();
    verifyMobilePasskeyChallengeTokenMock.mockReset();

    verifyMobilePasskeyChallengeTokenMock.mockResolvedValue({
      challenge: "webauthn-challenge",
      jti: "challenge-jti",
    });
    authenticatorFindUniqueMock.mockResolvedValue({
      credentialID: "stored:credential-1",
      credentialPublicKey: "AQID",
      counter: 0,
      transports: null,
      userId: "user-1",
    });
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 0 },
    });
    consumeOneShotKeyMock.mockResolvedValue(true);
    authenticatorUpdateMock.mockResolvedValue({});
    userFindUniqueMock.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      isActive: true,
    });
    createMobileSessionMock.mockResolvedValue({
      token: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("allows one verified assertion and rejects a replay of its challenge", async () => {
    consumeOneShotKeyMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const input = {
      response: RESPONSE,
      challenge: "signed-challenge-token",
      deviceLabel: "Test device",
    };

    await expect(
      verifyMobilePasskeyAuthentication(input, ENV),
    ).resolves.toEqual({
      token: "access-token",
      refreshToken: "refresh-token",
    });
    await expect(
      verifyMobilePasskeyAuthentication(input, ENV),
    ).resolves.toBeNull();

    expect(consumeOneShotKeyMock).toHaveBeenNthCalledWith(
      1,
      "mobile-passkey-auth-jti",
      "challenge-jti",
      300_000,
    );
    expect(authenticatorUpdateMock).toHaveBeenCalledTimes(1);
    expect(createMobileSessionMock).toHaveBeenCalledTimes(1);
  });

  it("does not consume a challenge for a malformed assertion", async () => {
    verifyAuthenticationResponseMock.mockRejectedValue(
      new Error("Malformed assertion"),
    );

    await expect(
      verifyMobilePasskeyAuthentication(
        { response: RESPONSE, challenge: "signed-challenge-token" },
        ENV,
      ),
    ).resolves.toBeNull();

    expect(consumeOneShotKeyMock).not.toHaveBeenCalled();
    expect(createMobileSessionMock).not.toHaveBeenCalled();
  });
});
