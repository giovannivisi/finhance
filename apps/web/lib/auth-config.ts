import { AUTH_MODE_HOSTED, isHostedAuthMode } from "./auth-mode.shared.ts";

export const LOCAL_DEV_AUTH_SECRET = "local-dev-auth-secret";

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
): string {
  return readRequiredHostedEnv("AUTH_BOOTSTRAP_EMAIL", env).toLowerCase();
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
