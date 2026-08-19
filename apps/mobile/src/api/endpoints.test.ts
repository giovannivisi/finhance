import { describe, expect, it, vi } from "vitest";

import type { ApiClient } from "./client";
import { api } from "./endpoints";

const idempotent = (method: string, body?: unknown) =>
  expect.objectContaining({
    method,
    ...(body === undefined ? {} : { body }),
    idempotencyKey: expect.any(String),
  });

const idempotentWithQuery = (
  method: string,
  query: Record<string, string>,
  body?: unknown,
) =>
  expect.objectContaining({
    method,
    ...(body === undefined ? {} : { body }),
    query,
    idempotencyKey: expect.any(String),
  });

function createClient() {
  const request = vi.fn().mockResolvedValue({});

  return {
    request,
    client: {
      baseUrl: "http://finhance.test",
      request,
    } as unknown as ApiClient,
  };
}

async function expectRequest(
  request: ReturnType<typeof vi.fn>,
  invoke: () => Promise<unknown>,
  path: string,
  options?: unknown,
) {
  await invoke();

  if (options === undefined) {
    expect(request).toHaveBeenLastCalledWith(path);
    return;
  }

  expect(request).toHaveBeenLastCalledWith(path, options);
}

describe("mobile API endpoints", () => {
  it("builds every read-only endpoint with its expected route and query", async () => {
    const { client, request } = createClient();

    await expectRequest(request, () => api.health(client), "/health", {
      timeoutMs: 8000,
    });
    await expectRequest(request, () => api.dashboard.get(client), "/dashboard");
    await expectRequest(
      request,
      () => api.dashboard.pageData(client),
      "/dashboard/page-data",
    );
    await expectRequest(
      request,
      () => api.setup.status(client),
      "/setup/status",
      { query: { includeWarnings: true } },
    );
    await expectRequest(
      request,
      () => api.setup.status(client, false),
      "/setup/status",
      { query: { includeWarnings: false } },
    );

    await expectRequest(request, () => api.accounts.list(client), "/accounts", {
      query: { includeArchived: false },
    });
    await expectRequest(
      request,
      () => api.accounts.pageData(client, true),
      "/accounts/page-data",
      { query: { includeArchived: true } },
    );
    await expectRequest(
      request,
      () => api.accounts.reconciliation(client, true),
      "/accounts/reconciliation",
      { query: { includeArchived: true } },
    );
    await expectRequest(
      request,
      () => api.accounts.get(client, "account-1"),
      "/accounts/account-1",
    );

    await expectRequest(
      request,
      () => api.categories.list(client),
      "/categories",
      { query: { includeArchived: false } },
    );
    await expectRequest(
      request,
      () => api.transactions.list(client, { from: "2026-08-01", limit: 50 }),
      "/transactions",
      { query: { from: "2026-08-01", limit: 50 } },
    );
    await expectRequest(
      request,
      () => api.transactions.pageData(client),
      "/transactions/page-data",
      { query: {} },
    );
    await expectRequest(
      request,
      () => api.transactions.get(client, "transaction-1"),
      "/transactions/transaction-1",
    );
    await expectRequest(
      request,
      () => api.cashflow.monthly(client),
      "/cashflow/monthly",
      { query: {} },
    );
    await expectRequest(
      request,
      () => api.cashflow.analyticsPageData(client, { accountId: "account-1" }),
      "/cashflow/page-data",
      { query: { accountId: "account-1" } },
    );

    await expectRequest(request, () => api.assets.list(client), "/assets");
    await expectRequest(
      request,
      () => api.assets.get(client, "asset-1"),
      "/assets/asset-1",
    );
    await expectRequest(
      request,
      () => api.assets.liveValuations(client),
      "/assets/live-valuations",
    );
    await expectRequest(
      request,
      () => api.budgets.monthly(client, "2026-08"),
      "/budgets",
      { query: { month: "2026-08", includeArchivedCategories: false } },
    );
    await expectRequest(
      request,
      () => api.budgets.overrides(client, "budget-1"),
      "/budgets/budget-1/overrides",
    );

    await expectRequest(
      request,
      () => api.recurring.list(client),
      "/recurring-rules",
    );
    await expectRequest(
      request,
      () => api.recurring.get(client, "rule-1"),
      "/recurring-rules/rule-1",
    );
    await expectRequest(
      request,
      () => api.recurring.occurrences(client, "rule-1"),
      "/recurring-rules/rule-1/occurrences",
    );
    await expectRequest(
      request,
      () => api.recurring.hasPending(client),
      "/recurring-rules/has-pending",
    );
    await expectRequest(
      request,
      () => api.monthlyReview.pageData(client, "2026-08"),
      "/monthly-review/page-data",
      { query: { month: "2026-08" } },
    );
    await expectRequest(
      request,
      () => api.snapshots.list(client),
      "/snapshots",
    );

    await expectRequest(
      request,
      () => api.brokerage.list(client),
      "/brokerage",
    );
    await expectRequest(
      request,
      () => api.brokerage.workspace(client, "brokerage-1"),
      "/brokerage/brokerage-1",
    );
    await expectRequest(
      request,
      () => api.brokerage.performance(client, "brokerage-1", "MAX"),
      "/brokerage/brokerage-1/performance",
      { query: { range: "MAX" } },
    );
    await expectRequest(request, () => api.imports.list(client), "/imports");
    await expectRequest(
      request,
      () => api.expenseValidation.list(client),
      "/expense-validation",
    );
    await expectRequest(
      request,
      () => api.user.settings(client),
      "/users/me/settings",
    );
  });

  it("uses idempotent mutation options for account, category, transaction and asset writes", async () => {
    const { client, request } = createClient();
    const account = { name: "Brokerage" } as never;
    const category = { name: "Investments" } as never;
    const transaction = { amount: 45 } as never;
    const asset = { name: "World ETF" } as never;

    await expectRequest(
      request,
      () => api.accounts.create(client, account),
      "/accounts",
      idempotent("POST", account),
    );
    await expectRequest(
      request,
      () => api.accounts.update(client, "account-1", account),
      "/accounts/account-1",
      idempotent("PUT", account),
    );
    await expectRequest(
      request,
      () => api.accounts.archive(client, "account-1"),
      "/accounts/account-1",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.accounts.unarchive(client, "account-1"),
      "/accounts/account-1/unarchive",
      idempotent("POST"),
    );
    await expectRequest(
      request,
      () => api.accounts.deletePermanently(client, "account-1"),
      "/accounts/account-1/permanent",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.accounts.createReconciliationAdjustment(client, "account-1"),
      "/accounts/account-1/reconciliation/adjust",
      idempotent("POST"),
    );
    await expectRequest(
      request,
      () => api.accounts.establishOpeningBalanceBaseline(client, "account-1"),
      "/accounts/account-1/opening-balance-baseline",
      idempotent("POST"),
    );

    await expectRequest(
      request,
      () => api.categories.create(client, category),
      "/categories",
      idempotent("POST", category),
    );
    await expectRequest(
      request,
      () => api.categories.update(client, "category-1", category),
      "/categories/category-1",
      idempotent("PUT", category),
    );
    await expectRequest(
      request,
      () => api.categories.archive(client, "category-1"),
      "/categories/category-1",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.categories.unarchive(client, "category-1"),
      "/categories/category-1/unarchive",
      idempotent("POST"),
    );
    await expectRequest(
      request,
      () => api.categories.deletePermanently(client, "category-1"),
      "/categories/category-1/permanent",
      idempotent("DELETE"),
    );

    await expectRequest(
      request,
      () => api.transactions.create(client, transaction),
      "/transactions",
      idempotent("POST", transaction),
    );
    await expectRequest(
      request,
      () => api.transactions.update(client, "transaction-1", transaction),
      "/transactions/transaction-1",
      idempotent("PUT", transaction),
    );
    await expectRequest(
      request,
      () => api.transactions.remove(client, "transaction-1"),
      "/transactions/transaction-1",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.ai.transactionDraft(client, transaction),
      "/ai/transaction-draft",
      idempotent("POST", transaction),
    );

    await expectRequest(
      request,
      () => api.assets.create(client, asset),
      "/assets",
      idempotent("POST", asset),
    );
    await expectRequest(
      request,
      () => api.assets.update(client, "asset-1", asset),
      "/assets/asset-1",
      idempotent("PUT", asset),
    );
    await expectRequest(
      request,
      () => api.assets.remove(client, "asset-1"),
      "/assets/asset-1",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.assets.refresh(client),
      "/assets/refresh",
      idempotent("POST"),
    );
  });

  it("uses idempotent mutation options for budget, recurring, brokerage and settings writes", async () => {
    const { client, request } = createClient();
    const budget = { amount: 100 } as never;
    const override = { amount: 80 } as never;
    const rule = { description: "Rent" } as never;
    const occurrence = { status: "SKIPPED" } as never;
    const buy = { assetId: "asset-1" } as never;
    const targets = { targets: [] } as never;
    const validationRule = { pattern: "test" } as never;
    const settings = { defaultCurrency: "EUR" } as never;

    await expectRequest(
      request,
      () => api.budgets.create(client, budget),
      "/budgets",
      idempotent("POST", budget),
    );
    await expectRequest(
      request,
      () => api.budgets.update(client, "budget-1", budget),
      "/budgets/budget-1",
      idempotent("PUT", budget),
    );
    await expectRequest(
      request,
      () => api.budgets.remove(client, "budget-1", "2026-08"),
      "/budgets/budget-1",
      idempotentWithQuery("DELETE", { effectiveMonth: "2026-08" }),
    );
    await expectRequest(
      request,
      () => api.budgets.upsertOverride(client, "budget-1", "2026-08", override),
      "/budgets/budget-1/overrides/2026-08",
      idempotent("PUT", override),
    );
    await expectRequest(
      request,
      () => api.budgets.clearOverride(client, "budget-1", "2026-08"),
      "/budgets/budget-1/overrides/2026-08",
      idempotent("DELETE"),
    );

    await expectRequest(
      request,
      () => api.recurring.create(client, rule),
      "/recurring-rules",
      idempotent("POST", rule),
    );
    await expectRequest(
      request,
      () => api.recurring.update(client, "rule-1", rule),
      "/recurring-rules/rule-1",
      idempotent("PUT", rule),
    );
    await expectRequest(
      request,
      () => api.recurring.remove(client, "rule-1"),
      "/recurring-rules/rule-1",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () =>
        api.recurring.upsertOccurrence(client, "rule-1", "2026-08", occurrence),
      "/recurring-rules/rule-1/occurrences/2026-08",
      idempotent("PUT", occurrence),
    );
    await expectRequest(
      request,
      () => api.recurring.clearOccurrence(client, "rule-1", "2026-08"),
      "/recurring-rules/rule-1/occurrences/2026-08",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.recurring.materialize(client),
      "/recurring-rules/materialize",
      idempotent("POST"),
    );
    await expectRequest(
      request,
      () => api.snapshots.capture(client),
      "/snapshots/capture",
      idempotent("POST"),
    );

    await expectRequest(
      request,
      () => api.brokerage.buy(client, "brokerage-1", buy),
      "/brokerage/brokerage-1/buy",
      idempotent("POST", buy),
    );
    await expectRequest(
      request,
      () => api.brokerage.sell(client, "brokerage-1", buy),
      "/brokerage/brokerage-1/sell",
      idempotent("POST", buy),
    );
    await expectRequest(
      request,
      () => api.brokerage.dividend(client, "brokerage-1", buy),
      "/brokerage/brokerage-1/dividend",
      idempotent("POST", buy),
    );
    await expectRequest(
      request,
      () => api.brokerage.fee(client, "brokerage-1", buy),
      "/brokerage/brokerage-1/fee",
      idempotent("POST", buy),
    );
    await expectRequest(
      request,
      () =>
        api.brokerage.updateTrade(client, "brokerage-1", "operation-1", buy),
      "/brokerage/brokerage-1/operations/operation-1",
      idempotent("PUT", buy),
    );
    await expectRequest(
      request,
      () => api.brokerage.removeTrade(client, "brokerage-1", "operation-1"),
      "/brokerage/brokerage-1/operations/operation-1",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.brokerage.updateTargets(client, targets),
      "/brokerage/targets",
      idempotent("PUT", targets),
    );

    await expectRequest(
      request,
      () => api.expenseValidation.create(client, validationRule),
      "/expense-validation",
      idempotent("POST", validationRule),
    );
    await expectRequest(
      request,
      () =>
        api.expenseValidation.update(client, "validation-1", validationRule),
      "/expense-validation/validation-1",
      idempotent("PUT", validationRule),
    );
    await expectRequest(
      request,
      () => api.expenseValidation.remove(client, "validation-1"),
      "/expense-validation/validation-1",
      idempotent("DELETE"),
    );
    await expectRequest(
      request,
      () => api.user.updateSettings(client, settings),
      "/users/me/settings",
      idempotent("PATCH", settings),
    );
  });
});
