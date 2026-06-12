import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import {
  useCategories,
  useClearBudgetOverride,
  useCreateBudget,
  useDeleteBudget,
  useMonthlyBudget,
  useUpdateBudget,
  useUpsertBudgetOverride,
} from "@/api/queries";
import {
  AmountField,
  AppText,
  Button,
  Card,
  describeError,
  Divider,
  ErrorState,
  LoadingState,
  Screen,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/ui";
import { addMonths, currentMonth, formatMonthLabel } from "@/lib/dates";
import { formatMoney, parseAmountInput } from "@/lib/money";
import { spacing } from "@/theme";

function monthOptions(center: string, back: number, forward: number) {
  const options: { value: string; label: string }[] = [];

  for (let offset = -back; offset <= forward; offset += 1) {
    const value = addMonths(center, offset);
    options.push({ value, label: formatMonthLabel(value) });
  }

  return options.reverse();
}

export default function BudgetUpsertScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    month?: string;
    categoryId?: string;
    currency?: string;
  }>();
  const budgetId = params.id ?? null;
  const isEdit = Boolean(budgetId);
  const contextMonth =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : currentMonth();

  const monthlyQuery = useMonthlyBudget(contextMonth);
  const categoriesQuery = useCategories(false);

  const createMutation = useCreateBudget();
  const updateMutation = useUpdateBudget();
  const deleteMutation = useDeleteBudget();
  const overrideMutation = useUpsertBudgetOverride();
  const clearOverrideMutation = useClearBudgetOverride();

  const editedItem = useMemo(
    () =>
      budgetId
        ? (monthlyQuery.data?.currencies
            .flatMap((currency) => currency.items)
            .find((item) => item.budgetId === budgetId) ?? null)
        : null,
    [budgetId, monthlyQuery.data],
  );

  const [categoryId, setCategoryId] = useState<string | null>(
    params.categoryId ?? null,
  );
  const [currency, setCurrency] = useState(params.currency ?? "EUR");
  const [amount, setAmount] = useState("");
  const [startMonth, setStartMonth] = useState(contextMonth);
  const [hasEnd, setHasEnd] = useState(false);
  const [endMonth, setEndMonth] = useState(addMonths(contextMonth, 11));
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string>>
  >({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isEdit && editedItem && !hydrated) {
      setCategoryId(editedItem.categoryId);
      setCurrency(editedItem.currency);
      setAmount(`${editedItem.budgetAmount}`);
      setStartMonth(editedItem.startMonth);
      setHasEnd(editedItem.endMonth !== null);

      if (editedItem.endMonth) {
        setEndMonth(editedItem.endMonth);
      }

      if (editedItem.override) {
        setOverrideAmount(`${editedItem.override.amount}`);
        setOverrideNote(editedItem.override.note ?? "");
      }

      setHydrated(true);
    }
  }, [isEdit, editedItem, hydrated]);

  const expenseCategoryOptions = useMemo(
    () =>
      (categoriesQuery.data ?? [])
        .filter((category) => category.type === "EXPENSE")
        .map((category) => ({
          value: category.id,
          label: category.parentCategoryName
            ? `${category.parentCategoryName} · ${category.name}`
            : category.name,
        })),
    [categoriesQuery.data],
  );

  const months = useMemo(
    () => monthOptions(contextMonth, 18, 18),
    [contextMonth],
  );

  const saving =
    createMutation.isPending ||
    updateMutation.isPending ||
    overrideMutation.isPending;

  const submit = async () => {
    setError(null);
    const nextErrors: Partial<Record<string, string>> = {};
    const parsedAmount = parseAmountInput(amount);

    if (parsedAmount === null || parsedAmount <= 0) {
      nextErrors.amount = "Enter a positive monthly amount.";
    }

    if (!isEdit && !categoryId) {
      nextErrors.categoryId = "Pick an expense category.";
    }

    if (!isEdit && !/^[A-Z]{3}$/.test(currency.trim().toUpperCase())) {
      nextErrors.currency = "Use a 3-letter code.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    try {
      if (isEdit && budgetId) {
        await updateMutation.mutateAsync({
          id: budgetId,
          body: {
            amount: parsedAmount as number,
            effectiveMonth: contextMonth,
            endMonth: hasEnd ? endMonth : null,
          },
        });
      } else {
        await createMutation.mutateAsync({
          categoryId: categoryId as string,
          currency: currency.trim().toUpperCase(),
          amount: parsedAmount as number,
          startMonth,
          endMonth: hasEnd ? endMonth : null,
        });
      }
      router.back();
    } catch (submitError) {
      setError(describeError(submitError));
    }
  };

  const submitOverride = async () => {
    if (!budgetId) {
      return;
    }

    setError(null);
    const parsed = parseAmountInput(overrideAmount);

    if (parsed === null || parsed < 0) {
      setFieldErrors({ overrideAmount: "Enter the amount for this month." });
      return;
    }

    setFieldErrors({});

    try {
      await overrideMutation.mutateAsync({
        id: budgetId,
        month: contextMonth,
        body: { amount: parsed, note: overrideNote.trim() || null },
      });
      router.back();
    } catch (submitError) {
      setError(describeError(submitError));
    }
  };

  const clearOverride = async () => {
    if (!budgetId) {
      return;
    }

    setError(null);

    try {
      await clearOverrideMutation.mutateAsync({
        id: budgetId,
        month: contextMonth,
      });
      router.back();
    } catch (submitError) {
      setError(describeError(submitError));
    }
  };

  const endBudget = async () => {
    if (!budgetId) {
      return;
    }

    setError(null);

    try {
      await deleteMutation.mutateAsync({
        id: budgetId,
        effectiveMonth: contextMonth,
      });
      router.back();
    } catch (submitError) {
      setError(describeError(submitError));
    }
  };

  if (isEdit && monthlyQuery.isPending) {
    return (
      <Screen title="Edit budget" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (isEdit && (monthlyQuery.isError || !editedItem)) {
    return (
      <Screen title="Edit budget" showBack>
        <ErrorState
          error={
            monthlyQuery.error ??
            new Error("This budget does not apply to the selected month.")
          }
          onRetry={() => monthlyQuery.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={isEdit ? "Edit budget" : "New budget"}
      showBack
      kicker={formatMonthLabel(contextMonth)}
    >
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
        {isEdit && editedItem ? (
          <Card surface="muted">
            <View style={{ gap: 4 }}>
              <AppText variant="title3">
                {editedItem.primaryCategoryName &&
                editedItem.secondaryCategoryName
                  ? `${editedItem.primaryCategoryName} · ${editedItem.secondaryCategoryName}`
                  : editedItem.categoryName}
              </AppText>
              <AppText variant="footnote" tone="secondary">
                Spent {formatMoney(editedItem.spentAmount, editedItem.currency)}{" "}
                of {formatMoney(editedItem.budgetAmount, editedItem.currency)}{" "}
                in {formatMonthLabel(contextMonth)}.
              </AppText>
            </View>
          </Card>
        ) : (
          <>
            <SelectField
              label="Expense category"
              options={expenseCategoryOptions}
              value={categoryId}
              onChange={setCategoryId}
              error={fieldErrors.categoryId}
            />
            <TextField
              label="Currency"
              value={currency}
              onChangeText={(value) => setCurrency(value.toUpperCase())}
              autoCapitalize="characters"
              placeholder="EUR"
              error={fieldErrors.currency}
              hint="Budgets track spending in one currency."
            />
          </>
        )}

        <AmountField
          label="Monthly amount"
          value={amount}
          onChangeText={setAmount}
          currency={isEdit ? editedItem?.currency : currency}
          error={fieldErrors.amount}
          hint={
            isEdit
              ? `Changes apply from ${formatMonthLabel(contextMonth)} onward.`
              : undefined
          }
        />

        {!isEdit ? (
          <SelectField
            label="Starts in"
            options={months}
            value={startMonth}
            onChange={setStartMonth}
          />
        ) : null}

        <SwitchField
          label="Has an end month"
          description="Leave off for an open-ended plan."
          value={hasEnd}
          onChange={setHasEnd}
        />
        {hasEnd ? (
          <SelectField
            label="Last month"
            options={months}
            value={endMonth}
            onChange={setEndMonth}
          />
        ) : null}

        {error ? (
          <Card surface="danger">
            <AppText variant="footnote" tone="danger">
              {error}
            </AppText>
          </Card>
        ) : null}

        <Button
          label={isEdit ? "Save plan changes" : "Create budget"}
          onPress={submit}
          loading={saving}
        />

        {isEdit && editedItem ? (
          <>
            <Divider />
            <View style={{ gap: spacing.md }}>
              <AppText variant="title3">
                Override for {formatMonthLabel(contextMonth)} only
              </AppText>
              <AppText variant="footnote" tone="secondary">
                Use a one-off amount this month without changing the ongoing
                plan.
              </AppText>
              <AmountField
                label="This month's amount"
                value={overrideAmount}
                onChangeText={setOverrideAmount}
                currency={editedItem.currency}
                error={fieldErrors.overrideAmount}
              />
              <TextField
                label="Note (optional)"
                value={overrideNote}
                onChangeText={setOverrideNote}
                placeholder="e.g. Holiday month"
              />
              <Button
                label={editedItem.override ? "Update override" : "Set override"}
                variant="secondary"
                onPress={submitOverride}
                loading={overrideMutation.isPending}
              />
              {editedItem.override ? (
                <Button
                  label="Remove override"
                  variant="ghost"
                  onPress={clearOverride}
                  loading={clearOverrideMutation.isPending}
                />
              ) : null}
            </View>

            <Divider />
            <View style={{ gap: spacing.sm }}>
              <AppText variant="title3" tone="danger">
                End this budget
              </AppText>
              <AppText variant="footnote" tone="secondary">
                Stops the plan from {formatMonthLabel(contextMonth)} onward.
                Earlier months keep their history.
              </AppText>
              <Button
                label="End budget"
                variant="danger"
                onPress={endBudget}
                loading={deleteMutation.isPending}
              />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
