"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MaterializeRecurringRulesResponse } from "@finhance/shared";
import CooldownNotice from "@components/CooldownNotice";
import { requestRecurringMaterialization } from "@lib/recurring-materialization";
import { getRepeatedActionNotice } from "@lib/request-safety";
import { useSingleFlightActions } from "@lib/single-flight";

export default function RecurringMaterializeButton({
  label = "Sync due transactions",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] =
    useState<MaterializeRecurringRulesResponse | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const actions = useSingleFlightActions<"sync">();

  async function handleSync() {
    await actions.run("sync", async () => {
      setError(null);
      setNotice(null);
      setSummary(null);
      setIsSyncing(true);

      const result = await requestRecurringMaterialization();

      if (!result.ok) {
        const repeatedActionNotice = getRepeatedActionNotice({
          status: result.status,
          error: result.error,
        });

        if (repeatedActionNotice) {
          setNotice(repeatedActionNotice);
          setIsSyncing(false);
          return;
        }
        setError(result.error);
        setIsSyncing(false);
        return;
      }

      setSummary(result.summary);
      setIsSyncing(false);
      startRefresh(() => {
        router.refresh();
      });
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
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {buttonLabel}
      </button>
      {summary ? (
        <p className="page-inline-notice surface-success">
          Synced due transactions: created {summary.createdCount}, processed{" "}
          {summary.processedRuleCount}, failed {summary.failedRuleCount}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="page-inline-notice surface-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <CooldownNotice
          key={notice}
          notice={notice}
          className="page-inline-notice surface-warning"
        />
      ) : null}
    </div>
  );
}
