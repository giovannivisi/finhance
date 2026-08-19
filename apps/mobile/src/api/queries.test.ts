/* eslint-disable import/first -- Vitest mocks must be declared before imports. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn((options: unknown) => options),
  useQuery: vi.fn((options: unknown) => options),
  useQueryClient: vi.fn(),
}));

vi.mock("./server-connection", () => ({
  useApiClient: vi.fn(),
  useServerConnection: vi.fn(),
}));

vi.mock("./passkeys", () => ({
  deleteConnectedAccount: vi.fn().mockResolvedValue(undefined),
  deleteMobileAccount: vi.fn().mockResolvedValue(undefined),
  deletePasskey: vi.fn().mockResolvedValue(undefined),
  getMobileAccount: vi.fn().mockResolvedValue({ id: "user-1" }),
  linkConnectedAccount: vi.fn().mockResolvedValue({}),
  listPasskeys: vi.fn().mockResolvedValue([]),
  registerPasskey: vi.fn().mockResolvedValue({ id: "passkey-1" }),
}));

import { useQueryClient } from "@tanstack/react-query";

import type { ApiClient } from "./client";
import {
  deleteConnectedAccount,
  deleteMobileAccount,
  deletePasskey,
  getMobileAccount,
  linkConnectedAccount,
  listPasskeys,
  registerPasskey,
} from "./passkeys";
import * as queries from "./queries";
import { useApiClient, useServerConnection } from "./server-connection";

type QueryDefinition = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
  staleTime?: number;
  placeholderData?: (previousData: unknown) => unknown;
};

type MutationDefinition = {
  mutationFn: (input?: unknown) => Promise<unknown>;
  onSuccess?: () => Promise<unknown>;
};

function asQuery(value: unknown): QueryDefinition {
  return value as QueryDefinition;
}

function asMutation(value: unknown): MutationDefinition {
  return value as MutationDefinition;
}

describe("mobile query contracts", () => {
  const request = vi.fn().mockResolvedValue({});
  const client = {
    baseUrl: "http://finhance.test",
    request,
  } as unknown as ApiClient;
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  const refreshHostedAccessToken = vi.fn().mockResolvedValue("fresh-token");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiClient).mockReturnValue(client);
    vi.mocked(useServerConnection).mockReturnValue({
      serverUrl: "https://finhance.test",
      serverMode: "hosted",
      token: "access-token",
      refreshHostedAccessToken,
    } as unknown as ReturnType<typeof useServerConnection>);
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries,
    } as unknown as ReturnType<typeof useQueryClient>);
  });

  it("defines stable query keys for every resource scope", () => {
    expect(queries.queryKeys.dashboard).toEqual(["dashboard"]);
    expect(queries.queryKeys.setup).toEqual(["setup"]);
    expect(queries.queryKeys.accountsPage(true)).toEqual([
      "accounts",
      "page",
      true,
    ]);
    expect(queries.queryKeys.account("account-1")).toEqual([
      "accounts",
      "detail",
      "account-1",
    ]);
    expect(queries.queryKeys.categories(false)).toEqual(["categories", false]);
    expect(
      queries.queryKeys.transactionsPage({ accountId: "account-1" }),
    ).toEqual(["transactions", "page", { accountId: "account-1" }]);
    expect(queries.queryKeys.transaction("transaction-1")).toEqual([
      "transactions",
      "detail",
      "transaction-1",
    ]);
    expect(queries.queryKeys.cashflowAnalytics({})).toEqual([
      "cashflow",
      "analytics",
      {},
    ]);
    expect(queries.queryKeys.budgets("2026-08")).toEqual([
      "budgets",
      "2026-08",
    ]);
    expect(queries.queryKeys.budgetOverrides("budget-1")).toEqual([
      "budgets",
      "overrides",
      "budget-1",
    ]);
    expect(queries.queryKeys.assets).toEqual(["assets"]);
    expect(queries.queryKeys.asset("asset-1")).toEqual([
      "assets",
      "detail",
      "asset-1",
    ]);
    expect(queries.queryKeys.recurringRules).toEqual(["recurring"]);
    expect(queries.queryKeys.recurringRule("rule-1")).toEqual([
      "recurring",
      "detail",
      "rule-1",
    ]);
    expect(queries.queryKeys.recurringOccurrences("rule-1")).toEqual([
      "recurring",
      "occurrences",
      "rule-1",
    ]);
    expect(queries.queryKeys.recurringPending).toEqual([
      "recurring",
      "pending",
    ]);
    expect(queries.queryKeys.monthlyReview("2026-08")).toEqual([
      "monthly-review",
      "2026-08",
    ]);
    expect(queries.queryKeys.snapshots).toEqual(["snapshots"]);
    expect(queries.queryKeys.brokerageList).toEqual(["brokerage", "list"]);
    expect(queries.queryKeys.brokerageWorkspace("brokerage-1")).toEqual([
      "brokerage",
      "workspace",
      "brokerage-1",
    ]);
    expect(
      queries.queryKeys.brokeragePerformance("brokerage-1", "MAX"),
    ).toEqual(["brokerage", "performance", "brokerage-1", "MAX"]);
    expect(queries.queryKeys.liveValuations).toEqual([
      "assets",
      "live-valuations",
    ]);
    expect(queries.queryKeys.imports).toEqual(["imports"]);
    expect(queries.queryKeys.expenseValidation).toEqual(["expense-validation"]);
    expect(queries.queryKeys.userSettings).toEqual(["user", "settings"]);
    expect(queries.queryKeys.mobileAccount).toEqual(["mobile", "account"]);
    expect(queries.queryKeys.mobilePasskeys).toEqual(["mobile", "passkeys"]);
  });

  it("configures all financial reads with their API query and availability guards", async () => {
    const cases: [QueryDefinition, readonly unknown[], boolean?][] = [
      [asQuery(queries.useDashboard()), ["dashboard"]],
      [asQuery(queries.useSetupStatus(false)), ["setup"], false],
      [asQuery(queries.useAccountsPage(true)), ["accounts", "page", true]],
      [asQuery(queries.useCategories(true)), ["categories", true]],
      [asQuery(queries.useAccountsList(true)), ["accounts", "list", true]],
      [
        asQuery(queries.useTransaction("transaction-1")),
        ["transactions", "detail", "transaction-1"],
        true,
      ],
      [
        asQuery(queries.useTransaction(null)),
        ["transactions", "detail", "none"],
        false,
      ],
      [asQuery(queries.useExpenseValidationRules()), ["expense-validation"]],
      [asQuery(queries.useImportBatches()), ["imports"]],
      [
        asQuery(queries.useTransactionsPage({ accountId: "account-1" })),
        ["transactions", "page", { accountId: "account-1" }],
      ],
      [
        asQuery(queries.useCashflowAnalytics({ categoryId: "category-1" })),
        ["cashflow", "analytics", { categoryId: "category-1" }],
      ],
      [asQuery(queries.useMonthlyBudget("2026-08")), ["budgets", "2026-08"]],
      [
        asQuery(queries.useBudgetOverrides("budget-1")),
        ["budgets", "overrides", "budget-1"],
        true,
      ],
      [
        asQuery(queries.useBudgetOverrides(null)),
        ["budgets", "overrides", "none"],
        false,
      ],
      [asQuery(queries.useAssets()), ["assets"]],
      [asQuery(queries.useRecurringRules()), ["recurring"]],
      [
        asQuery(queries.useRecurringRule("rule-1")),
        ["recurring", "detail", "rule-1"],
        true,
      ],
      [
        asQuery(queries.useRecurringRule(null)),
        ["recurring", "detail", "none"],
        false,
      ],
      [
        asQuery(queries.useRecurringOccurrences("rule-1")),
        ["recurring", "occurrences", "rule-1"],
      ],
      [asQuery(queries.useRecurringPending()), ["recurring", "pending"]],
      [
        asQuery(queries.useMonthlyReview("2026-08")),
        ["monthly-review", "2026-08"],
      ],
      [asQuery(queries.useSnapshots()), ["snapshots"]],
      [asQuery(queries.useBrokerageList()), ["brokerage", "list"]],
      [
        asQuery(queries.useBrokerageWorkspace("brokerage-1")),
        ["brokerage", "workspace", "brokerage-1"],
      ],
      [
        asQuery(queries.useBrokeragePerformance("brokerage-1", "MAX")),
        ["brokerage", "performance", "brokerage-1", "MAX"],
      ],
      [
        asQuery(queries.useLiveValuations(true)),
        ["assets", "live-valuations"],
        true,
      ],
      [asQuery(queries.useUserSettings()), ["user", "settings"]],
    ];

    for (const [definition, queryKey, enabled] of cases) {
      expect(definition.queryKey).toEqual(queryKey);
      if (enabled !== undefined) {
        expect(definition.enabled).toBe(enabled);
      }
      await definition.queryFn();
    }

    const performance = asQuery(
      queries.useBrokeragePerformance("brokerage-1", "1D"),
    );
    expect(performance.placeholderData?.({ value: 1 })).toEqual({ value: 1 });
    const valuations = asQuery(queries.useLiveValuations(false));
    expect(valuations.enabled).toBe(false);
    expect(valuations.staleTime).toBe(60_000);
  });

  it("routes every financial mutation and invalidates all dependent query roots", async () => {
    const body = { value: 1 } as never;
    const calls: [() => MutationDefinition, unknown][] = [
      [() => asMutation(queries.useCreateTransaction()), body],
      [() => asMutation(queries.useTransactionDraft()), body],
      [
        () => asMutation(queries.useUpdateTransaction()),
        { id: "transaction-1", body },
      ],
      [() => asMutation(queries.useDeleteTransaction()), "transaction-1"],
      [() => asMutation(queries.useCreateAccount()), body],
      [() => asMutation(queries.useUpdateAccount()), { id: "account-1", body }],
      [() => asMutation(queries.useArchiveAccount()), "account-1"],
      [() => asMutation(queries.useUnarchiveAccount()), "account-1"],
      [() => asMutation(queries.useDeleteAccountPermanently()), "account-1"],
      [() => asMutation(queries.useReconciliationAdjustment()), "account-1"],
      [
        () => asMutation(queries.useEstablishOpeningBalanceBaseline()),
        "account-1",
      ],
      [() => asMutation(queries.useCreateCategory()), body],
      [
        () => asMutation(queries.useUpdateCategory()),
        { id: "category-1", body },
      ],
      [() => asMutation(queries.useArchiveCategory()), "category-1"],
      [() => asMutation(queries.useUnarchiveCategory()), "category-1"],
      [() => asMutation(queries.useDeleteCategoryPermanently()), "category-1"],
      [() => asMutation(queries.useCreateAsset()), body],
      [() => asMutation(queries.useUpdateAsset()), { id: "asset-1", body }],
      [() => asMutation(queries.useDeleteAsset()), "asset-1"],
      [() => asMutation(queries.useRefreshAssets()), undefined],
      [() => asMutation(queries.useCreateBudget()), body],
      [() => asMutation(queries.useUpdateBudget()), { id: "budget-1", body }],
      [
        () => asMutation(queries.useDeleteBudget()),
        { id: "budget-1", effectiveMonth: "2026-08" },
      ],
      [
        () => asMutation(queries.useUpsertBudgetOverride()),
        { id: "budget-1", month: "2026-08", body },
      ],
      [
        () => asMutation(queries.useClearBudgetOverride()),
        { id: "budget-1", month: "2026-08" },
      ],
      [() => asMutation(queries.useCreateRecurringRule()), body],
      [
        () => asMutation(queries.useUpdateRecurringRule()),
        { id: "rule-1", body },
      ],
      [() => asMutation(queries.useDeleteRecurringRule()), "rule-1"],
      [
        () => asMutation(queries.useUpsertRecurringOccurrence()),
        { id: "rule-1", month: "2026-08", body },
      ],
      [
        () => asMutation(queries.useClearRecurringOccurrence()),
        { id: "rule-1", month: "2026-08" },
      ],
      [() => asMutation(queries.useMaterializeRecurring()), undefined],
      [() => asMutation(queries.useCaptureSnapshot()), undefined],
      [() => asMutation(queries.useBrokerageBuy("brokerage-1")), body],
      [() => asMutation(queries.useBrokerageSell("brokerage-1")), body],
      [() => asMutation(queries.useBrokerageDividend("brokerage-1")), body],
      [() => asMutation(queries.useBrokerageFee("brokerage-1")), body],
      [
        () => asMutation(queries.useUpdateBrokerageTrade("brokerage-1")),
        { operationId: "operation-1", body },
      ],
      [
        () => asMutation(queries.useDeleteBrokerageTrade("brokerage-1")),
        "operation-1",
      ],
      [() => asMutation(queries.useUpdatePortfolioAllocationTargets()), body],
      [() => asMutation(queries.useCreateExpenseValidationRule()), body],
      [
        () => asMutation(queries.useUpdateExpenseValidationRule()),
        { id: "validation-1", body },
      ],
      [
        () => asMutation(queries.useDeleteExpenseValidationRule()),
        "validation-1",
      ],
      [() => asMutation(queries.useUpdateUserSettings()), body],
    ];

    for (const [createMutation, input] of calls) {
      const mutation = createMutation();
      await mutation.mutationFn(input);
      await mutation.onSuccess?.();
    }

    expect(request).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["brokerage"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["assets"] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["transactions"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith();
  });

  it("uses hosted account credentials and invalidates only the affected mobile identity data", async () => {
    const account = asQuery(queries.useMobileAccount());
    const passkeys = asQuery(queries.useMobilePasskeys());

    expect(account.enabled).toBe(true);
    expect(passkeys.enabled).toBe(true);
    await account.queryFn();
    await passkeys.queryFn();
    expect(getMobileAccount).toHaveBeenCalledWith(
      "https://finhance.test",
      "access-token",
      refreshHostedAccessToken,
    );
    expect(listPasskeys).toHaveBeenCalledWith(
      "https://finhance.test",
      "access-token",
      refreshHostedAccessToken,
    );

    const register = asMutation(queries.useRegisterMobilePasskey());
    await register.mutationFn();
    await register.mutationFn({ tokenOverride: "override-token" });
    await register.onSuccess?.();
    expect(registerPasskey).toHaveBeenNthCalledWith(
      1,
      "https://finhance.test",
      "access-token",
      refreshHostedAccessToken,
    );
    expect(registerPasskey).toHaveBeenNthCalledWith(
      2,
      "https://finhance.test",
      "override-token",
      undefined,
    );

    const removePasskey = asMutation(queries.useDeleteMobilePasskey());
    await removePasskey.mutationFn({ credentialId: "passkey-1" });
    await removePasskey.onSuccess?.();
    const linkAccount = asMutation(queries.useLinkMobileConnectedAccount());
    await linkAccount.mutationFn({
      provider: "GOOGLE",
      tokenOverride: "override-token",
    });
    await linkAccount.onSuccess?.();
    const removeConnected = asMutation(
      queries.useDeleteMobileConnectedAccount(),
    );
    await removeConnected.mutationFn({ accountId: "connected-1" });
    await removeConnected.onSuccess?.();
    const removeAccount = asMutation(queries.useDeleteMobileAccount());
    await removeAccount.mutationFn({
      email: "owner@example.com",
      tokenOverride: "override-token",
    });

    expect(deletePasskey).toHaveBeenCalledWith(
      "https://finhance.test",
      "access-token",
      "passkey-1",
      refreshHostedAccessToken,
    );
    expect(linkConnectedAccount).toHaveBeenCalledWith(
      "https://finhance.test",
      "override-token",
      "GOOGLE",
      undefined,
    );
    expect(deleteConnectedAccount).toHaveBeenCalledWith(
      "https://finhance.test",
      "access-token",
      "connected-1",
      refreshHostedAccessToken,
    );
    expect(deleteMobileAccount).toHaveBeenCalledWith(
      "https://finhance.test",
      "override-token",
      "owner@example.com",
      undefined,
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queries.queryKeys.mobilePasskeys,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queries.queryKeys.mobileAccount,
    });
  });
});
