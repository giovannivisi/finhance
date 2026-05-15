import type {
  AccountResponse,
  CashflowSummaryResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  RecurringPendingStatusResponse,
  TransactionResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import TransactionsPageClient from "@components/TransactionsPageClient";
import { getDefaultActivityFilters, type ActivityFilters } from "@lib/activity";
import { api } from "@lib/server-api";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

function getSingleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function buildFilterQueryString(
  filters: ActivityFilters,
  options?: { includeKind?: boolean },
) {
  const params = new URLSearchParams();

  if (filters.from) {
    params.set("from", filters.from);
  }

  if (filters.to) {
    params.set("to", filters.to);
  }

  if (filters.accountId) {
    params.set("accountId", filters.accountId);
  }

  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.primaryCategoryId) {
    params.set("primaryCategoryId", filters.primaryCategoryId);
  }

  if (filters.secondaryCategoryId) {
    params.set("secondaryCategoryId", filters.secondaryCategoryId);
  }

  if ((options?.includeKind ?? true) && filters.kind) {
    params.set("kind", filters.kind);
  }

  if (filters.includeArchivedAccounts) {
    params.set("includeArchivedAccounts", "true");
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const hasExplicitFilters = Object.keys(resolvedSearchParams).length > 0;
  const defaultFilters = getDefaultActivityFilters();
  const filters: ActivityFilters = hasExplicitFilters
    ? {
        from: getSingleValue(resolvedSearchParams.from),
        to: getSingleValue(resolvedSearchParams.to),
        accountId: getSingleValue(resolvedSearchParams.accountId),
        categoryId: getSingleValue(resolvedSearchParams.categoryId),
        primaryCategoryId: getSingleValue(
          resolvedSearchParams.primaryCategoryId,
        ),
        secondaryCategoryId:
          getSingleValue(resolvedSearchParams.secondaryCategoryId) ||
          getSingleValue(resolvedSearchParams.categoryId),
        kind: getSingleValue(resolvedSearchParams.kind),
        includeArchivedAccounts:
          getSingleValue(resolvedSearchParams.includeArchivedAccounts) ===
          "true",
      }
    : defaultFilters;
  const transactionsQueryString = buildFilterQueryString(filters, {
    includeKind: true,
  });
  const cashflowQueryString = buildFilterQueryString(filters, {
    includeKind: false,
  });

  let transactions: TransactionResponse[] | null = null;
  let cashflow: CashflowSummaryResponse | null = null;
  let accounts: AccountResponse[] | null = null;
  let categories: CategoryResponse[] | null = null;
  let expenseValidationRules: ExpenseValidationRuleResponse[] | null = null;
  let hasPendingSync = false;
  let errorMessage: string | null = null;

  try {
    const pendingStatusPromise = api<RecurringPendingStatusResponse>(
      "/recurring-rules/has-pending",
    ).catch(() => null);

    [
      transactions,
      cashflow,
      accounts,
      categories,
      expenseValidationRules,
      hasPendingSync,
    ] = await Promise.all([
      api<TransactionResponse[]>(`/transactions${transactionsQueryString}`),
      api<CashflowSummaryResponse>(`/cashflow/summary${cashflowQueryString}`),
      api<AccountResponse[]>("/accounts?includeArchived=true"),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
      api<ExpenseValidationRuleResponse[]>("/expense-validation"),
      pendingStatusPromise.then(
        (pendingStatus) => pendingStatus?.hasPending ?? false,
      ),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Transaction data is currently unavailable.";
  }

  return (
    <>
      <Container>
        {!transactions ||
        !cashflow ||
        !accounts ||
        !categories ||
        !expenseValidationRules ? (
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Cashflow</p>
              <h1 className="page-title is-compact">Transactions</h1>
            </div>
            <div className="page-inline-notice surface-warning">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </section>
        ) : (
          <TransactionsPageClient
            transactions={transactions}
            cashflow={cashflow}
            accounts={accounts}
            categories={categories}
            expenseValidationRules={expenseValidationRules}
            initialFilters={filters}
            hasPendingSync={hasPendingSync}
          />
        )}
      </Container>
    </>
  );
}
