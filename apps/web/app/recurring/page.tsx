import type {
  AccountResponse,
  CategoryResponse,
  RecurringTransactionRuleResponse,
} from "@finhance/shared";
import Container from "@components/Container";

import RecurringPageClient from "@components/RecurringPageClient";
import { api } from "@lib/api";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  let rules: RecurringTransactionRuleResponse[] | null = null;
  let accounts: AccountResponse[] | null = null;
  let categories: CategoryResponse[] | null = null;
  let errorMessage: string | null = null;

  try {
    [rules, accounts, categories] = await Promise.all([
      api<RecurringTransactionRuleResponse[]>("/recurring-rules"),
      api<AccountResponse[]>("/accounts?includeArchived=true"),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Recurring data is currently unavailable.";
  }

  return (
    <>
      <Container>
        {!rules || !accounts || !categories ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">Recurring</h1>
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
          <RecurringPageClient
            rules={rules}
            accounts={accounts}
            categories={categories}
          />
        )}
      </Container>
    </>
  );
}
