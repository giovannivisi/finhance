export const AUTH_MODE_LOCAL = "local";
export const AUTH_MODE_HOSTED = "hosted";

export type AuthMode = typeof AUTH_MODE_LOCAL | typeof AUTH_MODE_HOSTED;

export function resolveAuthMode(
  env: NodeJS.ProcessEnv = process.env,
): AuthMode {
  const rawMode = env.AUTH_MODE?.trim().toLowerCase();

  if (!rawMode) {
    return AUTH_MODE_LOCAL;
  }

  if (rawMode === AUTH_MODE_LOCAL || rawMode === AUTH_MODE_HOSTED) {
    return rawMode;
  }

  throw new Error('AUTH_MODE must be "local" or "hosted".');
}

export function isHostedAuthMode(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveAuthMode(env) === AUTH_MODE_HOSTED;
}
