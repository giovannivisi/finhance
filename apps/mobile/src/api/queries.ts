import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  BrokeragePerformanceRange,
  CreateBrokerageBuyRequest,
  CreateBrokerageDividendRequest,
  CreateBrokerageFeeRequest,
  CreateBrokerageSellRequest,
  CreateCategoryBudgetRequest,
  UpdateCategoryBudgetRequest,
  UpdateUserSettingsRequest,
  UpsertAccountRequest,
  UpsertAssetRequest,
  UpsertCategoryBudgetOverrideRequest,
  UpsertCategoryRequest,
  UpsertExpenseValidationRuleRequest,
  UpsertRecurringOccurrenceRequest,
  UpsertRecurringTransactionRuleRequest,
  UpsertTransactionRequest,
} from "@finhance/shared";

import { useApiClient } from "./server-connection";
import {
  api,
  type AnalyticsFilters,
  type TransactionFilters,
} from "./endpoints";

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  setup: ["setup"] as const,
  accountsPage: (includeArchived: boolean) =>
    ["accounts", "page", includeArchived] as const,
  account: (id: string) => ["accounts", "detail", id] as const,
  categories: (includeArchived: boolean) =>
    ["categories", includeArchived] as const,
  transactionsPage: (filters: TransactionFilters) =>
    ["transactions", "page", filters] as const,
  transaction: (id: string) => ["transactions", "detail", id] as const,
  cashflowAnalytics: (filters: AnalyticsFilters) =>
    ["cashflow", "analytics", filters] as const,
  budgets: (month: string) => ["budgets", month] as const,
  budgetOverrides: (id: string) => ["budgets", "overrides", id] as const,
  assets: ["assets"] as const,
  asset: (id: string) => ["assets", "detail", id] as const,
  recurringRules: ["recurring"] as const,
  recurringRule: (id: string) => ["recurring", "detail", id] as const,
  recurringOccurrences: (id: string) =>
    ["recurring", "occurrences", id] as const,
  recurringPending: ["recurring", "pending"] as const,
  monthlyReview: (month: string) => ["monthly-review", month] as const,
  snapshots: ["snapshots"] as const,
  brokerageList: ["brokerage", "list"] as const,
  brokerageWorkspace: (accountId: string) =>
    ["brokerage", "workspace", accountId] as const,
  brokeragePerformance: (accountId: string, range: BrokeragePerformanceRange) =>
    ["brokerage", "performance", accountId, range] as const,
  liveValuations: ["assets", "live-valuations"] as const,
  imports: ["imports"] as const,
  expenseValidation: ["expense-validation"] as const,
  userSettings: ["user", "settings"] as const,
};

type QueryRoot =
  | "dashboard"
  | "setup"
  | "accounts"
  | "categories"
  | "transactions"
  | "cashflow"
  | "budgets"
  | "assets"
  | "recurring"
  | "monthly-review"
  | "snapshots"
  | "brokerage"
  | "imports"
  | "expense-validation";

const TRANSACTION_INVALIDATION_ROOTS = [
  "dashboard",
  "setup",
  "accounts",
  "transactions",
  "cashflow",
  "budgets",
  "assets",
  "recurring",
  "monthly-review",
  "brokerage",
] as const satisfies readonly QueryRoot[];

const ACCOUNT_INVALIDATION_ROOTS = [
  "dashboard",
  "setup",
  "accounts",
  "transactions",
  "cashflow",
  "budgets",
  "assets",
  "recurring",
  "monthly-review",
  "brokerage",
] as const satisfies readonly QueryRoot[];

const CATEGORY_INVALIDATION_ROOTS = [
  "dashboard",
  "setup",
  "categories",
  "transactions",
  "cashflow",
  "budgets",
  "recurring",
  "monthly-review",
  "imports",
  "expense-validation",
] as const satisfies readonly QueryRoot[];

const ASSET_INVALIDATION_ROOTS = [
  "dashboard",
  "setup",
  "accounts",
  "assets",
  "brokerage",
  "snapshots",
] as const satisfies readonly QueryRoot[];

const BUDGET_INVALIDATION_ROOTS = [
  "dashboard",
  "budgets",
  "monthly-review",
] as const satisfies readonly QueryRoot[];

const RECURRING_INVALIDATION_ROOTS = [
  "dashboard",
  "accounts",
  "transactions",
  "cashflow",
  "budgets",
  "assets",
  "recurring",
  "monthly-review",
] as const satisfies readonly QueryRoot[];

const SNAPSHOT_INVALIDATION_ROOTS = [
  "dashboard",
  "snapshots",
] as const satisfies readonly QueryRoot[];

const BROKERAGE_INVALIDATION_ROOTS = [
  "dashboard",
  "setup",
  "accounts",
  "transactions",
  "cashflow",
  "budgets",
  "assets",
  "monthly-review",
  "snapshots",
  "brokerage",
] as const satisfies readonly QueryRoot[];

const EXPENSE_VALIDATION_INVALIDATION_ROOTS = [
  "imports",
  "expense-validation",
] as const satisfies readonly QueryRoot[];

export function useDashboard() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.dashboard.pageData(client),
  });
}

export function useSetupStatus(enabled = true) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.setup,
    queryFn: () => api.setup.status(client),
    enabled,
  });
}

export function useAccountsPage(includeArchived = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.accountsPage(includeArchived),
    queryFn: () => api.accounts.pageData(client, includeArchived),
  });
}

export function useCategories(includeArchived = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.categories(includeArchived),
    queryFn: () => api.categories.list(client, includeArchived),
  });
}

export function useAccountsList(includeArchived = false) {
  const client = useApiClient();
  return useQuery({
    queryKey: ["accounts", "list", includeArchived] as const,
    queryFn: () => api.accounts.list(client, includeArchived),
  });
}

export function useTransaction(id: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.transaction(id ?? "none"),
    queryFn: () => api.transactions.get(client, id ?? ""),
    enabled: Boolean(id),
  });
}

export function useExpenseValidationRules() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.expenseValidation,
    queryFn: () => api.expenseValidation.list(client),
  });
}

export function useImportBatches() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.imports,
    queryFn: () => api.imports.list(client),
  });
}

export function useTransactionsPage(filters: TransactionFilters) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.transactionsPage(filters),
    queryFn: () => api.transactions.pageData(client, filters),
  });
}

export function useCashflowAnalytics(filters: AnalyticsFilters) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.cashflowAnalytics(filters),
    queryFn: () => api.cashflow.analyticsPageData(client, filters),
  });
}

export function useMonthlyBudget(month: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.budgets(month),
    queryFn: () => api.budgets.monthly(client, month),
  });
}

export function useBudgetOverrides(budgetId: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.budgetOverrides(budgetId ?? "none"),
    queryFn: () => api.budgets.overrides(client, budgetId ?? ""),
    enabled: Boolean(budgetId),
  });
}

export function useAssets() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.assets,
    queryFn: () => api.assets.list(client),
  });
}

export function useRecurringRules() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.recurringRules,
    queryFn: () => api.recurring.list(client),
  });
}

export function useRecurringRule(id: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.recurringRule(id ?? "none"),
    queryFn: () => api.recurring.get(client, id ?? ""),
    enabled: Boolean(id),
  });
}

export function useRecurringOccurrences(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.recurringOccurrences(id),
    queryFn: () => api.recurring.occurrences(client, id),
  });
}

export function useRecurringPending() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.recurringPending,
    queryFn: () => api.recurring.hasPending(client),
  });
}

export function useMonthlyReview(month: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.monthlyReview(month),
    queryFn: () => api.monthlyReview.pageData(client, month),
  });
}

export function useSnapshots() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.snapshots,
    queryFn: () => api.snapshots.list(client),
  });
}

export function useBrokerageList() {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.brokerageList,
    queryFn: () => api.brokerage.list(client),
  });
}

export function useBrokerageWorkspace(accountId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.brokerageWorkspace(accountId),
    queryFn: () => api.brokerage.workspace(client, accountId),
  });
}

/**
 * Portfolio performance series for a brokerage account. The 1D range is
 * refetched every 60s while `refetchActive` is true (screen focused and the
 * app is in the foreground); other ranges only refetch on the usual
 * focus/mount triggers. Previous data stays visible while a new range loads.
 */
export function useBrokeragePerformance(
  accountId: string,
  range: BrokeragePerformanceRange,
  refetchActive: boolean,
) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.brokeragePerformance(accountId, range),
    queryFn: () => api.brokerage.performance(client, accountId, range),
    placeholderData: (previousData) => previousData,
    refetchInterval: range === "1D" && refetchActive ? 60_000 : false,
  });
}

/**
 * Live asset valuations, polled every 15s while `enabled` is true (the
 * consuming screen is focused and the app is in the foreground).
 */
export function useLiveValuations(enabled: boolean) {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.liveValuations,
    queryFn: () => api.assets.liveValuations(client),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
    // Live ticks are inherently stale the instant they arrive; always allow
    // a fresh fetch rather than serving a cached snapshot.
    staleTime: 0,
  });
}

export function useUserSettings(): UseQueryResult<
  Awaited<ReturnType<typeof api.user.settings>>
> {
  const client = useApiClient();
  return useQuery({
    queryKey: queryKeys.userSettings,
    queryFn: () => api.user.settings(client),
  });
}

function useInvalidateData(roots: readonly QueryRoot[]) {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all(
      roots.map((root) => queryClient.invalidateQueries({ queryKey: [root] })),
    );
  };
}

export function useCreateTransaction() {
  const client = useApiClient();
  const invalidate = useInvalidateData(TRANSACTION_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: UpsertTransactionRequest) =>
      api.transactions.create(client, body),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const client = useApiClient();
  const invalidate = useInvalidateData(TRANSACTION_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpsertTransactionRequest;
    }) => api.transactions.update(client, id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const client = useApiClient();
  const invalidate = useInvalidateData(TRANSACTION_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.transactions.remove(client, id),
    onSuccess: invalidate,
  });
}

export function useCreateAccount() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ACCOUNT_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: UpsertAccountRequest) =>
      api.accounts.create(client, body),
    onSuccess: invalidate,
  });
}

export function useUpdateAccount() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ACCOUNT_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpsertAccountRequest }) =>
      api.accounts.update(client, id, body),
    onSuccess: invalidate,
  });
}

export function useArchiveAccount() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ACCOUNT_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.accounts.archive(client, id),
    onSuccess: invalidate,
  });
}

export function useUnarchiveAccount() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ACCOUNT_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.accounts.unarchive(client, id),
    onSuccess: invalidate,
  });
}

export function useDeleteAccountPermanently() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ACCOUNT_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.accounts.deletePermanently(client, id),
    onSuccess: invalidate,
  });
}

export function useReconciliationAdjustment() {
  const client = useApiClient();
  const invalidate = useInvalidateData(TRANSACTION_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) =>
      api.accounts.createReconciliationAdjustment(client, id),
    onSuccess: invalidate,
  });
}

export function useEstablishOpeningBalanceBaseline() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ACCOUNT_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) =>
      api.accounts.establishOpeningBalanceBaseline(client, id),
    onSuccess: invalidate,
  });
}

export function useCreateCategory() {
  const client = useApiClient();
  const invalidate = useInvalidateData(CATEGORY_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: UpsertCategoryRequest) =>
      api.categories.create(client, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const client = useApiClient();
  const invalidate = useInvalidateData(CATEGORY_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpsertCategoryRequest }) =>
      api.categories.update(client, id, body),
    onSuccess: invalidate,
  });
}

export function useArchiveCategory() {
  const client = useApiClient();
  const invalidate = useInvalidateData(CATEGORY_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.categories.archive(client, id),
    onSuccess: invalidate,
  });
}

export function useUnarchiveCategory() {
  const client = useApiClient();
  const invalidate = useInvalidateData(CATEGORY_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.categories.unarchive(client, id),
    onSuccess: invalidate,
  });
}

export function useDeleteCategoryPermanently() {
  const client = useApiClient();
  const invalidate = useInvalidateData(CATEGORY_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.categories.deletePermanently(client, id),
    onSuccess: invalidate,
  });
}

export function useCreateAsset() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ASSET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: UpsertAssetRequest) => api.assets.create(client, body),
    onSuccess: invalidate,
  });
}

export function useUpdateAsset() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ASSET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpsertAssetRequest }) =>
      api.assets.update(client, id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteAsset() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ASSET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.assets.remove(client, id),
    onSuccess: invalidate,
  });
}

export function useRefreshAssets() {
  const client = useApiClient();
  const invalidate = useInvalidateData(ASSET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: () => api.assets.refresh(client),
    onSuccess: invalidate,
  });
}

export function useCreateBudget() {
  const client = useApiClient();
  const invalidate = useInvalidateData(BUDGET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: CreateCategoryBudgetRequest) =>
      api.budgets.create(client, body),
    onSuccess: invalidate,
  });
}

export function useUpdateBudget() {
  const client = useApiClient();
  const invalidate = useInvalidateData(BUDGET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateCategoryBudgetRequest;
    }) => api.budgets.update(client, id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteBudget() {
  const client = useApiClient();
  const invalidate = useInvalidateData(BUDGET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({
      id,
      effectiveMonth,
    }: {
      id: string;
      effectiveMonth: string;
    }) => api.budgets.remove(client, id, effectiveMonth),
    onSuccess: invalidate,
  });
}

export function useUpsertBudgetOverride() {
  const client = useApiClient();
  const invalidate = useInvalidateData(BUDGET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({
      id,
      month,
      body,
    }: {
      id: string;
      month: string;
      body: UpsertCategoryBudgetOverrideRequest;
    }) => api.budgets.upsertOverride(client, id, month, body),
    onSuccess: invalidate,
  });
}

export function useClearBudgetOverride() {
  const client = useApiClient();
  const invalidate = useInvalidateData(BUDGET_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({ id, month }: { id: string; month: string }) =>
      api.budgets.clearOverride(client, id, month),
    onSuccess: invalidate,
  });
}

export function useCreateRecurringRule() {
  const client = useApiClient();
  const invalidate = useInvalidateData(RECURRING_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: UpsertRecurringTransactionRuleRequest) =>
      api.recurring.create(client, body),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurringRule() {
  const client = useApiClient();
  const invalidate = useInvalidateData(RECURRING_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpsertRecurringTransactionRuleRequest;
    }) => api.recurring.update(client, id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurringRule() {
  const client = useApiClient();
  const invalidate = useInvalidateData(RECURRING_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.recurring.remove(client, id),
    onSuccess: invalidate,
  });
}

export function useUpsertRecurringOccurrence() {
  const client = useApiClient();
  const invalidate = useInvalidateData(RECURRING_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({
      id,
      month,
      body,
    }: {
      id: string;
      month: string;
      body: UpsertRecurringOccurrenceRequest;
    }) => api.recurring.upsertOccurrence(client, id, month, body),
    onSuccess: invalidate,
  });
}

export function useClearRecurringOccurrence() {
  const client = useApiClient();
  const invalidate = useInvalidateData(RECURRING_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({ id, month }: { id: string; month: string }) =>
      api.recurring.clearOccurrence(client, id, month),
    onSuccess: invalidate,
  });
}

export function useMaterializeRecurring() {
  const client = useApiClient();
  const invalidate = useInvalidateData(RECURRING_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: () => api.recurring.materialize(client),
    onSuccess: invalidate,
  });
}

export function useCaptureSnapshot() {
  const client = useApiClient();
  const invalidate = useInvalidateData(SNAPSHOT_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: () => api.snapshots.capture(client),
    onSuccess: invalidate,
  });
}

export function useBrokerageBuy(accountId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateData(BROKERAGE_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: CreateBrokerageBuyRequest) =>
      api.brokerage.buy(client, accountId, body),
    onSuccess: invalidate,
  });
}

export function useBrokerageSell(accountId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateData(BROKERAGE_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: CreateBrokerageSellRequest) =>
      api.brokerage.sell(client, accountId, body),
    onSuccess: invalidate,
  });
}

export function useBrokerageDividend(accountId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateData(BROKERAGE_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: CreateBrokerageDividendRequest) =>
      api.brokerage.dividend(client, accountId, body),
    onSuccess: invalidate,
  });
}

export function useBrokerageFee(accountId: string) {
  const client = useApiClient();
  const invalidate = useInvalidateData(BROKERAGE_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: CreateBrokerageFeeRequest) =>
      api.brokerage.fee(client, accountId, body),
    onSuccess: invalidate,
  });
}

export function useCreateExpenseValidationRule() {
  const client = useApiClient();
  const invalidate = useInvalidateData(EXPENSE_VALIDATION_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (body: UpsertExpenseValidationRuleRequest) =>
      api.expenseValidation.create(client, body),
    onSuccess: invalidate,
  });
}

export function useUpdateExpenseValidationRule() {
  const client = useApiClient();
  const invalidate = useInvalidateData(EXPENSE_VALIDATION_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpsertExpenseValidationRuleRequest;
    }) => api.expenseValidation.update(client, id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteExpenseValidationRule() {
  const client = useApiClient();
  const invalidate = useInvalidateData(EXPENSE_VALIDATION_INVALIDATION_ROOTS);
  return useMutation({
    mutationFn: (id: string) => api.expenseValidation.remove(client, id),
    onSuccess: invalidate,
  });
}

export function useUpdateUserSettings() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateUserSettingsRequest) =>
      api.user.updateSettings(client, body),
    onSuccess: async () => {
      // Reporting currency changes affect almost every aggregate.
      await queryClient.invalidateQueries();
    },
  });
}
