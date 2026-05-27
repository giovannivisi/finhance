"use client";

import { useEffect, useState } from "react";
import type {
  AccountReconciliationResponse,
  AccountResponse,
} from "@finhance/shared";
import AccountsPageClient from "@components/AccountsPageClient";
import Container from "@components/Container";
import RouteLoadingShell from "@components/RouteLoadingShell";
import { api } from "@lib/api";

export default function AccountsRouteClient() {
  const [accounts, setAccounts] = useState<AccountResponse[] | null>(null);
  const [reconciliations, setReconciliations] = useState<
    AccountReconciliationResponse[] | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    Promise.all([
      api<AccountResponse[]>("/accounts?includeArchived=true"),
      api<AccountReconciliationResponse[]>(
        "/accounts/reconciliation?includeArchived=true",
      ),
    ])
      .then(([nextAccounts, nextReconciliations]) => {
        if (!isActive) {
          return;
        }

        setAccounts(nextAccounts);
        setReconciliations(nextReconciliations);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Account data is currently unavailable.",
        );
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
            <p className="page-kicker">Structure</p>
            <h1 className="page-title is-compact">Accounts</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">{errorMessage}</p>
          </div>
        </section>
      </Container>
    );
  }

  if (!accounts || !reconciliations) {
    return <RouteLoadingShell kicker="Structure" title="Accounts" />;
  }

  return (
    <Container>
      <AccountsPageClient
        accounts={accounts}
        reconciliations={reconciliations}
      />
    </Container>
  );
}
