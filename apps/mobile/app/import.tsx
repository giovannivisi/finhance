import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useMemo } from "react";
import { View } from "react-native";

import { useServerConnection } from "@/api/server-connection";
import { useImportBatches } from "@/api/queries";
import {
  AppText,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  ListRow,
  Screen,
  Section,
  SkeletonCard,
} from "@/components/ui";
import {
  getImportFileLabel,
  groupImportSummaries,
  importStatusTone,
  sortImportBatches,
  totalImportRows,
} from "@/lib/imports";
import { useFormatters } from "@/prefs";
import { radius, spacing, useTheme } from "@/theme";

export default function ImportScreen() {
  const { colors } = useTheme();
  const format = useFormatters();
  const { serverMode, serverUrl } = useServerConnection();
  const batchesQuery = useImportBatches();
  const batches = useMemo(
    () => sortImportBatches(batchesQuery.data ?? []),
    [batchesQuery.data],
  );
  const latestBatch = batches[0] ?? null;

  const openWebImport = () => {
    if (!serverUrl || serverMode !== "hosted") {
      return;
    }

    void WebBrowser.openBrowserAsync(`${serverUrl}/import`);
  };

  return (
    <Screen
      kicker="Migration"
      title="Import & export"
      showBack
      withTabBarClearance
      refreshing={batchesQuery.isRefetching}
      onRefresh={() => batchesQuery.refetch()}
    >
      <Card surface="muted">
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <AppText variant="footnoteMedium">CSV round-trip</AppText>
            <AppText variant="footnote" tone="secondary">
              Recent batches are visible here. File selection, preview, apply,
              templates, and export run in the web workspace.
            </AppText>
          </View>
          {serverMode === "hosted" && serverUrl ? (
            <Button
              label="Open web import"
              variant="secondary"
              size="sm"
              onPress={openWebImport}
              icon={
                <Ionicons
                  name="open-outline"
                  size={16}
                  color={colors.textPrimary}
                />
              }
            />
          ) : (
            <AppText variant="caption" tone="tertiary">
              Open the web app from a trusted local browser session for CSV
              upload and downloads.
            </AppText>
          )}
        </View>
      </Card>

      {latestBatch ? (
        <Section kicker="Latest" title="Most recent batch">
          <Card>
            <View style={{ gap: spacing.lg }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: spacing.md,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="title3" numberOfLines={1}>
                    Batch {latestBatch.id}
                  </AppText>
                  <AppText variant="caption" tone="secondary">
                    Created {format.timestamp(latestBatch.createdAt)}
                  </AppText>
                  {latestBatch.appliedAt ? (
                    <AppText variant="caption" tone="secondary">
                      Applied {format.timestamp(latestBatch.appliedAt)}
                    </AppText>
                  ) : null}
                </View>
                <Chip
                  label={latestBatch.status.toLowerCase()}
                  tone={importStatusTone(
                    latestBatch.status,
                    latestBatch.summary,
                  )}
                />
              </View>

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bgCardMuted,
                    padding: spacing.lg,
                    gap: 3,
                  }}
                >
                  <AppText variant="kicker" tone="tertiary">
                    Rows
                  </AppText>
                  <AppText variant="title3" tabular>
                    {totalImportRows(latestBatch.summary)}
                  </AppText>
                </View>
                <View
                  style={{
                    flex: 1,
                    borderRadius: radius.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.bgCardMuted,
                    padding: spacing.lg,
                    gap: 3,
                  }}
                >
                  <AppText variant="kicker" tone="tertiary">
                    Issues
                  </AppText>
                  <AppText variant="title3" tabular>
                    {latestBatch.summary.errorCount +
                      latestBatch.summary.warningCount}
                  </AppText>
                </View>
              </View>
            </View>
          </Card>
        </Section>
      ) : null}

      {batchesQuery.isPending ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </>
      ) : batchesQuery.isError ? (
        <ErrorState
          error={batchesQuery.error}
          onRetry={() => batchesQuery.refetch()}
        />
      ) : batches.length === 0 ? (
        <EmptyState
          icon="cloud-upload-outline"
          title="No import batches yet"
          description="Run the first CSV preview from the web app, then batch history will appear here."
        />
      ) : (
        <Section kicker="History" title="Recent batches">
          <View style={{ gap: spacing.md }}>
            {batches.map((batch) => {
              const groups = groupImportSummaries(batch.summary);

              return (
                <Card key={batch.id} style={{ paddingVertical: 4 }}>
                  <ListRow
                    title={`Batch ${batch.id}`}
                    subtitle={`Created ${format.timestamp(batch.createdAt)} · ${totalImportRows(
                      batch.summary,
                    )} rows`}
                    titleLines={1}
                    showDivider={groups.length > 0}
                    right={
                      <Chip
                        label={batch.status.toLowerCase()}
                        tone={importStatusTone(batch.status, batch.summary)}
                      />
                    }
                  />
                  {groups.map((group, groupIndex) => (
                    <View
                      key={group.id}
                      style={{
                        paddingHorizontal: spacing.lg,
                        paddingVertical: spacing.md,
                        gap: spacing.sm,
                        borderTopWidth: groupIndex === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          gap: spacing.sm,
                        }}
                      >
                        <AppText variant="footnoteMedium">
                          {group.title}
                        </AppText>
                        <AppText variant="caption" tone="tertiary">
                          {group.files.length} file
                          {group.files.length === 1 ? "" : "s"}
                        </AppText>
                      </View>
                      <View style={{ gap: 6 }}>
                        {group.files.map((file) => (
                          <View
                            key={file.file}
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              gap: spacing.md,
                            }}
                          >
                            <AppText
                              variant="caption"
                              tone="secondary"
                              style={{ flex: 1 }}
                              numberOfLines={1}
                            >
                              {getImportFileLabel(file.file)}
                            </AppText>
                            <AppText variant="caption" tone="tertiary" tabular>
                              +{file.createCount} / ~{file.updateCount} / =
                              {file.unchangedCount}
                            </AppText>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))}
                </Card>
              );
            })}
          </View>
        </Section>
      )}
    </Screen>
  );
}
