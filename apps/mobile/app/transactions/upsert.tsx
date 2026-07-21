import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import type {
  AccountResponse,
  AiTransactionDraft,
  TransactionKind,
} from "@finhance/shared";

import {
  useAccountsList,
  useCategories,
  useCreateTransaction,
  useDeleteTransaction,
  useExpenseValidationRules,
  useTransaction,
  useTransactionDraft,
  useUpdateTransaction,
} from "@/api/queries";
import {
  AmountField,
  AppText,
  Button,
  Card,
  Chip,
  DateField,
  describeError,
  ErrorState,
  Field,
  IconButton,
  LoadingState,
  Screen,
  SegmentedControl,
  SelectField,
  Sheet,
  TextField,
} from "@/components/ui";
import {
  buildTransactionRequest,
  applyTransactionDraft,
  emptyTransactionForm,
  formFromTransaction,
  matchExpenseRule,
  type TransactionFormErrors,
  type TransactionFormState,
} from "@/features/transactions/form";
import {
  categoryLabel,
  isAssignableTransactionCategory,
} from "@/lib/categories";
import { parseAmountInput } from "@/lib/money";
import { useFormatters } from "@/prefs";
import { spacing, useTheme } from "@/theme";

const CREATE_KIND_OPTIONS = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "ADJUSTMENT", label: "Adjust" },
] as const;

const STANDARD_KIND_OPTIONS = [
  { value: "EXPENSE", label: "Expense" },
  { value: "INCOME", label: "Income" },
  { value: "ADJUSTMENT", label: "Adjust" },
] as const;

function accountOption(account: AccountResponse) {
  return {
    value: account.id,
    label: account.name,
    detail: `${account.currency}${account.archivedAt ? " · Archived" : ""}`,
  };
}

function buildQuickAddNotice(draft: AiTransactionDraft): string {
  if (draft.parsedBy === "groq") {
    return "AI-assisted draft applied — review every field before saving. This is not financial advice.";
  }

  if (draft.cloudAttempted) {
    return "Cloud processing was attempted, but basic parsing supplied this draft. Review every field before saving.";
  }

  return "Basic private parsing applied this draft. You can enable cloud-enhanced drafts in App settings.";
}

export default function TransactionUpsertScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const format = useFormatters();
  const params = useLocalSearchParams<{ id?: string }>();
  const transactionId = params.id ?? null;
  const isEdit = Boolean(transactionId);

  const transactionQuery = useTransaction(transactionId);
  const accountsQuery = useAccountsList(true);
  const categoriesQuery = useCategories(true);
  const rulesQuery = useExpenseValidationRules();

  const createMutation = useCreateTransaction();
  const updateMutation = useUpdateTransaction();
  const deleteMutation = useDeleteTransaction();
  const draftMutation = useTransactionDraft();

  const [form, setForm] = useState<TransactionFormState>(emptyTransactionForm);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [quickAddNotice, setQuickAddNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  useEffect(() => {
    if (
      isEdit &&
      transactionQuery.data &&
      hydratedId !== transactionQuery.data.id
    ) {
      setForm(formFromTransaction(transactionQuery.data));
      setHydratedId(transactionQuery.data.id);
    }
  }, [isEdit, transactionQuery.data, hydratedId]);

  const update = (patch: Partial<TransactionFormState>) => {
    setForm((previous) => ({ ...previous, ...patch }));
    setServerError(null);
  };

  const accounts = useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const selectableAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          !account.archivedAt ||
          [
            form.accountId,
            form.sourceAccountId,
            form.destinationAccountId,
            ...form.legs.map((leg) => leg.accountId),
          ].includes(account.id),
      ),
    [accounts, form],
  );

  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );
  const categoryType = form.kind === "INCOME" ? "INCOME" : "EXPENSE";
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((category) =>
          isAssignableTransactionCategory(
            category,
            categoryType,
            form.categoryId,
          ),
        )
        .map((category) => ({
          value: category.id,
          label: categoryLabel(category),
        })),
    [categories, categoryType, form.categoryId],
  );

  const expenseRules = rulesQuery.data ?? [];
  const ruleMatch =
    form.kind === "EXPENSE" && !form.categoryId
      ? matchExpenseRule(form.description, expenseRules)
      : null;

  const selectedAccount = form.accountId
    ? accountsById.get(form.accountId)
    : null;
  const sourceAccount = form.sourceAccountId
    ? accountsById.get(form.sourceAccountId)
    : null;
  const destinationAccount = form.destinationAccountId
    ? accountsById.get(form.destinationAccountId)
    : null;
  const crossCurrency =
    form.kind === "TRANSFER" &&
    sourceAccount &&
    destinationAccount &&
    sourceAccount.currency !== destinationAccount.currency;

  const splitTotal = form.legs.reduce(
    (sum, leg) => sum + (parseAmountInput(leg.amount) ?? 0),
    0,
  );

  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = async () => {
    const result = buildTransactionRequest(form, accountsById, expenseRules);
    setErrors(result.errors);

    if (!result.request) {
      return;
    }

    try {
      if (isEdit && transactionId) {
        await updateMutation.mutateAsync({
          id: transactionId,
          body: result.request,
        });
      } else {
        await createMutation.mutateAsync(result.request);
      }
      router.back();
    } catch (submitError) {
      setServerError(describeError(submitError));
    }
  };

  const handleDelete = async () => {
    if (!transactionId) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(transactionId);
      setConfirmDelete(false);
      router.back();
    } catch (deleteError) {
      setConfirmDelete(false);
      setServerError(describeError(deleteError));
    }
  };

  const handleQuickAdd = async () => {
    const text = quickAddText.trim();
    if (!text) {
      setQuickAddError("Describe the transaction first.");
      return;
    }

    setQuickAddError(null);
    setQuickAddNotice(null);

    try {
      const draft = await draftMutation.mutateAsync({
        text,
        source: "freeform",
      });
      setForm((previous) =>
        applyTransactionDraft(previous, draft, accounts, expenseRules),
      );
      setErrors({});
      setServerError(null);
      setQuickAddNotice(buildQuickAddNotice(draft));
    } catch (draftError) {
      setQuickAddError(describeError(draftError));
    }
  };

  const dataPending =
    accountsQuery.isPending ||
    categoriesQuery.isPending ||
    (isEdit && transactionQuery.isPending);

  const dataError =
    accountsQuery.error ??
    categoriesQuery.error ??
    (isEdit ? transactionQuery.error : null);

  if (dataPending) {
    return (
      <Screen title={isEdit ? "Edit transaction" : "New transaction"} showBack>
        <LoadingState label="Loading form…" />
      </Screen>
    );
  }

  if (dataError) {
    return (
      <Screen title={isEdit ? "Edit transaction" : "New transaction"} showBack>
        <ErrorState
          error={dataError}
          onRetry={() => {
            accountsQuery.refetch();
            categoriesQuery.refetch();
            if (isEdit) {
              transactionQuery.refetch();
            }
          }}
        />
      </Screen>
    );
  }

  const editingTransfer = isEdit && form.kind === "TRANSFER";
  const kindOptions = editingTransfer
    ? null
    : isEdit
      ? STANDARD_KIND_OPTIONS
      : CREATE_KIND_OPTIONS;

  return (
    <Screen
      title={isEdit ? "Edit transaction" : "New transaction"}
      showBack
      headerRight={
        isEdit ? (
          <IconButton
            accessibilityLabel="Delete transaction"
            icon={
              <Ionicons name="trash-outline" size={17} color={colors.danger} />
            }
            onPress={() => setConfirmDelete(true)}
          />
        ) : undefined
      }
    >
      <View style={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
        {transactionQuery.data?.isRecurringGenerated ? (
          <Card surface="info">
            <AppText variant="footnote" tone="secondary">
              This row was generated by a recurring rule. Edits apply to this
              posted transaction only.
            </AppText>
          </Card>
        ) : null}

        <Card surface="info">
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <AppText variant="kicker" tone="tertiary">
                DRAFT ONLY
              </AppText>
              <AppText variant="title3">Quick add</AppText>
              <AppText variant="footnote" tone="secondary">
                Type or dictate “14.50 pizza yesterday amex” and review the
                resulting transaction before saving.
              </AppText>
            </View>
            <TextField
              label="Transaction details"
              value={quickAddText}
              onChangeText={setQuickAddText}
              placeholder="e.g. 14.50 pizza yesterday amex"
              autoCapitalize="sentences"
              editable={!draftMutation.isPending}
            />
            {quickAddError ? (
              <AppText variant="caption" tone="danger">
                {quickAddError}
              </AppText>
            ) : null}
            {quickAddNotice ? (
              <>
                <AppText variant="footnote" tone="secondary">
                  {quickAddNotice}
                </AppText>
                {quickAddNotice.startsWith("Basic private parsing") ? (
                  <Button
                    label="Open App settings"
                    variant="ghost"
                    size="sm"
                    onPress={() => router.push("/settings/app" as Href)}
                  />
                ) : null}
              </>
            ) : null}
            <Button
              label="Prepare draft"
              variant="secondary"
              onPress={handleQuickAdd}
              loading={draftMutation.isPending}
            />
          </View>
        </Card>

        {kindOptions ? (
          <SegmentedControl
            options={kindOptions}
            value={form.kind as Exclude<TransactionKind, "TRANSFER">}
            onChange={(kind) =>
              update({
                kind: kind as TransactionKind,
                categoryId: null,
                split: false,
              })
            }
          />
        ) : (
          <Chip label="Transfer" tone="info" />
        )}

        {form.kind === "TRANSFER" ? (
          <>
            <SelectField
              label="From account"
              options={selectableAccounts.map(accountOption)}
              value={form.sourceAccountId}
              onChange={(value) => update({ sourceAccountId: value })}
              error={errors.sourceAccountId}
            />
            <SelectField
              label="To account"
              options={selectableAccounts.map(accountOption)}
              value={form.destinationAccountId}
              onChange={(value) => update({ destinationAccountId: value })}
              error={errors.destinationAccountId}
            />
            <AmountField
              label={`Amount${sourceAccount ? ` (${sourceAccount.currency})` : ""}`}
              value={form.amount}
              onChangeText={(value) => update({ amount: value })}
              currency={sourceAccount?.currency}
              error={errors.amount}
            />
            {crossCurrency && sourceAccount && destinationAccount ? (
              <Card surface="muted">
                <View style={{ gap: spacing.md }}>
                  <AppText variant="footnoteMedium" tone="secondary">
                    Cross-currency transfer — {sourceAccount.currency} →{" "}
                    {destinationAccount.currency}
                  </AppText>
                  <AmountField
                    label={`Received amount (${destinationAccount.currency})`}
                    value={form.destinationAmount}
                    onChangeText={(value) =>
                      update({ destinationAmount: value })
                    }
                    currency={destinationAccount.currency}
                    error={errors.destinationAmount}
                    hint="Leave empty to convert with the live rate."
                  />
                  <AmountField
                    label="Manual FX rate (optional)"
                    value={form.fxRate}
                    onChangeText={(value) => update({ fxRate: value })}
                    error={errors.fxRate}
                    placeholder="e.g. 1.0842"
                    hint={`1 ${sourceAccount.currency} = ? ${destinationAccount.currency}`}
                  />
                </View>
              </Card>
            ) : null}
          </>
        ) : (
          <>
            {form.kind === "EXPENSE" && !isEdit ? (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Chip
                  label="Single account"
                  selected={!form.split}
                  onPress={() => update({ split: false })}
                />
                <Chip
                  label="Split across accounts"
                  selected={form.split}
                  onPress={() => update({ split: true })}
                />
              </View>
            ) : null}
            {form.kind === "EXPENSE" && isEdit && form.split ? (
              <Chip label="Split expense" tone="info" />
            ) : null}

            {form.split ? (
              <Card surface="muted">
                <View style={{ gap: spacing.lg }}>
                  <AppText variant="footnoteMedium" tone="secondary">
                    Funding accounts
                  </AppText>
                  {form.legs.map((leg, index) => (
                    <View
                      key={index}
                      style={{
                        flexDirection: "row",
                        gap: spacing.sm,
                        alignItems: "flex-end",
                      }}
                    >
                      <View style={{ flex: 1.4 }}>
                        <SelectField
                          label={`Account ${index + 1}`}
                          options={selectableAccounts.map(accountOption)}
                          value={leg.accountId}
                          onChange={(value) => {
                            const legs = [...form.legs];
                            legs[index] = { ...legs[index]!, accountId: value };
                            update({ legs });
                          }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AmountField
                          label="Amount"
                          value={leg.amount}
                          onChangeText={(value) => {
                            const legs = [...form.legs];
                            legs[index] = { ...legs[index]!, amount: value };
                            update({ legs });
                          }}
                          currency={
                            leg.accountId
                              ? accountsById.get(leg.accountId)?.currency
                              : undefined
                          }
                        />
                      </View>
                      {form.legs.length > 2 ? (
                        <IconButton
                          accessibilityLabel={`Remove leg ${index + 1}`}
                          icon={
                            <Ionicons
                              name="remove"
                              size={18}
                              color={colors.danger}
                            />
                          }
                          onPress={() =>
                            update({
                              legs: form.legs.filter(
                                (_, legIndex) => legIndex !== index,
                              ),
                            })
                          }
                        />
                      ) : null}
                    </View>
                  ))}
                  <Button
                    label="Add account"
                    variant="secondary"
                    size="sm"
                    onPress={() =>
                      update({
                        legs: [...form.legs, { accountId: null, amount: "" }],
                      })
                    }
                  />
                  {errors.legs ? (
                    <AppText variant="caption" tone="danger">
                      {errors.legs}
                    </AppText>
                  ) : null}
                  <AppText variant="footnote" tone="secondary">
                    Total:{" "}
                    {format.money(
                      splitTotal,
                      (form.legs[0]?.accountId
                        ? accountsById.get(form.legs[0].accountId)?.currency
                        : null) ?? "EUR",
                    )}
                  </AppText>
                </View>
              </Card>
            ) : (
              <>
                <AmountField
                  label="Amount"
                  value={form.amount}
                  onChangeText={(value) => update({ amount: value })}
                  currency={selectedAccount?.currency}
                  error={errors.amount}
                />
                <SelectField
                  label="Account"
                  options={selectableAccounts.map(accountOption)}
                  value={form.accountId}
                  onChange={(value) => update({ accountId: value })}
                  error={errors.accountId}
                />
              </>
            )}

            {form.kind === "ADJUSTMENT" ? (
              <Field label="Direction">
                <SegmentedControl
                  options={[
                    { value: "INFLOW", label: "Money in" },
                    { value: "OUTFLOW", label: "Money out" },
                  ]}
                  value={form.direction}
                  onChange={(direction) => update({ direction })}
                />
              </Field>
            ) : (
              <SelectField
                label="Category"
                options={categoryOptions}
                value={form.categoryId}
                onChange={(value) => update({ categoryId: value })}
                error={errors.categoryId}
                hint={
                  ruleMatch
                    ? `Auto-matches “${ruleMatch.primaryCategoryName} · ${ruleMatch.secondaryCategoryName}” from your rules.`
                    : undefined
                }
                placeholder={ruleMatch ? "Auto from rules" : "Select…"}
              />
            )}
          </>
        )}

        <TextField
          label="Description"
          value={form.description}
          onChangeText={(value) => update({ description: value })}
          error={errors.description}
          placeholder={
            form.kind === "TRANSFER" ? "e.g. Savings top-up" : "e.g. Groceries"
          }
          autoCapitalize="sentences"
        />

        {form.kind === "EXPENSE" || form.kind === "INCOME" ? (
          <TextField
            label={
              form.kind === "EXPENSE" ? "Payee (optional)" : "Payer (optional)"
            }
            value={form.counterparty}
            onChangeText={(value) => update({ counterparty: value })}
            placeholder={
              form.kind === "EXPENSE" ? "e.g. Esselunga" : "e.g. Employer"
            }
          />
        ) : null}

        <DateField
          label="Date"
          value={form.date}
          onChange={(value) => update({ date: value })}
        />

        {!form.split && form.kind !== "TRANSFER" && selectedAccount ? (
          <View style={{ gap: spacing.sm }}>
            <Chip
              label={
                form.nativeEnabled
                  ? "Paid in another currency ✓"
                  : "Paid in another currency?"
              }
              selected={form.nativeEnabled}
              onPress={() => update({ nativeEnabled: !form.nativeEnabled })}
            />
            {form.nativeEnabled ? (
              <Card surface="muted">
                <View style={{ gap: spacing.md }}>
                  <AppText variant="footnote" tone="secondary">
                    The amount above stays the settled{" "}
                    {selectedAccount.currency} amount. Record the merchant-side
                    original here.
                  </AppText>
                  <TextField
                    label="Original currency"
                    value={form.nativeCurrency}
                    onChangeText={(value) =>
                      update({ nativeCurrency: value.toUpperCase() })
                    }
                    placeholder="USD"
                    autoCapitalize="characters"
                    error={errors.nativeCurrency}
                  />
                  <AmountField
                    label="Original amount"
                    value={form.nativeAmount}
                    onChangeText={(value) => update({ nativeAmount: value })}
                    currency={form.nativeCurrency || undefined}
                    error={errors.nativeAmount}
                  />
                </View>
              </Card>
            ) : null}
          </View>
        ) : null}

        <TextField
          label="Notes (optional)"
          value={form.notes}
          onChangeText={(value) => update({ notes: value })}
          multiline
          placeholder="Anything worth remembering…"
        />

        {serverError ? (
          <Card surface="danger">
            <AppText variant="footnote" tone="danger">
              {serverError}
            </AppText>
          </Card>
        ) : null}

        <Button
          label={isEdit ? "Save changes" : "Add transaction"}
          onPress={handleSubmit}
          loading={saving}
        />
      </View>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete transaction?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            This permanently removes “{form.description || "this transaction"}”.
            {form.split ? " All split legs are removed together." : ""}
          </AppText>
          <Button
            label="Delete"
            variant="danger"
            onPress={handleDelete}
            loading={deleteMutation.isPending}
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
