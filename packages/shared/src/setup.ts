export type SetupStepCode = "ACCOUNTS" | "CATEGORIES" | "RECURRING" | "BUDGETS";

export type SetupStepStatus = "COMPLETE" | "INCOMPLETE";

export interface SetupStepResponse {
  code: SetupStepCode;
  title: string;
  detail: string;
  status: SetupStepStatus;
  href: string;
  actionLabel: string;
}

export type SetupWarningCode =
  | "BASELINE_MISSING"
  | "RECONCILIATION_ISSUES"
  | "NO_SNAPSHOT_YET";

export type SetupWarningSeverity = "INFO" | "WARNING";

export interface SetupWarningResponse {
  code: SetupWarningCode;
  severity: SetupWarningSeverity;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  count: number | null;
}

export type SetupHandoffCode = "REVIEW" | "ANALYTICS" | "BUDGETS" | "HISTORY";

export interface SetupHandoffResponse {
  code: SetupHandoffCode;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

export interface SetupStatusResponse {
  isComplete: boolean;
  currentMonth: string;
  requiredCompletedCount: number;
  requiredTotalCount: number;
  requiredSteps: SetupStepResponse[];
  recommendedSteps: SetupStepResponse[];
  warnings: SetupWarningResponse[];
  handoff: SetupHandoffResponse[];
  activeAccountCount: number;
  activeIncomeCategoryCount: number;
  activeExpenseCategoryCount: number;
  activeRecurringRuleCount: number;
  currentMonthBudgetCount: number;
  hasAppliedImportBatch: boolean;
  hasSnapshot: boolean;
}
