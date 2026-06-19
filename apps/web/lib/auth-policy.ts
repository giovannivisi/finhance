import type { GitHubProfile } from "next-auth/providers/github";
import type { GoogleProfile } from "next-auth/providers/google";
import {
  AUTH_SIGNUP_MODE_BOOTSTRAP,
  AUTH_SIGNUP_MODE_OPEN,
  type AuthSignupMode,
} from "./auth-config.ts";

type VerifiedGitHubProfile = GitHubProfile & {
  email_verified?: boolean;
};

export function normalizeEmailAddress(
  value: string | null | undefined,
): Lowercase<string> | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized ? (normalized as Lowercase<string>) : null;
}

export function hasVerifiedProviderEmail(
  provider: string | undefined,
  profile: Record<string, unknown> | undefined,
): boolean {
  if (!provider || !profile) {
    return false;
  }

  if (provider === "google") {
    return Boolean((profile as GoogleProfile).email_verified);
  }

  if (provider === "github") {
    return Boolean((profile as VerifiedGitHubProfile).email_verified);
  }

  return false;
}

export function resolveHostedSignInDecision(input: {
  provider: string | undefined;
  profile: Record<string, unknown> | undefined;
  userEmail: string | null | undefined;
  existingUser: { isActive: boolean } | null;
  bootstrapEmail: string | null;
  signupMode?: AuthSignupMode;
}): boolean {
  const normalizedEmail =
    normalizeEmailAddress(input.userEmail) ??
    normalizeEmailAddress(
      typeof input.profile?.email === "string" ? input.profile.email : null,
    );

  if (!normalizedEmail) {
    return false;
  }

  if (input.provider === "passkey") {
    return input.existingUser?.isActive === true;
  }

  if (!hasVerifiedProviderEmail(input.provider, input.profile)) {
    return false;
  }

  if (input.existingUser) {
    return input.existingUser.isActive;
  }

  if (
    (input.signupMode ?? AUTH_SIGNUP_MODE_BOOTSTRAP) === AUTH_SIGNUP_MODE_OPEN
  ) {
    return true;
  }

  return normalizedEmail === normalizeEmailAddress(input.bootstrapEmail);
}
