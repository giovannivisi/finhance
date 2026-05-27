import type {
  RecurringPendingStatusResponse,
  TransactionsPageDataResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import TransactionsPageClient from "@components/TransactionsPageClient";
import { getDefaultActivityFilters, type ActivityFilters } from "@lib/activity";
import { api } from "@lib/server-api";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

function getSingleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function buildPageDataQueryString(filters: ActivityFilters) {
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

  if (filters.kind) {
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

  const settings = await getUserSettingsOrDefaults();

  let pageData: TransactionsPageDataResponse | null = null;
  let hasPendingSync = false;
  let errorMessage: string | null = null;

  try {
    const pendingStatusPromise = api<RecurringPendingStatusResponse>(
      "/recurring-rules/has-pending",
    ).catch(() => null);

    const [nextPageData, pendingStatus] = await Promise.all([
      api<TransactionsPageDataResponse>(
        `/transactions/page-data${buildPageDataQueryString(filters)}`,
      ),
      pendingStatusPromise,
    ]);

    pageData = nextPageData;
    hasPendingSync = pendingStatus?.hasPending ?? false;
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Transaction data is currently unavailable.";
  }

  return (
    <Container>
      {!pageData ? (
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Cashflow</p>
            <h1 className="page-title is-compact">Transactions</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </section>
      ) : (
        <TransactionsPageClient
          transactions={pageData.transactions}
          cashflow={pageData.cashflow}
          accounts={pageData.accounts}
          categories={pageData.categories}
          expenseValidationRules={pageData.expenseValidationRules}
          initialFilters={filters}
          initialHasPendingSync={hasPendingSync}
          showTransactionTimes={settings.showTransactionTimes}
        />
      )}
    </Container>
  );
}
