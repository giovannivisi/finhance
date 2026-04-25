import type {
  SetupHandoffResponse,
  SetupStatusResponse,
  SetupStepResponse,
} from "@finhance/shared";

export function getPrimarySetupAction(
  setup: Pick<
    SetupStatusResponse,
    "isComplete" | "requiredSteps" | "recommendedSteps" | "handoff"
  >,
): SetupStepResponse | SetupHandoffResponse | null {
  const nextRequired =
    setup.requiredSteps.find((step) => step.status === "INCOMPLETE") ?? null;
  if (nextRequired) {
    return nextRequired;
  }

  const nextRecommended =
    setup.recommendedSteps.find((step) => step.status === "INCOMPLETE") ?? null;
  if (nextRecommended) {
    return nextRecommended;
  }

  if (setup.isComplete) {
    return setup.handoff[0] ?? null;
  }

  return null;
}

export function getSetupProgressLabel(
  setup: Pick<
    SetupStatusResponse,
    "requiredCompletedCount" | "requiredTotalCount"
  >,
): string {
  return `${setup.requiredCompletedCount} of ${setup.requiredTotalCount} required steps complete`;
}
