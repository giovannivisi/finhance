"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MaterializeRecurringRulesResponse } from "@finhance/shared";
import { requestRecurringMaterialization } from "@lib/recurring-materialization";

export default function RecurringMaterializeButton({
  label = "Sync due transactions",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] =
    useState<MaterializeRecurringRulesResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    setError(null);
    setSummary(null);
    setIsSyncing(true);

    const result = await requestRecurringMaterialization();

    if (!result.ok) {
      setError(result.error);
      setIsSyncing(false);
      return;
    }

    setSummary(result.summary);
    setIsSyncing(false);
    startRefresh(() => {
      router.refresh();
    });
  }

  const isBusy = isSyncing || isRefreshing;
  const buttonLabel = isSyncing
    ? "Syncing..."
    : isRefreshing
      ? "Refreshing..."
      : label;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleSync()}
        disabled={isBusy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {buttonLabel}
      </button>
      {summary ? (
        <p className="text-sm text-emerald-700">
          Synced due transactions: created {summary.createdCount}, processed{" "}
          {summary.processedRuleCount}, failed {summary.failedRuleCount}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
