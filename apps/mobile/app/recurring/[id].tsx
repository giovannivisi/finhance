import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type { UpsertRecurringOccurrenceRequest } from "@finhance/shared";

import {
  useAccountsList,
  useClearRecurringOccurrence,
  useDeleteRecurringRule,
  useRecurringOccurrences,
  useRecurringRule,
  useUpsertRecurringOccurrence,
} from "@/api/queries";
import {
  AmountField,
  AppText,
  Button,
  Card,
  DateField,
  describeError,
  ErrorState,
  IconButton,
  ListRow,
  Screen,
  Section,
  SegmentedControl,
  SelectField,
  Sheet,
  SkeletonCard,
  Stat,
  TextField,
} from "@/components/ui";
import {
  addMonths,
  currentMonth,
  todayLocalDate,
} from "@/lib/dates";
import { TRANSACTION_KIND_LABELS } from "@/lib/labels";
import { parseAmountInput } from "@/lib/money";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

export default function RecurringRuleDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const format = useFormatters();
  const params = useLocalSearchParams<{ id: string }>();
  const ruleId = params.id;

  const ruleQuery = useRecurringRule(ruleId);
  const occurrencesQuery = useRecurringOccurrences(ruleId);
  const accountsQuery = useAccountsList(true);

  const deleteMutation = useDeleteRecurringRule();
  const upsertOccurrence = useUpsertRecurringOccurrence();
  const clearOccurrence = useClearRecurringOccurrence();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionMonth, setExceptionMonth] = useState(currentMonth());
  const [exceptionMode, setExceptionMode] = useState<"SKIPPED" | "OVERRIDDEN">(
    "SKIPPED",
  );
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideDate, setOverrideDate] = useState(todayLocalDate());
  const [overrideDescription, setOverrideDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rule = ruleQuery.data;
  const accountNames = useMemo(
    () =>
      new Map(
        (accountsQuery.data ?? []).map((account) => [account.id, account.name]),
      ),
    [accountsQuery.data],
  );

  const monthChoices = useMemo(() => {
    const base = currentMonth();
    return Array.from({ length: 7 }, (_, index) => addMonths(base, index - 3))
      .reverse()
      .map((value) => ({ value, label: format.month(value) }));
  }, [format]);

  if (ruleQuery.isPending) {
    return (
      <Screen title="Recurring rule" showBack>
        <SkeletonCard lines={4} />
      </Screen>
    );
  }

  if (ruleQuery.isError || !rule) {
    return (
      <Screen title="Recurring rule" showBack>
        <ErrorState
          error={ruleQuery.error}
          onRetry={() => ruleQuery.refetch()}
        />
      </Screen>
    );
  }

  const submitException = async () => {
    setError(null);

    let body: UpsertRecurringOccurrenceRequest;

    if (exceptionMode === "SKIPPED") {
      body = { status: "SKIPPED" };
    } else {
      const amount = parseAmountInput(overrideAmount);

      if (amount === null || amount <= 0) {
        setError("Enter a positive override amount.");
        return;
      }

      const description =
        overrideDescription.trim() || rule.description || rule.name;

      if (rule.kind === "TRANSFER") {
        if (!rule.sourceAccountId || !rule.destinationAccountId) {
          setError("This transfer rule is missing its accounts.");
          return;
        }

        body = {
          status: "OVERRIDDEN",
          amount,
          postedAtDate: overrideDate,
          description,
          sourceAccountId: rule.sourceAccountId,
          destinationAccountId: rule.destinationAccountId,
        };
      } else {
        if (!rule.accountId) {
          setError("This rule is missing its account.");
          return;
        }

        body = {
          status: "OVERRIDDEN",
          amount,
          postedAtDate: overrideDate,
          description,
          accountId: rule.accountId,
          direction:
            rule.kind === "EXPENSE"
              ? "OUTFLOW"
              : rule.kind === "INCOME"
                ? "INFLOW"
                : (rule.direction ?? "OUTFLOW"),
          categoryId: rule.categoryId,
          counterparty: rule.counterparty,
        };
      }
    }

    try {
      await upsertOccurrence.mutateAsync({
        id: rule.id,
        month: exceptionMonth,
        body,
      });
      setExceptionOpen(false);
    } catch (submitError) {
      setError(describeError(submitError));
    }
  };

  const occurrences = occurrencesQuery.data ?? [];

  return (
    <Screen
      kicker={TRANSACTION_KIND_LABELS[rule.kind]}
      title={rule.name}
      showBack
      refreshing={ruleQuery.isRefetching || occurrencesQuery.isRefetching}
      onRefresh={() =>
        Promise.all([ruleQuery.refetch(), occurrencesQuery.refetch()])
      }
      headerRight={
        <>
          <IconButton
            accessibilityLabel="Edit rule"
            icon={
              <Ionicons
                name="create-outline"
                size={18}
                color={colors.textPrimary}
              />
            }
            onPress={() =>
              router.push({
                pathname: "/recurring/upsert",
                params: { id: rule.id },
              })
            }
          />
          <IconButton
            accessibilityLabel="Delete rule"
            icon={
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
            }
            onPress={() => setConfirmDelete(true)}
          />
        </>
      }
    >
      {!rule.isActive ? (
        <Card surface="muted">
          <AppText variant="footnote" tone="secondary">
            This rule is paused — months pass without posting anything.
          </AppText>
        </Card>
      ) : null}

      {rule.lastMaterializationError ? (
        <Card surface="danger">
          <AppText variant="footnote" tone="danger">
            Last materialisation failed: {rule.lastMaterializationError}
          </AppText>
        </Card>
      ) : null}

      <Card>
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", gap: spacing.xl }}>
            <Stat
              label="Amount"
              value={rule.amount.toLocaleString("en-GB", {
                maximumFractionDigits: 2,
              })}
              style={{ flex: 1 }}
            />
            <Stat
              label="Day"
              value={`${rule.dayOfMonth}`}
              note="of each month"
              style={{ flex: 1 }}
            />
            <Stat
              label="Since"
              value={format.date(rule.startDate.slice(0, 10))}
              style={{ flex: 1.4 }}
            />
          </View>
          {rule.endDate ? (
            <AppText variant="caption" tone="tertiary">
              Ends {format.date(rule.endDate.slice(0, 10))}
            </AppText>
          ) : null}
          <View style={{ gap: 4 }}>
            {rule.kind === "TRANSFER" ? (
              <AppText variant="footnote" tone="secondary">
                {(rule.sourceAccountId
                  ? (accountNames.get(rule.sourceAccountId) ?? "?")
                  : "?") +
                  " → " +
                  (rule.destinationAccountId
                    ? (accountNames.get(rule.destinationAccountId) ?? "?")
                    : "?")}
              </AppText>
            ) : (
              <AppText variant="footnote" tone="secondary">
                {rule.accountId
                  ? (accountNames.get(rule.accountId) ?? "Unknown account")
                  : "No account"}
                {rule.secondaryCategoryName || rule.primaryCategoryName
                  ? ` • ${rule.secondaryCategoryName ?? rule.primaryCategoryName}`
                  : ""}
              </AppText>
            )}
            <AppText variant="footnote" tone="tertiary">
              Posts as “{rule.description}”
            </AppText>
          </View>
        </View>
      </Card>

      <Section
        kicker="Exceptions"
        title="Month overrides"
        description="Skip a month or change just one occurrence."
        action={
          <IconButton
            accessibilityLabel="Add exception"
            icon={<Ionicons name="add" size={18} color={colors.textPrimary} />}
            onPress={() => {
              setError(null);
              setOverrideAmount(`${rule.amount}`);
              setOverrideDescription(rule.description);
              setExceptionOpen(true);
            }}
          />
        }
      >
        {occurrencesQuery.isPending ? (
          <SkeletonCard lines={2} />
        ) : occurrences.length === 0 ? (
          <Card surface="muted">
            <AppText variant="footnote" tone="secondary">
              No exceptions — every month follows the rule.
            </AppText>
          </Card>
        ) : (
          <Card style={{ paddingVertical: 4 }}>
            {occurrences.map((occurrence, index) => (
              <ListRow
                key={occurrence.id}
                showDivider={index < occurrences.length - 1}
                title={format.month(occurrence.occurrenceMonth)}
                subtitle={
                  occurrence.status === "SKIPPED"
                    ? "Skipped"
                    : `Overridden · ${occurrence.amount?.toLocaleString(
                        "en-GB",
                      )} on ${
                        occurrence.postedAtDate
                          ? format.date(occurrence.postedAtDate.slice(0, 10))
                          : "?"
                      }`
                }
                right={
                  <IconButton
                    accessibilityLabel={`Remove exception for ${occurrence.occurrenceMonth}`}
                    icon={
                      <Ionicons name="close" size={15} color={colors.danger} />
                    }
                    style={{ width: 30, height: 30, borderRadius: 15 }}
                    onPress={() =>
                      clearOccurrence.mutate({
                        id: rule.id,
                        month: occurrence.occurrenceMonth,
                      })
                    }
                  />
                }
              />
            ))}
          </Card>
        )}
      </Section>

      <Sheet
        visible={exceptionOpen}
        onClose={() => setExceptionOpen(false)}
        title="Month exception"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <SelectField
            label="Month"
            options={monthChoices}
            value={exceptionMonth}
            onChange={setExceptionMonth}
          />
          <SegmentedControl
            options={[
              { value: "SKIPPED", label: "Skip month" },
              { value: "OVERRIDDEN", label: "Override" },
            ]}
            value={exceptionMode}
            onChange={setExceptionMode}
          />
          {exceptionMode === "OVERRIDDEN" ? (
            <>
              <AmountField
                label="Amount"
                value={overrideAmount}
                onChangeText={setOverrideAmount}
              />
              <DateField
                label="Post on"
                value={overrideDate}
                onChange={setOverrideDate}
              />
              <TextField
                label="Description"
                value={overrideDescription}
                onChangeText={setOverrideDescription}
              />
            </>
          ) : (
            <AppText variant="footnote" tone="secondary">
              Nothing is posted for the selected month.
            </AppText>
          )}
          {error ? (
            <Card surface="danger">
              <AppText variant="footnote" tone="danger">
                {error}
              </AppText>
            </Card>
          ) : null}
          <Button
            label="Save exception"
            onPress={submitException}
            loading={upsertOccurrence.isPending}
          />
        </View>
      </Sheet>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete rule?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            “{rule.name}” stops generating future months. Already-posted
            transactions stay in your history.
          </AppText>
          <Button
            label="Delete rule"
            variant="danger"
            loading={deleteMutation.isPending}
            onPress={async () => {
              try {
                await deleteMutation.mutateAsync(rule.id);
                setConfirmDelete(false);
                router.back();
              } catch (deleteError) {
                setConfirmDelete(false);
                setError(describeError(deleteError));
              }
            }}
          />
          <Button
            label="Keep it"
            variant="secondary"
            onPress={() => setConfirmDelete(false)}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
