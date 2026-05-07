import type {
  CategoryResponse,
  ExpenseValidationRuleResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import ExpenseValidationPageClient from "@components/ExpenseValidationPageClient";
import { api } from "@lib/server-api";

export const dynamic = "force-dynamic";

export default async function ExpenseValidationPage() {
  let rules: ExpenseValidationRuleResponse[] | null = null;
  let categories: CategoryResponse[] | null = null;
  let errorMessage: string | null = null;

  try {
    [rules, categories] = await Promise.all([
      api<ExpenseValidationRuleResponse[]>("/expense-validation"),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Expense validation data is currently unavailable.";
  }

  return (
    <Container>
      {!rules || !categories ? (
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Classification</p>
            <h1 className="page-title is-compact">Expense validation</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </section>
      ) : (
        <ExpenseValidationPageClient categories={categories} rules={rules} />
      )}
    </Container>
  );
}
