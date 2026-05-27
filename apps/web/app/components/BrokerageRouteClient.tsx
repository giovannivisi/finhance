"use client";

import { useEffect, useState } from "react";
import BrokeragePageClient from "@components/BrokeragePageClient";
import { api } from "@lib/api";
import type {
  BrokerageAccountSummaryResponse,
  BrokerageWorkspaceResponse,
  CategoryResponse,
} from "@finhance/shared";

export default function BrokerageRouteClient({
  accountId,
}: {
  accountId?: string;
}) {
  const [workspace, setWorkspace] = useState<BrokerageWorkspaceResponse | null>(
    null,
  );
  const [categories, setCategories] = useState<CategoryResponse[] | null>(null);
  const [hasNoBrokers, setHasNoBrokers] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadWorkspace() {
      const resolvedAccountId =
        accountId ??
        (await api<BrokerageAccountSummaryResponse[]>("/brokerage")).at(0)
          ?.account.id;

      if (!resolvedAccountId) {
        if (isActive) {
          setHasNoBrokers(true);
        }
        return;
      }

      const [nextWorkspace, nextCategories] = await Promise.all([
        api<BrokerageWorkspaceResponse>(`/brokerage/${resolvedAccountId}`),
        api<CategoryResponse[]>("/categories?includeArchived=true"),
      ]);

      if (!isActive) {
        return;
      }

      setWorkspace(nextWorkspace);
      setCategories(nextCategories);
      setHasNoBrokers(false);
    }

    loadWorkspace().catch((error: unknown) => {
      if (!isActive) {
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Brokerage data is currently unavailable.",
      );
    });

    return () => {
      isActive = false;
    };
  }, [accountId]);

  if (errorMessage) {
    return (
      <section className="page-shell">
        <div className="page-hero">
          <p className="page-kicker">Investing</p>
          <h1 className="page-title is-compact">Brokerage</h1>
        </div>
        <div className="page-inline-notice surface-warning">
          <p className="font-medium">The web app could not reach the API.</p>
          <p className="mt-2 text-sm">{errorMessage}</p>
        </div>
      </section>
    );
  }

  if (hasNoBrokers) {
    return (
      <section className="page-shell">
        <div className="page-hero">
          <p className="page-kicker">Investing</p>
          <h1 className="page-title is-compact">Brokerage</h1>
          <p className="page-description">
            Create a broker account first to unlock positions, trades, and
            allocation targets.
          </p>
        </div>
        <div className="page-inline-notice surface-dashed">
          No active broker accounts yet.
        </div>
      </section>
    );
  }

  if (!workspace || !categories) {
    return (
      <section className="page-shell">
        <div className="page-hero">
          <p className="page-kicker">Investing</p>
          <h1 className="page-title is-compact">Brokerage</h1>
        </div>
        <div className="page-inline-notice surface-dashed">
          Loading brokerage...
        </div>
      </section>
    );
  }

  return <BrokeragePageClient workspace={workspace} categories={categories} />;
}
