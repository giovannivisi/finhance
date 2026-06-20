import "server-only";

import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { mintMobileToken } from "./mobile-auth";
import {
  mintMobilePasskeyChallengeToken,
  verifyMobilePasskeyChallengeToken,
} from "./mobile-auth.core";
import { prisma } from "./prisma";

// Derive the WebAuthn shapes from the verify options so we do not depend on the
// transitive @simplewebauthn/types package directly.
type AuthenticationResponseJSON = VerifyAuthenticationResponseOpts["response"];
type AuthenticatorDevice = VerifyAuthenticationResponseOpts["authenticator"];

const DEFAULT_RP_ID = "finhance-web.vercel.app";

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
    userVerification: "preferred",
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
 * success, mints a mobile session token. Returns null for every failure so the
 * route can answer 401 uniformly without leaking which check failed.
 */
export async function verifyMobilePasskeyAuthentication(
  input: {
    response: AuthenticationResponseJSON;
    challenge: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ token: string } | null> {
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

  const stored = await prisma.authAuthenticator.findUnique({
    where: { credentialID: credentialId },
  });
  if (!stored) {
    return null;
  }

  const authenticator: AuthenticatorDevice = {
    credentialID: isoBase64URL.toBuffer(stored.credentialID),
    credentialPublicKey: isoBase64URL.toBuffer(stored.credentialPublicKey),
    counter: stored.counter,
    transports: stored.transports
      ? (stored.transports
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean) as AuthenticatorDevice["transports"])
      : undefined,
  };

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge,
      expectedOrigin: resolveExpectedOrigin(env),
      expectedRPID: resolveRpId(env),
      authenticator,
      requireUserVerification: false,
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

  const token = await mintMobileToken({
    userId: user.id,
    email: user.email,
    env,
  });

  return { token };
}
