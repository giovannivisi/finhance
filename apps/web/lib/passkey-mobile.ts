import "server-only";

import { Buffer } from "node:buffer";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type VerifyAuthenticationResponseOpts,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { Prisma } from "@finhance/db";

import { createMobileSession } from "./mobile-auth";
import {
  mintMobilePasskeyChallengeToken,
  mintMobilePasskeyRegChallengeToken,
  verifyMobilePasskeyChallengeToken,
  verifyMobilePasskeyRegChallengeToken,
} from "./mobile-auth.core";
import {
  decodeStoredPasskeyBytes,
  toStoredPasskeyCredentialId,
  toWebAuthnCredentialId,
} from "./passkey-encoding";
import { PASSKEY_PROVIDER, toPasskeyResponse } from "./passkeys";
import { prisma } from "./prisma";
import { consumeOneShotKey } from "./request-rate-limit";

// Derive the WebAuthn shapes from the verify options so we do not depend on the
// transitive @simplewebauthn/types package directly.
type AuthenticationResponseJSON = VerifyAuthenticationResponseOpts["response"];
type RegistrationResponseJSON = VerifyRegistrationResponseOpts["response"];
type WebAuthnCredential = VerifyAuthenticationResponseOpts["credential"];

const DEFAULT_RP_ID = "finhance-web.vercel.app";

// One-shot store for registration challenge jtis; the TTL matches
// MOBILE_PASSKEY_CHALLENGE_TTL so rows expire with the tokens they guard.
const REG_CHALLENGE_JTI_SCOPE = "mobile-passkey-reg-jti";
const REG_CHALLENGE_JTI_TTL_MS = 5 * 60_000;

function resolveRpId(env: NodeJS.ProcessEnv): string {
  return env.AUTH_WEBAUTHN_RP_ID?.trim() || DEFAULT_RP_ID;
}

function resolveExpectedOrigin(env: NodeJS.ProcessEnv): string {
  const explicit = env.AUTH_WEBAUTHN_ORIGIN?.trim();
  return explicit || `https://${resolveRpId(env)}`;
}

function readAuthSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("AUTH_SECRET must be configured in hosted auth mode.");
  }

  return secret;
}

export interface MobilePasskeyChallenge {
  /** The WebAuthn request options the app passes to the native ceremony. */
  options: Awaited<ReturnType<typeof generateAuthenticationOptions>>;
  /** Signed, short-lived token carrying the challenge back to the verify call. */
  challenge: string;
}

export interface MobilePasskeyRegistrationChallenge {
  /** The WebAuthn registration options the app passes to the native ceremony. */
  options: Awaited<ReturnType<typeof generateRegistrationOptions>>;
  /** Signed, short-lived token carrying the challenge back to the verify call. */
  challenge: string;
}

function parseTransports(
  transports: string | null,
): WebAuthnCredential["transports"] {
  return transports
    ? (transports
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean) as WebAuthnCredential["transports"])
    : undefined;
}

function toStoredBytes(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

/**
 * Starts a discoverable-credential (usernameless) passkey authentication for the
 * mobile app. The same `auth_authenticators` records the web passkeys use are
 * accepted, so a passkey registered on the web works in the app once the app
 * and web share the RP ID via Associated Domains.
 */
export async function createMobilePasskeyAuthentication(
  env: NodeJS.ProcessEnv = process.env,
): Promise<MobilePasskeyChallenge> {
  const options = await generateAuthenticationOptions({
    rpID: resolveRpId(env),
    userVerification: "required",
    // No allowCredentials -> the authenticator offers its resident keys, the
    // same usernameless flow the web "Log in with passkey" button uses.
  });

  const challenge = await mintMobilePasskeyChallengeToken({
    challenge: options.challenge,
    authSecret: readAuthSecret(env),
  });

  return { options, challenge };
}

/**
 * Verifies a mobile passkey assertion against the stored authenticator and, on
 * success, creates a device-bound mobile session. Returns null for every
 * failure so the route can answer 401 uniformly without leaking which check
 * failed.
 */
export async function verifyMobilePasskeyAuthentication(
  input: {
    response: AuthenticationResponseJSON;
    challenge: string;
    deviceLabel?: string | null;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ token: string; refreshToken: string } | null> {
  const authSecret = readAuthSecret(env);

  const expectedChallenge = await verifyMobilePasskeyChallengeToken(
    input.challenge,
    authSecret,
  );
  if (!expectedChallenge) {
    return null;
  }

  const credentialId = input.response?.id;
  if (!credentialId || typeof credentialId !== "string") {
    return null;
  }

  const storedCredentialId = toStoredPasskeyCredentialId(credentialId);
  const stored = await prisma.authAuthenticator.findUnique({
    where: { credentialID: storedCredentialId },
  });
  if (!stored) {
    return null;
  }

  const credential: WebAuthnCredential = {
    id: credentialId,
    publicKey: decodeStoredPasskeyBytes(stored.credentialPublicKey),
    counter: stored.counter,
    transports: parseTransports(stored.transports),
  };

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge,
      expectedOrigin: resolveExpectedOrigin(env),
      expectedRPID: resolveRpId(env),
      credential,
      requireUserVerification: true,
    });
  } catch {
    return null;
  }

  if (!verification.verified) {
    return null;
  }

  await prisma.authAuthenticator.update({
    where: { credentialID: stored.credentialID },
    data: { counter: verification.authenticationInfo.newCounter },
  });

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, isActive: true },
  });
  if (!user?.isActive) {
    return null;
  }

  return createMobileSession({
    userId: user.id,
    email: user.email,
    deviceLabel: input.deviceLabel,
    env,
  });
}

export async function createMobilePasskeyRegistration(
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<MobilePasskeyRegistrationChallenge | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isActive: true },
  });

  if (!user?.isActive) {
    return null;
  }

  const existingAuthenticators = await prisma.authAuthenticator.findMany({
    where: { userId },
    select: { credentialID: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: "finhance",
    rpID: resolveRpId(env),
    userID: new TextEncoder().encode(user.id),
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? "finhance user",
    attestationType: "none",
    excludeCredentials: existingAuthenticators.map((authenticator) => ({
      id: toWebAuthnCredentialId(authenticator.credentialID),
      transports: parseTransports(authenticator.transports),
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  const challenge = await mintMobilePasskeyRegChallengeToken({
    challenge: options.challenge,
    userId,
    authSecret: readAuthSecret(env),
  });

  return { options, challenge };
}

export async function verifyMobilePasskeyRegistration(
  input: {
    userId: string;
    response: RegistrationResponseJSON;
    challenge: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReturnType<typeof toPasskeyResponse> | null> {
  const authSecret = readAuthSecret(env);
  const challengeClaims = await verifyMobilePasskeyRegChallengeToken(
    input.challenge,
    authSecret,
  );

  if (!challengeClaims || challengeClaims.userId !== input.userId) {
    return null;
  }

  // Each challenge token is single-use: consuming the jti here means a leaked
  // token cannot be replayed within its TTL for a second registration.
  const consumed = await consumeOneShotKey(
    REG_CHALLENGE_JTI_SCOPE,
    challengeClaims.jti,
    REG_CHALLENGE_JTI_TTL_MS,
  );

  if (!consumed) {
    return null;
  }

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challengeClaims.challenge,
      expectedOrigin: resolveExpectedOrigin(env),
      expectedRPID: resolveRpId(env),
      requireUserVerification: true,
    });
  } catch {
    return null;
  }

  const registrationInfo = verification.registrationInfo;
  if (!verification.verified || !registrationInfo) {
    return null;
  }

  const credentialId = toStoredPasskeyCredentialId(
    registrationInfo.credential.id,
  );
  const transports = Array.isArray(input.response.response.transports)
    ? input.response.response.transports.join(",")
    : null;

  try {
    const created = await prisma.$transaction(
      async (tx) => {
        await tx.authProviderAccount.create({
          data: {
            userId: input.userId,
            type: "webauthn",
            provider: PASSKEY_PROVIDER,
            providerAccountId: credentialId,
          },
        });

        return tx.authAuthenticator.create({
          data: {
            userId: input.userId,
            providerAccountId: credentialId,
            credentialID: credentialId,
            credentialPublicKey: toStoredBytes(
              registrationInfo.credential.publicKey,
            ),
            counter: registrationInfo.credential.counter,
            credentialDeviceType: registrationInfo.credentialDeviceType,
            credentialBackedUp: registrationInfo.credentialBackedUp,
            transports,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return toPasskeyResponse(created);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }

    throw error;
  }
}
