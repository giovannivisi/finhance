import type {
  AccountResponse,
  CategoryResponse,
  RecurringTransactionRuleResponse,
} from "@finhance/shared";
import Container from "@components/Container";

import RecurringPageClient from "@components/RecurringPageClient";
import { api } from "@lib/server-api";

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
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Automation</p>
              <h1 className="page-title is-compact">Recurring</h1>
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
