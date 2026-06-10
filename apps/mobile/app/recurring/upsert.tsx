import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type {
  TransactionKind,
  UpsertRecurringTransactionRuleRequest,
} from "@finhance/shared";

import {
  useAccountsList,
  useCategories,
  useCreateRecurringRule,
  useRecurringRule,
  useUpdateRecurringRule,
} from "@/api/queries";
import {
  AmountField,
  AppText,
  Button,
  Card,
  DateField,
  describeError,
  ErrorState,
  Field,
  LoadingState,
  Screen,
  SegmentedControl,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/ui";
import { todayLocalDate } from "@/lib/dates";
import { parseAmountInput } from "@/lib/money";
import { spacing } from "@/theme";

const KIND_OPTIONS = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
  { value: "TRANSFER", label: "Transfer" },
] as const;

export default function RecurringUpsertScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const ruleId = params.id ?? null;
  const isEdit = Boolean(ruleId);

  const ruleQuery = useRecurringRule(ruleId);
  const accountsQuery = useAccountsList(false);
  const categoriesQuery = useCategories(false);

  const createMutation = useCreateRecurringRule();
  const updateMutation = useUpdateRecurringRule();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<TransactionKind>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState(todayLocalDate());
  const [hasEnd, setHasEnd] = useState(false);
  const [endDate, setEndDate] = useState(todayLocalDate());
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<
    string | null
  >(null);
  const [counterparty, setCounterparty] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isEdit && ruleQuery.data && !hydrated) {
      const rule = ruleQuery.data;
      setName(rule.name);
      setKind(rule.kind);
      setAmount(`${rule.amount}`);
      setDayOfMonth(`${rule.dayOfMonth}`);
      setStartDate(rule.startDate.slice(0, 10));
      setHasEnd(rule.endDate !== null);

      if (rule.endDate) {
        setEndDate(rule.endDate.slice(0, 10));
      }

      setAccountId(rule.accountId);
      setCategoryId(rule.categoryId);
      setSourceAccountId(rule.sourceAccountId);
      setDestinationAccountId(rule.destinationAccountId);
      setCounterparty(rule.counterparty ?? "");
      setDescription(rule.description);
      setNotes(rule.notes ?? "");
      setIsActive(rule.isActive);
      setHydrated(true);
    }
  }, [isEdit, ruleQuery.data, hydrated]);

  const accountOptions = useMemo(
    () =>
      (accountsQuery.data ?? []).map((account) => ({
        value: account.id,
        label: account.name,
        detail: account.currency,
      })),
    [accountsQuery.data],
  );

  const categoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter(
          (category) =>
            category.type === (kind === "INCOME" ? "INCOME" : "EXPENSE"),
        )
        .map((category) => ({
          value: category.id,
          label: category.parentCategoryName
            ? `${category.parentCategoryName} · ${category.name}`
            : category.name,
        })),
    [categoriesQuery.data, kind],
  );

  const submit = async () => {
    setServerError(null);
    const nextErrors: Partial<Record<string, string>> = {};
    const parsedAmount = parseAmountInput(amount);
    const parsedDay = Number(dayOfMonth);

    if (!name.trim()) {
      nextErrors.name = "Name the rule.";
    }

    if (parsedAmount === null || parsedAmount <= 0) {
      nextErrors.amount = "Enter a positive amount.";
    }

    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      nextErrors.dayOfMonth = "Day must be between 1 and 31.";
    }

    if (!description.trim()) {
      nextErrors.description = "Posted transactions need a description.";
    }

    if (kind === "TRANSFER") {
      if (!sourceAccountId) {
        nextErrors.sourceAccountId = "Pick the source account.";
      }

      if (!destinationAccountId) {
        nextErrors.destinationAccountId = "Pick the destination account.";
      }

      if (
        sourceAccountId &&
        destinationAccountId &&
        sourceAccountId === destinationAccountId
      ) {
        nextErrors.destinationAccountId = "Use two different accounts.";
      }
    } else {
      if (!accountId) {
        nextErrors.accountId = "Pick an account.";
      }

      if (!categoryId) {
        nextErrors.categoryId = "Pick a category.";
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const body: UpsertRecurringTransactionRuleRequest = {
      name: name.trim(),
      kind,
      amount: parsedAmount as number,
      dayOfMonth: parsedDay,
      startDate,
      endDate: hasEnd ? endDate : null,
      description: description.trim(),
      notes: notes.trim() || null,
      isActive,
      ...(kind === "TRANSFER"
        ? {
            sourceAccountId,
            destinationAccountId,
            accountId: null,
            categoryId: null,
            counterparty: null,
            direction: null,
          }
        : {
            accountId,
            categoryId,
            counterparty: counterparty.trim() || null,
            direction: kind === "EXPENSE" ? "OUTFLOW" : "INFLOW",
            sourceAccountId: null,
            destinationAccountId: null,
          }),
    };

    try {
      if (isEdit && ruleId) {
        await updateMutation.mutateAsync({ id: ruleId, body });
      } else {
        await createMutation.mutateAsync(body);
      }
      router.back();
    } catch (error) {
      setServerError(describeError(error));
    }
  };

  if (isEdit && ruleQuery.isPending) {
    return (
      <Screen title="Edit rule" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (isEdit && ruleQuery.isError) {
    return (
      <Screen title="Edit rule" showBack>
        <ErrorState
          error={ruleQuery.error}
          onRetry={() => ruleQuery.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen title={isEdit ? "Edit rule" : "New recurring rule"} showBack>
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
        <TextField
          label="Rule name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Rent"
          error={errors.name}
          autoFocus={!isEdit}
        />

        {!isEdit ? (
          <Field label="Kind">
            <SegmentedControl
              options={KIND_OPTIONS}
              value={kind as (typeof KIND_OPTIONS)[number]["value"]}
              onChange={(value) => {
                setKind(value);
                setCategoryId(null);
              }}
            />
          </Field>
        ) : null}

        <AmountField
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          error={errors.amount}
        />

        <TextField
          label="Day of month"
          value={dayOfMonth}
          onChangeText={setDayOfMonth}
          keyboardType="number-pad"
          error={errors.dayOfMonth}
          hint="Months without that day post on their last day."
        />

        {kind === "TRANSFER" ? (
          <>
            <SelectField
              label="From account"
              options={accountOptions}
              value={sourceAccountId}
              onChange={setSourceAccountId}
              error={errors.sourceAccountId}
            />
            <SelectField
              label="To account"
              options={accountOptions}
              value={destinationAccountId}
              onChange={setDestinationAccountId}
              error={errors.destinationAccountId}
            />
          </>
        ) : (
          <>
            <SelectField
              label="Account"
              options={accountOptions}
              value={accountId}
              onChange={setAccountId}
              error={errors.accountId}
            />
            <SelectField
              label="Category"
              options={categoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              error={errors.categoryId}
            />
            <TextField
              label={
                kind === "EXPENSE" ? "Payee (optional)" : "Payer (optional)"
              }
              value={counterparty}
              onChangeText={setCounterparty}
            />
          </>
        )}

        <TextField
          label="Posted description"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Monthly rent"
          error={errors.description}
        />

        <DateField label="Starts" value={startDate} onChange={setStartDate} />
        <SwitchField
          label="Has an end date"
          value={hasEnd}
          onChange={setHasEnd}
        />
        {hasEnd ? (
          <DateField label="Ends" value={endDate} onChange={setEndDate} />
        ) : null}

        <SwitchField
          label="Active"
          description="Paused rules keep history but stop posting."
          value={isActive}
          onChange={setIsActive}
        />

        <TextField
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        {serverError ? (
          <Card surface="danger">
            <AppText variant="footnote" tone="danger">
              {serverError}
            </AppText>
          </Card>
        ) : null}

        <Button
          label={isEdit ? "Save changes" : "Create rule"}
          onPress={submit}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      </View>
    </Screen>
  );
}
