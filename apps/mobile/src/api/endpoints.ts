import type {
  AccountResponse,
  AccountsPageDataResponse,
  AccountReconciliationResponse,
  AssetResponse,
  BrokerageAccountSummaryResponse,
  BrokerageWorkspaceResponse,
  CashflowAnalyticsPageDataResponse,
  CategoryBudgetOverrideResponse,
  CategoryBudgetResponse,
  CategoryResponse,
  BrokerageOperationResponse,
  CreateBrokerageBuyRequest,
  CreateBrokerageDividendRequest,
  CreateBrokerageFeeRequest,
  CreateBrokerageSellRequest,
  CreateCategoryBudgetRequest,
  DashboardPageDataResponse,
  DashboardResponse,
  ExpenseValidationRuleResponse,
  MaterializeRecurringRulesResponse,
  MonthlyBudgetResponse,
  MonthlyCashflowResponse,
  MonthlyReviewPageDataResponse,
  NetWorthSnapshotResponse,
  RecurringOccurrenceResponse,
  RecurringPendingStatusResponse,
  RecurringTransactionRuleResponse,
  RefreshAssetsResponse,
  SetupStatusResponse,
  SnapshotCaptureResponse,
  TransactionResponse,
  TransactionsPageDataResponse,
  UpdateCategoryBudgetRequest,
  UpdateUserSettingsRequest,
  UpsertAccountRequest,
  UpsertAssetRequest,
  UpsertCategoryBudgetOverrideRequest,
  UpsertCategoryRequest,
  UpsertRecurringOccurrenceRequest,
  UpsertRecurringTransactionRuleRequest,
  UpsertTransactionRequest,
  UserSettingsResponse,
} from "@finhance/shared";

import {
  generateIdempotencyKey,
  type ApiClient,
  type RequestOptions,
} from "./client";

export interface HealthStatusResponse {
  status: "ok";
  service: "api";
  authMode: "local" | "hosted";
  timestamp: string;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  primaryCategoryId?: string;
  secondaryCategoryId?: string;
  kind?: string;
  includeArchivedAccounts?: boolean;
  limit?: number;
  offset?: number;
}

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  primaryCategoryId?: string;
  secondaryCategoryId?: string;
  includeArchivedAccounts?: boolean;
}

function mutation(
  method: NonNullable<RequestOptions["method"]>,
  body?: unknown,
): RequestOptions {
  return {
    method,
    body,
    idempotencyKey: generateIdempotencyKey(),
  };
}

export const api = {
  health: (client: ApiClient) =>
    client.request<HealthStatusResponse>("/health", { timeoutMs: 8000 }),

  dashboard: {
    get: (client: ApiClient) => client.request<DashboardResponse>("/dashboard"),
    pageData: (client: ApiClient) =>
      client.request<DashboardPageDataResponse>("/dashboard/page-data"),
  },

  setup: {
    status: (client: ApiClient, includeWarnings = true) =>
      client.request<SetupStatusResponse>("/setup/status", {
        query: { includeWarnings },
      }),
  },

  accounts: {
    list: (client: ApiClient, includeArchived = false) =>
      client.request<AccountResponse[]>("/accounts", {
        query: { includeArchived },
      }),
    pageData: (client: ApiClient, includeArchived = false) =>
      client.request<AccountsPageDataResponse>("/accounts/page-data", {
        query: { includeArchived },
      }),
    reconciliation: (client: ApiClient, includeArchived = false) =>
      client.request<AccountReconciliationResponse[]>(
        "/accounts/reconciliation",
        { query: { includeArchived } },
      ),
    get: (client: ApiClient, id: string) =>
      client.request<AccountResponse>(`/accounts/${id}`),
    create: (client: ApiClient, body: UpsertAccountRequest) =>
      client.request<AccountResponse>("/accounts", mutation("POST", body)),
    update: (client: ApiClient, id: string, body: UpsertAccountRequest) =>
      client.request<AccountResponse>(`/accounts/${id}`, mutation("PUT", body)),
    archive: (client: ApiClient, id: string) =>
      client.request<void>(`/accounts/${id}`, mutation("DELETE")),
    unarchive: (client: ApiClient, id: string) =>
      client.request<AccountResponse>(
        `/accounts/${id}/unarchive`,
        mutation("POST"),
      ),
    deletePermanently: (client: ApiClient, id: string) =>
      client.request<void>(`/accounts/${id}/permanent`, mutation("DELETE")),
    createReconciliationAdjustment: (client: ApiClient, id: string) =>
      client.request<TransactionResponse>(
        `/accounts/${id}/reconciliation/adjust`,
        mutation("POST"),
      ),
    establishOpeningBalanceBaseline: (client: ApiClient, id: string) =>
      client.request<AccountResponse>(
        `/accounts/${id}/opening-balance-baseline`,
        mutation("POST"),
      ),
  },

  categories: {
    list: (client: ApiClient, includeArchived = false) =>
      client.request<CategoryResponse[]>("/categories", {
        query: { includeArchived },
      }),
    create: (client: ApiClient, body: UpsertCategoryRequest) =>
      client.request<CategoryResponse>("/categories", mutation("POST", body)),
    update: (client: ApiClient, id: string, body: UpsertCategoryRequest) =>
      client.request<CategoryResponse>(
        `/categories/${id}`,
        mutation("PUT", body),
      ),
    archive: (client: ApiClient, id: string) =>
      client.request<void>(`/categories/${id}`, mutation("DELETE")),
    unarchive: (client: ApiClient, id: string) =>
      client.request<CategoryResponse>(
        `/categories/${id}/unarchive`,
        mutation("POST"),
      ),
    deletePermanently: (client: ApiClient, id: string) =>
      client.request<void>(`/categories/${id}/permanent`, mutation("DELETE")),
  },

  transactions: {
    list: (client: ApiClient, filters: TransactionFilters = {}) =>
      client.request<TransactionResponse[]>("/transactions", {
        query: { ...filters },
      }),
    pageData: (client: ApiClient, filters: TransactionFilters = {}) =>
      client.request<TransactionsPageDataResponse>("/transactions/page-data", {
        query: { ...filters },
      }),
    get: (client: ApiClient, id: string) =>
      client.request<TransactionResponse>(`/transactions/${id}`),
    create: (client: ApiClient, body: UpsertTransactionRequest) =>
      client.request<TransactionResponse>(
        "/transactions",
        mutation("POST", body),
      ),
    update: (client: ApiClient, id: string, body: UpsertTransactionRequest) =>
      client.request<TransactionResponse>(
        `/transactions/${id}`,
        mutation("PUT", body),
      ),
    remove: (client: ApiClient, id: string) =>
      client.request<void>(`/transactions/${id}`, mutation("DELETE")),
  },

  cashflow: {
    monthly: (client: ApiClient, filters: AnalyticsFilters = {}) =>
      client.request<MonthlyCashflowResponse>("/cashflow/monthly", {
        query: { ...filters },
      }),
    analyticsPageData: (client: ApiClient, filters: AnalyticsFilters = {}) =>
      client.request<CashflowAnalyticsPageDataResponse>("/cashflow/page-data", {
        query: { ...filters },
      }),
  },

  assets: {
    list: (client: ApiClient) => client.request<AssetResponse[]>("/assets"),
    get: (client: ApiClient, id: string) =>
      client.request<AssetResponse>(`/assets/${id}`),
    create: (client: ApiClient, body: UpsertAssetRequest) =>
      client.request<AssetResponse>("/assets", mutation("POST", body)),
    update: (client: ApiClient, id: string, body: UpsertAssetRequest) =>
      client.request<AssetResponse>(`/assets/${id}`, mutation("PUT", body)),
    remove: (client: ApiClient, id: string) =>
      client.request<void>(`/assets/${id}`, mutation("DELETE")),
    refresh: (client: ApiClient) =>
      client.request<RefreshAssetsResponse>(
        "/assets/refresh",
        mutation("POST"),
      ),
  },

  budgets: {
    monthly: (
      client: ApiClient,
      month: string,
      includeArchivedCategories = false,
    ) =>
      client.request<MonthlyBudgetResponse>("/budgets", {
        query: { month, includeArchivedCategories },
      }),
    create: (client: ApiClient, body: CreateCategoryBudgetRequest) =>
      client.request<CategoryBudgetResponse>(
        "/budgets",
        mutation("POST", body),
      ),
    update: (
      client: ApiClient,
      id: string,
      body: UpdateCategoryBudgetRequest,
    ) =>
      client.request<CategoryBudgetResponse>(
        `/budgets/${id}`,
        mutation("PUT", body),
      ),
    remove: (client: ApiClient, id: string, effectiveMonth: string) =>
      client.request<void>(`/budgets/${id}`, {
        ...mutation("DELETE"),
        query: { effectiveMonth },
      }),
    overrides: (client: ApiClient, id: string) =>
      client.request<CategoryBudgetOverrideResponse[]>(
        `/budgets/${id}/overrides`,
      ),
    upsertOverride: (
      client: ApiClient,
      id: string,
      month: string,
      body: UpsertCategoryBudgetOverrideRequest,
    ) =>
      client.request<CategoryBudgetOverrideResponse>(
        `/budgets/${id}/overrides/${month}`,
        mutation("PUT", body),
      ),
    clearOverride: (client: ApiClient, id: string, month: string) =>
      client.request<void>(
        `/budgets/${id}/overrides/${month}`,
        mutation("DELETE"),
      ),
  },

  recurring: {
    list: (client: ApiClient) =>
      client.request<RecurringTransactionRuleResponse[]>("/recurring-rules"),
    get: (client: ApiClient, id: string) =>
      client.request<RecurringTransactionRuleResponse>(
        `/recurring-rules/${id}`,
      ),
    occurrences: (client: ApiClient, id: string) =>
      client.request<RecurringOccurrenceResponse[]>(
        `/recurring-rules/${id}/occurrences`,
      ),
    hasPending: (client: ApiClient) =>
      client.request<RecurringPendingStatusResponse>(
        "/recurring-rules/has-pending",
      ),
    create: (client: ApiClient, body: UpsertRecurringTransactionRuleRequest) =>
      client.request<RecurringTransactionRuleResponse>(
        "/recurring-rules",
        mutation("POST", body),
      ),
    update: (
      client: ApiClient,
      id: string,
      body: UpsertRecurringTransactionRuleRequest,
    ) =>
      client.request<RecurringTransactionRuleResponse>(
        `/recurring-rules/${id}`,
        mutation("PUT", body),
      ),
    remove: (client: ApiClient, id: string) =>
      client.request<void>(`/recurring-rules/${id}`, mutation("DELETE")),
    upsertOccurrence: (
      client: ApiClient,
      id: string,
      month: string,
      body: UpsertRecurringOccurrenceRequest,
    ) =>
      client.request<RecurringOccurrenceResponse>(
        `/recurring-rules/${id}/occurrences/${month}`,
        mutation("PUT", body),
      ),
    clearOccurrence: (client: ApiClient, id: string, month: string) =>
      client.request<void>(
        `/recurring-rules/${id}/occurrences/${month}`,
        mutation("DELETE"),
      ),
    materialize: (client: ApiClient) =>
      client.request<MaterializeRecurringRulesResponse>(
        "/recurring-rules/materialize",
        mutation("POST"),
      ),
  },

  monthlyReview: {
    pageData: (client: ApiClient, month: string) =>
      client.request<MonthlyReviewPageDataResponse>(
        "/monthly-review/page-data",
        { query: { month } },
      ),
  },

  snapshots: {
    list: (client: ApiClient) =>
      client.request<NetWorthSnapshotResponse[]>("/snapshots"),
    capture: (client: ApiClient) =>
      client.request<SnapshotCaptureResponse>(
        "/snapshots/capture",
        mutation("POST"),
      ),
  },

  brokerage: {
    list: (client: ApiClient) =>
      client.request<BrokerageAccountSummaryResponse[]>("/brokerage"),
    workspace: (client: ApiClient, accountId: string) =>
      client.request<BrokerageWorkspaceResponse>(`/brokerage/${accountId}`),
    buy: (
      client: ApiClient,
      accountId: string,
      body: CreateBrokerageBuyRequest,
    ) =>
      client.request<BrokerageOperationResponse>(
        `/brokerage/${accountId}/buy`,
        mutation("POST", body),
      ),
    sell: (
      client: ApiClient,
      accountId: string,
      body: CreateBrokerageSellRequest,
    ) =>
      client.request<BrokerageOperationResponse>(
        `/brokerage/${accountId}/sell`,
        mutation("POST", body),
      ),
    dividend: (
      client: ApiClient,
      accountId: string,
      body: CreateBrokerageDividendRequest,
    ) =>
      client.request<BrokerageOperationResponse>(
        `/brokerage/${accountId}/dividend`,
        mutation("POST", body),
      ),
    fee: (
      client: ApiClient,
      accountId: string,
      body: CreateBrokerageFeeRequest,
    ) =>
      client.request<BrokerageOperationResponse>(
        `/brokerage/${accountId}/fee`,
        mutation("POST", body),
      ),
  },

  expenseValidation: {
    list: (client: ApiClient) =>
      client.request<ExpenseValidationRuleResponse[]>("/expense-validation"),
  },

  user: {
    settings: (client: ApiClient) =>
      client.request<UserSettingsResponse>("/users/me/settings"),
    updateSettings: (client: ApiClient, body: UpdateUserSettingsRequest) =>
      client.request<UserSettingsResponse>(
        "/users/me/settings",
        mutation("PATCH", body),
      ),
  },
};
