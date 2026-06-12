import { createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { AUTH_MODE_HOSTED, resolveAuthMode } from '@/config/auth-mode';

export interface HostedApiJwtConfig {
  issuer: string;
  audience: string;
  keyId: string;
  publicKeyPem: string;
}

function normalizePemValue(value: string): string {
  return value.replaceAll('\\r\\n', '\n').replaceAll('\\n', '\n');
}

function readRequiredEnv(key: string, env: NodeJS.ProcessEnv): string {
  const value = env[key]?.trim();

  if (!value) {
    throw new Error(`${key} must be configured in hosted auth mode.`);
  }

  return value;
}

export function resolveHostedApiJwtConfig(
  env: NodeJS.ProcessEnv = process.env,
): HostedApiJwtConfig {
  if (resolveAuthMode(env) !== AUTH_MODE_HOSTED) {
    throw new Error(
      'Hosted API JWT configuration is only available in hosted auth mode.',
    );
  }

  return {
    issuer: readRequiredEnv('AUTH_API_JWT_ISSUER', env),
    audience: readRequiredEnv('AUTH_API_JWT_AUDIENCE', env),
    keyId: readRequiredEnv('AUTH_API_JWT_KID', env),
    publicKeyPem: normalizePemValue(
      readRequiredEnv('AUTH_API_JWT_PUBLIC_KEY', env),
    ),
  };
}

let cachedPublicKey:
  | {
      publicKeyPem: string;
      keyObject: KeyObject;
    }
  | undefined;

export function getHostedApiJwtPublicKey(
  env: NodeJS.ProcessEnv = process.env,
): KeyObject {
  const { publicKeyPem } = resolveHostedApiJwtConfig(env);

  if (cachedPublicKey?.publicKeyPem === publicKeyPem) {
    return cachedPublicKey.keyObject;
  }

  const keyObject = createPublicKey(publicKeyPem);
  cachedPublicKey = {
    publicKeyPem,
    keyObject,
  };

  return keyObject;
}
