import test from "node:test";
import assert from "node:assert/strict";
import { getPrimarySetupAction, getSetupProgressLabel } from "./setup.ts";

test("getPrimarySetupAction prefers incomplete required steps", () => {
  const action = getPrimarySetupAction({
    isComplete: false,
    requiredSteps: [
      {
        code: "ACCOUNTS",
        title: "Create your first account",
        detail: "",
        status: "INCOMPLETE",
        href: "/accounts",
        actionLabel: "Add account",
      },
    ],
    recommendedSteps: [
      {
        code: "RECURRING",
        title: "Add recurring rules",
        detail: "",
        status: "INCOMPLETE",
        href: "/recurring",
        actionLabel: "Set up recurring",
      },
    ],
    handoff: [],
  });

  assert.equal(action?.href, "/accounts");
});

test("getPrimarySetupAction falls through to handoff once setup is complete", () => {
  const action = getPrimarySetupAction({
    isComplete: true,
    requiredSteps: [
      {
        code: "ACCOUNTS",
        title: "Create your first account",
        detail: "",
        status: "COMPLETE",
        href: "/accounts",
        actionLabel: "Open accounts",
      },
    ],
    recommendedSteps: [],
    handoff: [
      {
        code: "REVIEW",
        title: "Open monthly review",
        detail: "",
        href: "/review?month=2026-04",
        actionLabel: "Open review",
      },
    ],
  });

  assert.equal(action?.href, "/review?month=2026-04");
});

test("getSetupProgressLabel renders the required-step summary", () => {
  assert.equal(
    getSetupProgressLabel({
      requiredCompletedCount: 1,
      requiredTotalCount: 2,
    }),
    "1 of 2 required steps complete",
  );
});
