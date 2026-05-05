import "server-only";

import { importPKCS8, SignJWT } from "jose";
import { AUTH_MODE_HOSTED, isHostedAuthMode } from "./auth-mode";

interface HostedApiJwtConfig {
  issuer: string;
  audience: string;
  keyId: string;
  privateKeyPem: string;
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
  if (!isHostedAuthMode(env)) {
    throw new Error(
      `Hosted API JWT configuration is only available when AUTH_MODE=${AUTH_MODE_HOSTED}.`,
    );
  }

  return {
    issuer: readRequiredEnv("AUTH_API_JWT_ISSUER", env),
    audience: readRequiredEnv("AUTH_API_JWT_AUDIENCE", env),
    keyId: readRequiredEnv("AUTH_API_JWT_KID", env),
    privateKeyPem: readRequiredEnv("AUTH_API_JWT_PRIVATE_KEY", env),
  };
}

let cachedSigningKey:
  | {
      privateKeyPem: string;
      importedKey: Promise<CryptoKey>;
    }
  | undefined;

async function getHostedApiJwtPrivateKey(
  env: NodeJS.ProcessEnv = process.env,
): Promise<CryptoKey> {
  const { privateKeyPem } = resolveHostedApiJwtConfig(env);

  if (cachedSigningKey?.privateKeyPem === privateKeyPem) {
    return cachedSigningKey.importedKey;
  }

  const importedKey = importPKCS8(privateKeyPem, "ES256");
  cachedSigningKey = {
    privateKeyPem,
    importedKey,
  };

  return importedKey;
}

export async function mintApiAccessToken(input: {
  userId: string;
  email?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const env = input.env ?? process.env;
  const config = resolveHostedApiJwtConfig(env);
  const key = await getHostedApiJwtPrivateKey(env);

  const payload: Record<string, string> = {};
  if (input.email) {
    payload.email = input.email;
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(key);
}

export function getDirectApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  }

  return new URL(path, baseUrl).toString();
}
