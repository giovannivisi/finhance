import type { SetupStatusResponse } from "@finhance/shared";
import { addMonthsToMonth } from "./analytics.ts";
import { getSetupProgressLabel } from "./setup.ts";

export type WorkflowPage =
  | "dashboard"
  | "setup"
  | "review"
  | "analytics"
  | "budgets"
  | "import";

export interface WorkflowCard {
  code: "SETUP" | "REVIEW" | "ANALYTICS" | "BUDGETS";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

export function buildAnalyticsFocusLink(month: string): string {
  const params = new URLSearchParams({
    from: addMonthsToMonth(month, -5),
    to: month,
  });

  return `/analytics?${params.toString()}`;
}

export function getWorkflowCards(input: {
  currentPage: WorkflowPage;
  month: string;
  setup: Pick<
    SetupStatusResponse,
    "isComplete" | "requiredCompletedCount" | "requiredTotalCount"
  > | null;
}): WorkflowCard[] {
  const cards: WorkflowCard[] = [];

  if (input.currentPage !== "setup" && input.setup && !input.setup.isComplete) {
    cards.push({
      code: "SETUP",
      title: "Finish the trust baseline",
      detail: `${getSetupProgressLabel(input.setup)}. Complete setup so review, analytics, and budgets stay explainable.`,
      href: "/setup",
      actionLabel: "Open setup",
    });
  }

  if (input.currentPage !== "review") {
    cards.push({
      code: "REVIEW",
      title: "Review this month",
      detail: `Explain what happened in ${input.month}, what still needs attention, and which warnings are worth acting on first.`,
      href: `/review?month=${encodeURIComponent(input.month)}`,
      actionLabel: "Open review",
    });
  }

  if (input.currentPage !== "analytics") {
    cards.push({
      code: "ANALYTICS",
      title: "Check the trend context",
      detail: `Open a six-month analytics range ending in ${input.month} to see whether this month is a one-off or part of a broader pattern.`,
      href: buildAnalyticsFocusLink(input.month),
      actionLabel: "Open analytics",
    });
  }

  if (input.currentPage !== "budgets") {
    cards.push({
      code: "BUDGETS",
      title: "Compare plan versus spend",
      detail: `Use budgets to compare ${input.month} spending with your current monthly limits and uncovered categories.`,
      href: `/budgets?month=${encodeURIComponent(input.month)}`,
      actionLabel: "Open budgets",
    });
  }

  return cards;
}
