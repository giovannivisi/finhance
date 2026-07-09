import assert from "node:assert/strict";
import test from "node:test";
import {
  hasVerifiedProviderEmail,
  normalizeEmailAddress,
  resolveHostedSignInDecision,
} from "./auth-policy.ts";
import {
  AUTH_SIGNUP_MODE_BOOTSTRAP,
  AUTH_SIGNUP_MODE_OPEN,
} from "./auth-config.ts";

test("normalizeEmailAddress trims and lowercases emails", () => {
  assert.equal(
    normalizeEmailAddress(" Owner@Example.com "),
    "owner@example.com",
  );
  assert.equal(normalizeEmailAddress("   "), null);
});

test("hasVerifiedProviderEmail recognizes Google and GitHub verification flags", () => {
  assert.equal(
    hasVerifiedProviderEmail("google", { email_verified: true }),
    true,
  );
  assert.equal(
    hasVerifiedProviderEmail("github", { email_verified: true }),
    true,
  );
  assert.equal(
    hasVerifiedProviderEmail("github", { email_verified: false }),
    false,
  );
});

test("resolveHostedSignInDecision allows active existing users", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "google",
      profile: { email_verified: true },
      userEmail: "member@example.com",
      existingUser: { isActive: true },
      bootstrapEmail: "owner@example.com",
    }),
    true,
  );
});

test("resolveHostedSignInDecision allows session-bound provider linking", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "github",
      profile: {
        email: "different@example.com",
        email_verified: true,
      },
      userEmail: "different@example.com",
      existingUser: null,
      bootstrapEmail: "owner@example.com",
      signupMode: AUTH_SIGNUP_MODE_BOOTSTRAP,
      linkingSessionUserId: "user-1",
      linkedAccountUserId: null,
    }),
    true,
  );
});

test("resolveHostedSignInDecision rejects provider links owned by another user", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "github",
      profile: {
        email: "different@example.com",
        email_verified: true,
      },
      userEmail: "different@example.com",
      existingUser: null,
      bootstrapEmail: "owner@example.com",
      signupMode: AUTH_SIGNUP_MODE_OPEN,
      linkingSessionUserId: "user-1",
      linkedAccountUserId: "user-2",
    }),
    false,
  );
});

test("resolveHostedSignInDecision rejects inactive existing users", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "google",
      profile: { email_verified: true },
      userEmail: "member@example.com",
      existingUser: { isActive: false },
      bootstrapEmail: "owner@example.com",
    }),
    false,
  );
});

test("resolveHostedSignInDecision allows new verified OAuth users in open signup mode", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "google",
      profile: {
        email: "new@example.com",
        email_verified: true,
      },
      userEmail: null,
      existingUser: null,
      bootstrapEmail: null,
      signupMode: AUTH_SIGNUP_MODE_OPEN,
    }),
    true,
  );
  assert.equal(
    resolveHostedSignInDecision({
      provider: "github",
      profile: {
        email: "new@example.com",
        email_verified: true,
      },
      userEmail: null,
      existingUser: null,
      bootstrapEmail: null,
      signupMode: AUTH_SIGNUP_MODE_OPEN,
    }),
    true,
  );
});

test("resolveHostedSignInDecision allows the bootstrap email for first sign-in", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "github",
      profile: {
        email: "Owner@example.com",
        email_verified: true,
      },
      userEmail: null,
      existingUser: null,
      bootstrapEmail: "owner@example.com",
      signupMode: AUTH_SIGNUP_MODE_BOOTSTRAP,
    }),
    true,
  );
});

test("resolveHostedSignInDecision rejects unverified or unexpected emails", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "github",
      profile: {
        email: "owner@example.com",
        email_verified: false,
      },
      userEmail: null,
      existingUser: null,
      bootstrapEmail: "owner@example.com",
      signupMode: AUTH_SIGNUP_MODE_OPEN,
    }),
    false,
  );
  assert.equal(
    resolveHostedSignInDecision({
      provider: "google",
      profile: {
        email: "member@example.com",
        email_verified: true,
      },
      userEmail: null,
      existingUser: null,
      bootstrapEmail: "owner@example.com",
      signupMode: AUTH_SIGNUP_MODE_BOOTSTRAP,
    }),
    false,
  );
});

test("resolveHostedSignInDecision only allows passkey sign-in for existing active users", () => {
  assert.equal(
    resolveHostedSignInDecision({
      provider: "passkey",
      profile: undefined,
      userEmail: "member@example.com",
      existingUser: { isActive: true },
      bootstrapEmail: null,
      signupMode: AUTH_SIGNUP_MODE_OPEN,
    }),
    true,
  );
  assert.equal(
    resolveHostedSignInDecision({
      provider: "passkey",
      profile: undefined,
      userEmail: "member@example.com",
      existingUser: { isActive: false },
      bootstrapEmail: null,
      signupMode: AUTH_SIGNUP_MODE_OPEN,
    }),
    false,
  );
  assert.equal(
    resolveHostedSignInDecision({
      provider: "passkey",
      profile: { email: "new@example.com" },
      userEmail: null,
      existingUser: null,
      bootstrapEmail: null,
      signupMode: AUTH_SIGNUP_MODE_OPEN,
    }),
    false,
  );
});
