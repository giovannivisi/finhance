import { describe, expect, it } from "vitest";

import {
  PASSCODE_LOCKOUT_POLICY,
  SCRYPT_PARAMETERS,
  createConfiguredAppLockRecord,
  deriveScryptHash,
  getPasscodeLockout,
  isValidPasscode,
  parseAppLockRecord,
  verifyConfiguredPasscode,
} from "./app-lock";

const salt = "0123456789abcdef0123456789abcdef";
const expectedHash = "a".repeat(64);

async function deriveHash(passcode: string): Promise<string> {
  return passcode === "123456" ? expectedHash : "b".repeat(64);
}

describe("app-lock passcodes", () => {
  it("derives a deterministic scrypt verifier", async () => {
    const first = await deriveScryptHash("123456", salt);
    const second = await deriveScryptHash("123456", salt);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it("only accepts 6 to 12 digit passcodes", () => {
    expect(isValidPasscode("12345")).toBe(false);
    expect(isValidPasscode("123456")).toBe(true);
    expect(isValidPasscode("123456789012")).toBe(true);
    expect(isValidPasscode("1234567890123")).toBe(false);
    expect(isValidPasscode("12345a")).toBe(false);
  });

  it("creates a versioned scrypt record without persisting the passcode", async () => {
    const record = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt,
      now: 100,
      deriveHash,
    });

    expect(record).toMatchObject({
      version: 1,
      state: "configured",
      biometricEnabled: true,
      verifier: {
        algorithm: "scrypt",
        salt,
        hash: expectedHash,
      },
      lockout: {
        failedAttempts: 0,
        lockoutLevel: 0,
        lockedUntil: null,
      },
    });
    expect(record).not.toHaveProperty("passcode");
    expect(record.verifier.N).toBe(SCRYPT_PARAMETERS.N);
  });

  it("keeps legacy scrypt records readable for an unlock-time upgrade", async () => {
    const record = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt,
      now: 100,
      deriveHash,
    });
    const legacyRecord = {
      ...record,
      verifier: { ...record.verifier, N: 16384 as const },
    };
    let derivedWithN: number | null = null;

    expect(parseAppLockRecord(legacyRecord)).toEqual(legacyRecord);

    const result = await verifyConfiguredPasscode(legacyRecord, "123456", {
      deriveHash: async (passcode, _salt, parameters) => {
        derivedWithN = parameters.N;
        return deriveHash(passcode);
      },
    });

    expect(result.success).toBe(true);
    expect(derivedWithN).toBe(2 ** 14);
  });

  it("does not rewrite a clean lockout record after a successful check", async () => {
    const record = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt,
      now: 100,
      deriveHash,
    });

    const result = await verifyConfiguredPasscode(record, "123456", {
      now: 200,
      deriveHash,
    });

    expect(result.success).toBe(true);
    expect(result.updatedRecord).toBe(record);
  });

  it("persists a rate limit after repeated incorrect passcodes", async () => {
    let record = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt,
      now: 1_000,
      deriveHash,
    });

    for (
      let attempt = 1;
      attempt < PASSCODE_LOCKOUT_POLICY.attemptsBeforeLockout;
      attempt += 1
    ) {
      const result = await verifyConfiguredPasscode(record, "654321", {
        now: 2_000 + attempt,
        deriveHash,
      });
      expect(result.success).toBe(false);
      record = result.updatedRecord;
      expect(getPasscodeLockout(record, 2_100).lockedUntil).toBeNull();
    }

    const finalAttempt = await verifyConfiguredPasscode(record, "654321", {
      now: 3_000,
      deriveHash,
    });

    expect(finalAttempt.success).toBe(false);
    expect(finalAttempt.lockedUntil).toBe(
      3_000 + PASSCODE_LOCKOUT_POLICY.durationsMs[0],
    );
    expect(finalAttempt.remainingAttempts).toBe(0);

    const whileLocked = await verifyConfiguredPasscode(
      finalAttempt.updatedRecord,
      "123456",
      { now: 3_001, deriveHash },
    );
    expect(whileLocked).toMatchObject({
      success: false,
      reason: "locked",
      lockedUntil: finalAttempt.lockedUntil,
    });
  });

  it("clears the lockout escalation after a correct passcode", async () => {
    const base = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt,
      now: 0,
      deriveHash,
    });
    const record = {
      ...base,
      lockout: {
        failedAttempts: 2,
        lockoutLevel: 3,
        lockedUntil: null,
      },
    };

    const result = await verifyConfiguredPasscode(record, "123456", {
      now: 10_000,
      deriveHash,
    });

    expect(result).toMatchObject({
      success: true,
      lockedUntil: null,
      remainingAttempts: PASSCODE_LOCKOUT_POLICY.attemptsBeforeLockout,
      updatedRecord: {
        lockout: {
          failedAttempts: 0,
          lockoutLevel: 0,
          lockedUntil: null,
        },
      },
    });
  });

  it("rejects malformed secure-store records instead of treating them as unlocked", async () => {
    const record = await createConfiguredAppLockRecord({
      passcode: "123456",
      salt,
      now: 100,
      deriveHash,
    });

    expect(parseAppLockRecord(record)).toEqual(record);
    expect(
      parseAppLockRecord({
        ...record,
        verifier: { ...record.verifier, hash: "not-a-verifier" },
      }),
    ).toBeNull();
  });
});
