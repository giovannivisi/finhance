"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  TransactionsPageDataResponse,
  UserSettingsResponse,
} from "@finhance/shared";
import TransactionsPageClient from "@components/TransactionsPageClient";
import type { ActivityFilters } from "@lib/activity";
import { api } from "@lib/api";
import { getDefaultUserSettings, mergeUserSettings } from "@lib/user-settings";

function buildFilterQueryString(filters: ActivityFilters) {
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

export default function TransactionsRouteClient({
  initialFilters,
}: {
  initialFilters: ActivityFilters;
}) {
  const [pageData, setPageData] = useState<TransactionsPageDataResponse | null>(
    null,
  );
  const [showTransactionTimes, setShowTransactionTimes] = useState(
    getDefaultUserSettings().showTransactionTimes,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryString = useMemo(
    () => buildFilterQueryString(initialFilters),
    [initialFilters],
  );

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api<TransactionsPageDataResponse>(
        `/transactions/page-data${queryString}`,
      ),
      api<UserSettingsResponse>("/users/me/settings")
        .then((settings) => mergeUserSettings(settings).showTransactionTimes)
        .catch(() => getDefaultUserSettings().showTransactionTimes),
    ])
      .then(([data, shouldShowTimes]) => {
        if (!isActive) {
          return;
        }

        setPageData(data);
        setShowTransactionTimes(shouldShowTimes);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Transaction data is currently unavailable.",
        );
      });

    return () => {
      isActive = false;
    };
  }, [initialFilters, queryString]);

  if (errorMessage) {
    return (
      <section className="page-shell">
        <div className="page-hero">
          <p className="page-kicker">Cashflow</p>
          <h1 className="page-title is-compact">Transactions</h1>
        </div>
        <div className="page-inline-notice surface-warning">
          <p className="font-medium">The web app could not reach the API.</p>
          <p className="mt-2 text-sm">{errorMessage}</p>
        </div>
      </section>
    );
  }

  if (!pageData) {
    return (
      <section className="page-shell">
        <div className="page-hero">
          <p className="page-kicker">Cashflow</p>
          <h1 className="page-title is-compact">Transactions</h1>
        </div>
        <div className="page-inline-notice surface-dashed">
          Loading transactions...
        </div>
      </section>
    );
  }

  return (
    <TransactionsPageClient
      transactions={pageData.transactions}
      cashflow={pageData.cashflow}
      accounts={pageData.accounts}
      categories={pageData.categories}
      expenseValidationRules={pageData.expenseValidationRules}
      initialFilters={initialFilters}
      initialHasPendingSync={false}
      showTransactionTimes={showTransactionTimes}
    />
  );
}
