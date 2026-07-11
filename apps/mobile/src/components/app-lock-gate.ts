import { resolveAppLockAccessibility } from "@/security/app-lock-lifecycle";

export function resolveAppLockGateVisibility(input: {
  active: boolean;
  isEnabled: boolean;
  legacyPasscodeRequired: boolean;
  lifecycleLocked: boolean;
  launchCoverVisible: boolean;
  status: string;
}) {
  const gateVisible =
    input.active &&
    (input.status === "storage-error" ||
      (input.isEnabled &&
        (input.lifecycleLocked || input.legacyPasscodeRequired)));

  return {
    gateVisible,
    accessibility: resolveAppLockAccessibility(
      gateVisible || input.launchCoverVisible,
    ),
  };
}
