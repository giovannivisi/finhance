import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import {
  decodeStoredPasskeyBytes,
  toStoredPasskeyCredentialId,
  toWebAuthnCredentialId,
} from "./passkey-encoding.ts";

test("toStoredPasskeyCredentialId normalises base64url ids to stored base64", () => {
  const bytes = new Uint8Array([251, 255, 0, 1, 2]);
  const storedBase64 = Buffer.from(bytes).toString("base64");
  const webAuthnBase64Url = storedBase64
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

  assert.equal(toStoredPasskeyCredentialId(webAuthnBase64Url), storedBase64);
  assert.equal(toWebAuthnCredentialId(storedBase64), webAuthnBase64Url);
});

test("decodeStoredPasskeyBytes decodes standard base64 authenticator fields", () => {
  const bytes = new Uint8Array([251, 255, 0, 1, 2]);
  const storedBase64 = Buffer.from(bytes).toString("base64");

  assert.deepEqual(
    Array.from(decodeStoredPasskeyBytes(storedBase64)),
    Array.from(bytes),
  );
});
