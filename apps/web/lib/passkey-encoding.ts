import { Buffer } from "node:buffer";

/**
 * Auth.js stores WebAuthn credential ids as standard base64, while WebAuthn
 * responses expose ids as base64url. Normalise incoming ids to Auth.js's stored
 * representation before database lookups.
 */
export function toStoredPasskeyCredentialId(credentialId: string): string {
  return Buffer.from(credentialId, "base64").toString("base64");
}

export function decodeStoredPasskeyBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}
