import { useState } from "react";
import { View } from "react-native";

import { useCaptureSnapshot, useSnapshots } from "@/api/queries";
import {
  AppText,
  Button,
  Card,
  Chip,
  describeError,
  EmptyState,
  ErrorState,
  ListRow,
  MoneyText,
  Screen,
  SkeletonCard,
} from "@/components/ui";
import { useFormatters } from "@/prefs";
import { spacing } from "@/theme";

export default function HistoryScreen() {
  const format = useFormatters();
  const snapshotsQuery = useSnapshots();
  const capture = useCaptureSnapshot();
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "danger">("success");

  const snapshots = snapshotsQuery.data ?? [];

  const runCapture = async () => {
    setNotice(null);
    try {
      const snapshot = await capture.mutateAsync();
      setNoticeTone("success");
      setNotice(
        `Captured ${format.date(snapshot.snapshotDate.slice(0, 10))} — net worth ${format.money(snapshot.netWorthTotal, snapshot.reportingCurrency, { maximumFractionDigits: 0 })}.`,
      );
    } catch (error) {
      setNoticeTone("danger");
      setNotice(describeError(error));
    }
  };

  return (
    <Screen
      kicker="Snapshots"
      title="History"
      showBack
      withTabBarClearance
      refreshing={snapshotsQuery.isRefetching}
      onRefresh={() => snapshotsQuery.refetch()}
    >
      <Card surface="muted">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="footnote" tone="secondary">
            Snapshots freeze today&apos;s net worth so months can be compared
            honestly later — capture one at each month boundary.
          </AppText>
          <Button
            label="Capture snapshot now"
            size="sm"
            onPress={runCapture}
            loading={capture.isPending}
          />
        </View>
      </Card>

      {notice ? (
        <Card surface={noticeTone}>
          <AppText variant="footnote" tone={noticeTone}>
            {notice}
          </AppText>
        </Card>
      ) : null}

      {snapshotsQuery.isPending ? (
        <SkeletonCard lines={4} />
      ) : snapshotsQuery.isError ? (
        <ErrorState
          error={snapshotsQuery.error}
          onRetry={() => snapshotsQuery.refetch()}
        />
      ) : snapshots.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title="No snapshots yet"
          description="Capture the first one to start preserving net worth history."
        />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {snapshots.map((snapshot, index) => (
            <ListRow
              key={snapshot.id}
              showDivider={index < snapshots.length - 1}
              title={format.date(snapshot.snapshotDate.slice(0, 10))}
              subtitle={`Captured ${format.timestamp(snapshot.capturedAt)}${
                snapshot.storedReportingCurrency !== snapshot.reportingCurrency
                  ? ` · stored in ${snapshot.storedReportingCurrency}`
                  : ""
              }`}
              right={
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <MoneyText
                    amount={snapshot.netWorthTotal}
                    currency={snapshot.reportingCurrency}
                    variant="bodyMedium"
                    maximumFractionDigits={0}
                  />
                  {snapshot.isPartial ? (
                    <Chip label="partial" tone="warning" />
                  ) : null}
                </View>
              }
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
