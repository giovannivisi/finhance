"use client";

import { useEffect, useState } from "react";
import type {
  CategoryResponse,
  ExpenseValidationRuleResponse,
} from "@finhance/shared";
import Container from "@components/Container";
import ExpenseValidationPageClient from "@components/ExpenseValidationPageClient";
import RouteLoadingShell from "@components/RouteLoadingShell";
import { api } from "@lib/api";

export default function ExpenseValidationRouteClient() {
  const [rules, setRules] = useState<ExpenseValidationRuleResponse[] | null>(
    null,
  );
  const [categories, setCategories] = useState<CategoryResponse[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api<ExpenseValidationRuleResponse[]>("/expense-validation"),
      api<CategoryResponse[]>("/categories?includeArchived=true"),
    ])
      .then(([nextRules, nextCategories]) => {
        if (!isActive) {
          return;
        }

        setRules(nextRules);
        setCategories(nextCategories);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Expense validation data is currently unavailable.",
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
            <p className="page-kicker">Classification</p>
            <h1 className="page-title is-compact">Expense validation</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">{errorMessage}</p>
          </div>
        </section>
      </Container>
    );
  }

  if (!rules || !categories) {
    return (
      <RouteLoadingShell kicker="Classification" title="Expense validation" />
    );
  }

  return (
    <Container>
      <ExpenseValidationPageClient categories={categories} rules={rules} />
    </Container>
  );
}
