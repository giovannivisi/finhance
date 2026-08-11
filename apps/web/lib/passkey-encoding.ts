import { Buffer } from "node:buffer";

/**
 * Auth.js stores WebAuthn credential ids as standard base64, while WebAuthn
 * responses expose ids as base64url. Normalise incoming ids to Auth.js's stored
 * representation before database lookups.
 */
export function toStoredPasskeyCredentialId(credentialId: string): string {
  return Buffer.from(credentialId, "base64").toString("base64");
}

/** Convert Auth.js's standard-base64 credential ids back to WebAuthn base64url. */
export function toWebAuthnCredentialId(credentialId: string): string {
  return Buffer.from(credentialId, "base64").toString("base64url");
}

export function decodeStoredPasskeyBytes(
  value: string,
): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(value, "base64"));
}
