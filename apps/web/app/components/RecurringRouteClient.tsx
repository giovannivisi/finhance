"use client";

import { useEffect, useState } from "react";
import type {
  AccountResponse,
  CategoryResponse,
  ExpenseValidationRuleResponse,
  RecurringTransactionRuleResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import RecurringPageClient from "@components/RecurringPageClient";
import RouteLoadingShell from "@components/RouteLoadingShell";
import { api } from "@lib/api";

export default function RecurringRouteClient() {
  const [rules, setRules] = useState<RecurringTransactionRuleResponse[] | null>(
    null,
  );
  const [accounts, setAccounts] = useState<AccountResponse[] | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[] | null>(null);
  const [expenseValidationRules, setExpenseValidationRules] = useState<
    ExpenseValidationRuleResponse[] | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api<RecurringTransactionRuleResponse[]>("/recurring-rules"),
      api<AccountResponse[]>("/accounts?includeArchived=true"),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
      api<ExpenseValidationRuleResponse[]>("/expense-validation"),
    ])
      .then(
        ([
          nextRules,
          nextAccounts,
          nextCategories,
          nextExpenseValidationRules,
        ]) => {
          if (!isActive) {
            return;
          }

          setRules(nextRules);
          setAccounts(nextAccounts);
          setCategories(nextCategories);
          setExpenseValidationRules(nextExpenseValidationRules);
        },
      )
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Recurring data is currently unavailable.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (errorMessage) {
    return (
      <Container>
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Automation</p>
            <h1 className="page-title is-compact">Recurring</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">{errorMessage}</p>
          </div>
        </section>
      </Container>
    );
  }

  if (!rules || !accounts || !categories || !expenseValidationRules) {
    return <RouteLoadingShell kicker="Automation" title="Recurring" />;
  }

  return (
    <Container>
      <RecurringPageClient
        rules={rules}
        accounts={accounts}
        categories={categories}
        expenseValidationRules={expenseValidationRules}
      />
    </Container>
  );
}
