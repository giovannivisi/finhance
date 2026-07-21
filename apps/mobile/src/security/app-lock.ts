import { scryptAsync } from "@noble/hashes/scrypt.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

export const APP_LOCK_RECORD_VERSION = 1;
export const PASSCODE_MIN_LENGTH = 6;
export const PASSCODE_MAX_LENGTH = 12;

const SALT_BYTES = 16;
const SCRYPT_DERIVED_KEY_LENGTH = 32;

/**
 * App-lock records live in device-bound secure storage and are also protected
 * by the persisted attempt lockout below. Keep the derivation expensive enough
 * to slow offline guessing while staying responsive on older mobile CPUs.
 *
 * Records created before the mobile responsiveness pass used N = 2 ** 14.
 * They remain readable and are upgraded after the next successful unlock.
 */
export const SCRYPT_PARAMETERS = {
  N: 2 ** 13,
  r: 8,
  p: 1,
  dkLen: SCRYPT_DERIVED_KEY_LENGTH,
  asyncTick: 4,
} as const;

const LEGACY_SCRYPT_N = 2 ** 14;
const SUPPORTED_SCRYPT_N = [SCRYPT_PARAMETERS.N, LEGACY_SCRYPT_N] as const;

export type SupportedScryptN = (typeof SUPPORTED_SCRYPT_N)[number];

export interface ScryptDerivationParameters {
  N: SupportedScryptN;
  r: typeof SCRYPT_PARAMETERS.r;
  p: typeof SCRYPT_PARAMETERS.p;
  dkLen: typeof SCRYPT_PARAMETERS.dkLen;
  asyncTick: typeof SCRYPT_PARAMETERS.asyncTick;
}

export const PASSCODE_LOCKOUT_POLICY = {
  attemptsBeforeLockout: 5,
  durationsMs: [30_000, 5 * 60_000, 15 * 60_000, 60 * 60_000],
} as const;

export interface PasscodeLockout {
  /** Failed attempts since the most recent completed lockout. */
  failedAttempts: number;
  /** Escalates after each lockout and resets only after a correct passcode. */
  lockoutLevel: number;
  /** Epoch milliseconds, or null when passcode entry is currently allowed. */
  lockedUntil: number | null;
}

export interface ScryptPasscodeVerifier {
  algorithm: "scrypt";
  N: SupportedScryptN;
  r: typeof SCRYPT_PARAMETERS.r;
  p: typeof SCRYPT_PARAMETERS.p;
  dkLen: typeof SCRYPT_PARAMETERS.dkLen;
  /** Hex-encoded random bytes. */
  salt: string;
  /** Hex-encoded derived key. */
  hash: string;
}

export interface ConfiguredAppLockRecord {
  version: typeof APP_LOCK_RECORD_VERSION;
  state: "configured";
  verifier: ScryptPasscodeVerifier;
  biometricEnabled: boolean;
  lockout: PasscodeLockout;
  createdAt: number;
  updatedAt: number;
}

/**
 * Existing users may have enabled the former biometric-only lock. We preserve
 * that protection while requiring a passcode before allowing biometrics to be
 * disabled or the app lock to be removed.
 */
export interface LegacyPasscodeRequiredAppLockRecord {
  version: typeof APP_LOCK_RECORD_VERSION;
  state: "legacy-passcode-required";
  biometricEnabled: true;
  createdAt: number;
  updatedAt: number;
}

export type AppLockRecord =
  | ConfiguredAppLockRecord
  | LegacyPasscodeRequiredAppLockRecord;

export interface PasscodeVerificationSuccess {
  success: true;
  updatedRecord: ConfiguredAppLockRecord;
  lockedUntil: null;
  remainingAttempts: number;
}

export interface PasscodeVerificationFailure {
  success: false;
  reason: "invalid-passcode" | "incorrect" | "locked";
  /** The record that must be persisted to retain a failed-attempt lockout. */
  updatedRecord: ConfiguredAppLockRecord;
  lockedUntil: number | null;
  remainingAttempts: number;
}

export type PasscodeVerification =
  | PasscodeVerificationSuccess
  | PasscodeVerificationFailure;

export function isValidPasscode(passcode: string): boolean {
  return new RegExp(
    `^\\d{${PASSCODE_MIN_LENGTH},${PASSCODE_MAX_LENGTH}}$`,
  ).test(passcode);
}

export function isConfiguredAppLockRecord(
  record: AppLockRecord,
): record is ConfiguredAppLockRecord {
  return record.state === "configured";
}

export function createLegacyPasscodeRequiredRecord(
  now = Date.now(),
): LegacyPasscodeRequiredAppLockRecord {
  return {
    version: APP_LOCK_RECORD_VERSION,
    state: "legacy-passcode-required",
    biometricEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidScryptSalt(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${SALT_BYTES * 2}}$`, "i").test(value);
}

export async function deriveScryptHash(
  passcode: string,
  salt: string,
  parameters: ScryptDerivationParameters = SCRYPT_PARAMETERS,
): Promise<string> {
  const derived = await scryptAsync(utf8ToBytes(passcode), salt, parameters);
  return bytesToHex(derived);
}

export interface CreateConfiguredAppLockRecordInput {
  passcode: string;
  salt: string;
  biometricEnabled?: boolean;
  now?: number;
  createdAt?: number;
  deriveHash?: (passcode: string, salt: string) => Promise<string>;
}

export async function createConfiguredAppLockRecord({
  passcode,
  salt,
  biometricEnabled = true,
  now = Date.now(),
  createdAt = now,
  deriveHash = deriveScryptHash,
}: CreateConfiguredAppLockRecordInput): Promise<ConfiguredAppLockRecord> {
  if (!isValidPasscode(passcode)) {
    throw new Error("Passcodes must contain 6 to 12 digits.");
  }

  if (!isValidScryptSalt(salt)) {
    throw new Error("The passcode salt is invalid.");
  }

  const hash = await deriveHash(passcode, salt);

  if (!isValidVerifierHash(hash)) {
    throw new Error("The passcode verifier is invalid.");
  }

  return {
    version: APP_LOCK_RECORD_VERSION,
    state: "configured",
    verifier: {
      algorithm: "scrypt",
      N: SCRYPT_PARAMETERS.N,
      r: SCRYPT_PARAMETERS.r,
      p: SCRYPT_PARAMETERS.p,
      dkLen: SCRYPT_PARAMETERS.dkLen,
      salt: salt.toLowerCase(),
      hash: hash.toLowerCase(),
    },
    biometricEnabled,
    lockout: {
      failedAttempts: 0,
      lockoutLevel: 0,
      lockedUntil: null,
    },
    createdAt,
    updatedAt: now,
  };
}

export function getPasscodeLockout(
  record: ConfiguredAppLockRecord,
  now = Date.now(),
): { lockedUntil: number | null; remainingAttempts: number } {
  const lockedUntil =
    record.lockout.lockedUntil !== null && record.lockout.lockedUntil > now
      ? record.lockout.lockedUntil
      : null;

  return {
    lockedUntil,
    remainingAttempts: lockedUntil
      ? 0
      : Math.max(
          0,
          PASSCODE_LOCKOUT_POLICY.attemptsBeforeLockout -
            record.lockout.failedAttempts,
        ),
  };
}

export function recordFailedPasscodeAttempt(
  record: ConfiguredAppLockRecord,
  now = Date.now(),
): ConfiguredAppLockRecord {
  const current = getPasscodeLockout(record, now);

  if (current.lockedUntil) {
    return record;
  }

  const failedAttempts = record.lockout.failedAttempts + 1;

  if (failedAttempts < PASSCODE_LOCKOUT_POLICY.attemptsBeforeLockout) {
    return {
      ...record,
      lockout: {
        ...record.lockout,
        failedAttempts,
        // Expired timestamps are no longer meaningful once a new attempt is
        // recorded; keep the persisted state canonical.
        lockedUntil: null,
      },
      updatedAt: now,
    };
  }

  const lockoutLevel = Math.min(
    record.lockout.lockoutLevel + 1,
    PASSCODE_LOCKOUT_POLICY.durationsMs.length,
  );
  const duration =
    PASSCODE_LOCKOUT_POLICY.durationsMs[lockoutLevel - 1] ??
    PASSCODE_LOCKOUT_POLICY.durationsMs[
      PASSCODE_LOCKOUT_POLICY.durationsMs.length - 1
    ]!;

  return {
    ...record,
    lockout: {
      failedAttempts: 0,
      lockoutLevel,
      lockedUntil: now + duration,
    },
    updatedAt: now,
  };
}

export function resetPasscodeLockout(
  record: ConfiguredAppLockRecord,
  now = Date.now(),
): ConfiguredAppLockRecord {
  if (
    record.lockout.failedAttempts === 0 &&
    record.lockout.lockoutLevel === 0 &&
    record.lockout.lockedUntil === null
  ) {
    return record;
  }

  return {
    ...record,
    lockout: {
      failedAttempts: 0,
      lockoutLevel: 0,
      lockedUntil: null,
    },
    updatedAt: now,
  };
}

export async function verifyConfiguredPasscode(
  record: ConfiguredAppLockRecord,
  passcode: string,
  options: {
    now?: number;
    deriveHash?: (
      passcode: string,
      salt: string,
      parameters: ScryptDerivationParameters,
    ) => Promise<string>;
  } = {},
): Promise<PasscodeVerification> {
  const now = options.now ?? Date.now();
  const deriveHash = options.deriveHash ?? deriveScryptHash;
  const lockout = getPasscodeLockout(record, now);

  if (lockout.lockedUntil) {
    return {
      success: false,
      reason: "locked",
      updatedRecord: record,
      lockedUntil: lockout.lockedUntil,
      remainingAttempts: 0,
    };
  }

  if (!isValidPasscode(passcode)) {
    return {
      success: false,
      reason: "invalid-passcode",
      updatedRecord: record,
      lockedUntil: null,
      remainingAttempts: lockout.remainingAttempts,
    };
  }

  const actualHash = await deriveHash(passcode, record.verifier.salt, {
    N: record.verifier.N,
    r: record.verifier.r,
    p: record.verifier.p,
    dkLen: record.verifier.dkLen,
    asyncTick: SCRYPT_PARAMETERS.asyncTick,
  });

  if (timingSafeEqualHex(actualHash, record.verifier.hash)) {
    const updatedRecord = resetPasscodeLockout(record, now);
    return {
      success: true,
      updatedRecord,
      lockedUntil: null,
      remainingAttempts: PASSCODE_LOCKOUT_POLICY.attemptsBeforeLockout,
    };
  }

  const updatedRecord = recordFailedPasscodeAttempt(record, now);
  const updatedLockout = getPasscodeLockout(updatedRecord, now);

  return {
    success: false,
    reason: "incorrect",
    updatedRecord,
    lockedUntil: updatedLockout.lockedUntil,
    remainingAttempts: updatedLockout.remainingAttempts,
  };
}

export function parseAppLockRecord(value: unknown): AppLockRecord | null {
  if (!isPlainObject(value) || value.version !== APP_LOCK_RECORD_VERSION) {
    return null;
  }

  if (
    value.state === "legacy-passcode-required" &&
    value.biometricEnabled === true &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  ) {
    return {
      version: APP_LOCK_RECORD_VERSION,
      state: "legacy-passcode-required",
      biometricEnabled: true,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    };
  }

  if (
    value.state !== "configured" ||
    typeof value.biometricEnabled !== "boolean" ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !isScryptVerifier(value.verifier) ||
    !isPasscodeLockout(value.lockout)
  ) {
    return null;
  }

  return {
    version: APP_LOCK_RECORD_VERSION,
    state: "configured",
    verifier: {
      ...value.verifier,
      salt: value.verifier.salt.toLowerCase(),
      hash: value.verifier.hash.toLowerCase(),
    },
    biometricEnabled: value.biometricEnabled,
    lockout: value.lockout,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPasscodeLockout(value: unknown): value is PasscodeLockout {
  return (
    isPlainObject(value) &&
    typeof value.failedAttempts === "number" &&
    Number.isSafeInteger(value.failedAttempts) &&
    value.failedAttempts >= 0 &&
    value.failedAttempts < PASSCODE_LOCKOUT_POLICY.attemptsBeforeLockout &&
    typeof value.lockoutLevel === "number" &&
    Number.isSafeInteger(value.lockoutLevel) &&
    value.lockoutLevel >= 0 &&
    value.lockoutLevel <= PASSCODE_LOCKOUT_POLICY.durationsMs.length &&
    (value.lockedUntil === null || isTimestamp(value.lockedUntil))
  );
}

function isScryptVerifier(value: unknown): value is ScryptPasscodeVerifier {
  return (
    isPlainObject(value) &&
    value.algorithm === "scrypt" &&
    typeof value.N === "number" &&
    SUPPORTED_SCRYPT_N.includes(value.N as SupportedScryptN) &&
    value.r === SCRYPT_PARAMETERS.r &&
    value.p === SCRYPT_PARAMETERS.p &&
    value.dkLen === SCRYPT_PARAMETERS.dkLen &&
    typeof value.salt === "string" &&
    isValidScryptSalt(value.salt) &&
    typeof value.hash === "string" &&
    isValidVerifierHash(value.hash)
  );
}

function isValidVerifierHash(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${SCRYPT_DERIVED_KEY_LENGTH * 2}}$`, "i").test(
    value,
  );
}

/**
 * Avoid an early-exit comparison. JavaScript cannot promise a perfectly
 * constant-time execution, but this prevents the obvious prefix timing leak.
 */
function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}
