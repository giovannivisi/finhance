import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type { RecurringTransactionRuleResponse } from "@finhance/shared";

import {
  useMaterializeRecurring,
  useRecurringPending,
  useRecurringRules,
} from "@/api/queries";
import {
  AppText,
  Button,
  Card,
  Chip,
  describeError,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  Screen,
  Section,
  SkeletonCard,
} from "@/components/ui";
import { TRANSACTION_KIND_LABELS } from "@/lib/labels";
import { spacing, useTheme } from "@/theme";

function ordinal(day: number): string {
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `${day}${suffix}`;
}

function RuleRow({
  rule,
  showDivider,
  onPress,
}: {
  rule: RecurringTransactionRuleResponse;
  showDivider: boolean;
  onPress: () => void;
}) {
  return (
    <ListRow
      onPress={onPress}
      showDivider={showDivider}
      title={rule.name}
      subtitle={`${TRANSACTION_KIND_LABELS[rule.kind]} · ${ordinal(
        rule.dayOfMonth,
      )} of the month`}
      right={
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <AppText
            variant="footnoteMedium"
            tabular
            tone={
              rule.kind === "TRANSFER"
                ? "secondary"
                : rule.kind === "EXPENSE"
                  ? "expense"
                  : "income"
            }
          >
            {rule.kind === "EXPENSE" ? "−" : rule.kind === "INCOME" ? "+" : ""}
            {rule.amount.toLocaleString("en-GB", {
              maximumFractionDigits: 2,
            })}
          </AppText>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {!rule.isActive ? <Chip label="paused" tone="neutral" /> : null}
            {rule.lastMaterializationError ? (
              <Chip label="error" tone="danger" />
            ) : null}
          </View>
        </View>
      }
    />
  );
}

export default function RecurringListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const rulesQuery = useRecurringRules();
  const pendingQuery = useRecurringPending();
  const materialize = useMaterializeRecurring();
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"info" | "danger">("info");

  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const activeRules = useMemo(
    () => rules.filter((rule) => rule.isActive),
    [rules],
  );
  const pausedRules = useMemo(
    () => rules.filter((rule) => !rule.isActive),
    [rules],
  );

  const runMaterialize = async () => {
    setNotice(null);
    try {
      const result = await materialize.mutateAsync();
      setNoticeTone("info");
      setNotice(
        result.createdCount > 0
          ? `Posted ${result.createdCount} transaction${
              result.createdCount === 1 ? "" : "s"
            } from ${result.processedRuleCount} rule${
              result.processedRuleCount === 1 ? "" : "s"
            }.`
          : "Everything was already up to date.",
      );
    } catch (error) {
      setNoticeTone("danger");
      setNotice(describeError(error));
    }
  };

  return (
    <Screen
      kicker="Automation"
      title="Recurring"
      showBack
      withTabBarClearance
      refreshing={rulesQuery.isRefetching || pendingQuery.isRefetching}
      onRefresh={() =>
        Promise.all([rulesQuery.refetch(), pendingQuery.refetch()])
      }
      headerRight={
        <IconButton
          accessibilityLabel="Add recurring rule"
          icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
          onPress={() => router.push("/recurring/upsert")}
        />
      }
    >
      {rulesQuery.isPending ? (
        <>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </>
      ) : rulesQuery.isError ? (
        <ErrorState
          error={rulesQuery.error}
          onRetry={() => rulesQuery.refetch()}
        />
      ) : rules.length === 0 ? (
        <EmptyState
          icon="repeat-outline"
          title="No recurring rules"
          description="Rent, salary, subscriptions — define them once and let each month post itself."
          actionLabel="Create a rule"
          onAction={() => router.push("/recurring/upsert")}
        />
      ) : (
        <>
          {pendingQuery.data?.hasPending ? (
            <Card surface="info">
              <View style={{ gap: spacing.sm }}>
                <AppText variant="footnote" tone="secondary">
                  Some months have due occurrences that were never posted.
                </AppText>
                <Button
                  label="Materialise now"
                  size="sm"
                  variant="secondary"
                  loading={materialize.isPending}
                  onPress={runMaterialize}
                />
              </View>
            </Card>
          ) : (
            <Button
              label="Materialise due occurrences"
              variant="secondary"
              size="sm"
              loading={materialize.isPending}
              onPress={runMaterialize}
            />
          )}

          {notice ? (
            <Card surface={noticeTone === "danger" ? "danger" : "success"}>
              <AppText
                variant="footnote"
                tone={noticeTone === "danger" ? "danger" : "success"}
              >
                {notice}
              </AppText>
            </Card>
          ) : null}

          {activeRules.length > 0 ? (
            <Section title="Active rules">
              <Card style={{ paddingVertical: 4 }}>
                {activeRules.map((rule, index) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    showDivider={index < activeRules.length - 1}
                    onPress={() =>
                      router.push({
                        pathname: "/recurring/[id]",
                        params: { id: rule.id },
                      })
                    }
                  />
                ))}
              </Card>
            </Section>
          ) : null}

          {pausedRules.length > 0 ? (
            <Section title="Paused rules">
              <Card style={{ paddingVertical: 4 }}>
                {pausedRules.map((rule, index) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    showDivider={index < pausedRules.length - 1}
                    onPress={() =>
                      router.push({
                        pathname: "/recurring/[id]",
                        params: { id: rule.id },
                      })
                    }
                  />
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
