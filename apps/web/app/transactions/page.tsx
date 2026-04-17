import type {
  AccountResponse,
  CashflowSummaryResponse,
  CategoryResponse,
  TransactionResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import Header from "@components/Header";
import TransactionsPageClient from "@components/TransactionsPageClient";
import { api } from "@lib/api";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

function getSingleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function buildFilterQueryString(
  filters: {
    from: string;
    to: string;
    accountId: string;
    categoryId: string;
    kind: string;
    includeArchivedAccounts: boolean;
  },
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
  const filters = {
    from: getSingleValue(resolvedSearchParams.from),
    to: getSingleValue(resolvedSearchParams.to),
    accountId: getSingleValue(resolvedSearchParams.accountId),
    categoryId: getSingleValue(resolvedSearchParams.categoryId),
    kind: getSingleValue(resolvedSearchParams.kind),
    includeArchivedAccounts:
      getSingleValue(resolvedSearchParams.includeArchivedAccounts) === "true",
  };
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
  let errorMessage: string | null = null;

  try {
    [transactions, cashflow, accounts, categories] = await Promise.all([
      api<TransactionResponse[]>(`/transactions${transactionsQueryString}`),
      api<CashflowSummaryResponse>(`/cashflow/summary${cashflowQueryString}`),
      api<AccountResponse[]>("/accounts?includeArchived=true"),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Transaction data is currently unavailable.";
  }

  return (
    <>
      <Header />
      <Container>
        {!transactions || !cashflow || !accounts || !categories ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">
              Transactions
            </h1>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm text-amber-900/80">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </>
        ) : (
          <TransactionsPageClient
            transactions={transactions}
            cashflow={cashflow}
            accounts={accounts}
            categories={categories}
            initialFilters={filters}
          />
        )}
      </Container>
    </>
  );
}
