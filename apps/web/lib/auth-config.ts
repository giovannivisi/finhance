import { AUTH_MODE_HOSTED, isHostedAuthMode } from "./auth-mode.shared.ts";

export const LOCAL_DEV_AUTH_SECRET = "local-dev-auth-secret";
export const AUTH_SIGNUP_MODE_BOOTSTRAP = "bootstrap";
export const AUTH_SIGNUP_MODE_OPEN = "open";

export type AuthSignupMode =
  | typeof AUTH_SIGNUP_MODE_BOOTSTRAP
  | typeof AUTH_SIGNUP_MODE_OPEN;

export function readRequiredHostedEnv(
  key: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(
      `${key} must be configured when AUTH_MODE=${AUTH_MODE_HOSTED}.`,
    );
  }

  return value;
}

export function resolveBootstrapEmail(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env.AUTH_BOOTSTRAP_EMAIL?.trim();

  if (value) {
    return value.toLowerCase();
  }

  if (!isHostedAuthMode(env)) {
    return null;
  }

  if (resolveAuthSignupMode(env) === AUTH_SIGNUP_MODE_BOOTSTRAP) {
    return readRequiredHostedEnv("AUTH_BOOTSTRAP_EMAIL", env).toLowerCase();
  }

  return null;
}

export function resolveAuthSignupMode(
  env: NodeJS.ProcessEnv = process.env,
): AuthSignupMode {
  const value = env.AUTH_SIGNUP_MODE?.trim().toLowerCase();

  if (!value) {
    return AUTH_SIGNUP_MODE_BOOTSTRAP;
  }

  if (value === AUTH_SIGNUP_MODE_BOOTSTRAP || value === AUTH_SIGNUP_MODE_OPEN) {
    return value;
  }

  throw new Error(
    `AUTH_SIGNUP_MODE must be "${AUTH_SIGNUP_MODE_BOOTSTRAP}" or "${AUTH_SIGNUP_MODE_OPEN}".`,
  );
}

export function resolveAuthSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.AUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (isHostedAuthMode(env)) {
    throw new Error(
      `${AUTH_MODE_HOSTED} auth mode requires AUTH_SECRET to be configured.`,
    );
  }

  return LOCAL_DEV_AUTH_SECRET;
}
