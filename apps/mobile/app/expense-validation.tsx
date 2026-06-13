import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { View } from "react-native";
import type {
  ExpenseValidationRuleResponse,
  UpsertExpenseValidationRuleRequest,
} from "@finhance/shared";

import { useServerConnection } from "@/api/server-connection";
import {
  useCategories,
  useCreateExpenseValidationRule,
  useDeleteExpenseValidationRule,
  useExpenseValidationRules,
  useUpdateExpenseValidationRule,
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
  SelectField,
  Sheet,
  SkeletonCard,
  TextField,
} from "@/components/ui";
import {
  expensePrimaryCategories,
  expenseSecondaryCategories,
} from "@/lib/categories";
import { groupExpenseValidationRules } from "@/lib/expense-validation";
import { spacing, useTheme } from "@/theme";

interface RuleFormState {
  entry: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
}

function emptyFormState(): RuleFormState {
  return {
    entry: "",
    primaryCategoryId: "",
    secondaryCategoryId: "",
  };
}

export default function ExpenseValidationScreen() {
  const { colors } = useTheme();
  const { serverMode, serverUrl } = useServerConnection();
  const rulesQuery = useExpenseValidationRules();
  const categoriesQuery = useCategories(true);
  const createRule = useCreateExpenseValidationRule();
  const updateRule = useUpdateExpenseValidationRule();
  const deleteRule = useDeleteExpenseValidationRule();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] =
    useState<ExpenseValidationRuleResponse | null>(null);
  const [confirmDelete, setConfirmDelete] =
    useState<ExpenseValidationRuleResponse | null>(null);
  const [form, setForm] = useState<RuleFormState>(emptyFormState);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const categories = useMemo(
    () => categoriesQuery.data ?? [],
    [categoriesQuery.data],
  );
  const groupedRules = useMemo(
    () => groupExpenseValidationRules(rules),
    [rules],
  );
  const primaryOptions = useMemo(
    () =>
      expensePrimaryCategories(categories, form.primaryCategoryId).map(
        (category) => ({
          value: category.id,
          label: category.name,
        }),
      ),
    [categories, form.primaryCategoryId],
  );
  const secondaryOptions = useMemo(
    () =>
      form.primaryCategoryId
        ? expenseSecondaryCategories(
            categories,
            form.primaryCategoryId,
            form.secondaryCategoryId,
          ).map((category) => ({
            value: category.id,
            label: category.name,
          }))
        : [],
    [categories, form.primaryCategoryId, form.secondaryCategoryId],
  );

  const openCreate = () => {
    setEditingRule(null);
    setForm(emptyFormState());
    setEntryError(null);
    setCategoryError(null);
    setActionError(null);
    setFormOpen(true);
  };

  const openEdit = (rule: ExpenseValidationRuleResponse) => {
    setEditingRule(rule);
    setForm({
      entry: rule.entry,
      primaryCategoryId: rule.primaryCategoryId,
      secondaryCategoryId: rule.secondaryCategoryId,
    });
    setEntryError(null);
    setCategoryError(null);
    setActionError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingRule(null);
    setForm(emptyFormState());
    setEntryError(null);
    setCategoryError(null);
    setActionError(null);
  };

  const updateForm = <Field extends keyof RuleFormState>(
    field: Field,
    value: RuleFormState[Field],
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "primaryCategoryId" ? { secondaryCategoryId: "" } : {}),
    }));
  };

  const submit = async () => {
    setActionError(null);
    setEntryError(null);
    setCategoryError(null);

    const entry = form.entry.trim();
    if (!entry) {
      setEntryError("Entry is required.");
      return;
    }

    if (!form.secondaryCategoryId) {
      setCategoryError("Choose a secondary category.");
      return;
    }

    const body: UpsertExpenseValidationRuleRequest = {
      entry,
      secondaryCategoryId: form.secondaryCategoryId,
    };

    try {
      if (editingRule) {
        await updateRule.mutateAsync({ id: editingRule.id, body });
      } else {
        await createRule.mutateAsync(body);
      }
      closeForm();
    } catch (error) {
      setActionError(describeError(error));
    }
  };

  const openWebTools = () => {
    if (!serverUrl || serverMode !== "hosted") {
      return;
    }

    void WebBrowser.openBrowserAsync(`${serverUrl}/expense-validation`);
  };

  const isPending = rulesQuery.isPending || categoriesQuery.isPending;
  const isError = rulesQuery.isError || categoriesQuery.isError;
  const error = rulesQuery.error ?? categoriesQuery.error;

  return (
    <Screen
      kicker="Classification"
      title="Expense validation"
      showBack
      withTabBarClearance
      refreshing={rulesQuery.isRefetching || categoriesQuery.isRefetching}
      onRefresh={() => {
        void Promise.all([rulesQuery.refetch(), categoriesQuery.refetch()]);
      }}
      headerRight={
        <IconButton
          accessibilityLabel="Add rule"
          icon={<Ionicons name="add" size={20} color={colors.textPrimary} />}
          onPress={openCreate}
        />
      }
    >
      <Card surface="muted">
        <View style={{ gap: spacing.sm }}>
          <AppText variant="footnote" tone="secondary">
            Exact descriptions can fill expense categories during transaction
            entry.
          </AppText>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Chip label={`${rules.length} rules`} tone="neutral" />
            <Chip
              label={`${groupedRules.length} groups`}
              tone={groupedRules.length > 0 ? "accent" : "neutral"}
            />
          </View>
        </View>
      </Card>

      {isPending ? (
        <>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </>
      ) : isError ? (
        <ErrorState
          error={error}
          onRetry={() => {
            void Promise.all([rulesQuery.refetch(), categoriesQuery.refetch()]);
          }}
        />
      ) : rules.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="No validation rules yet"
          description="Create exact-match rules for frequent expense descriptions."
          actionLabel="New rule"
          onAction={openCreate}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          {groupedRules.map((group) => (
            <Section
              key={group.primaryCategoryName}
              kicker={group.primaryCategoryName}
              title={`${group.rules.length} rule${
                group.rules.length === 1 ? "" : "s"
              }`}
            >
              <Card style={{ paddingVertical: 4 }}>
                {group.rules.map((rule, index) => (
                  <ListRow
                    key={rule.id}
                    title={rule.entry}
                    subtitle={rule.secondaryCategoryName}
                    titleLines={2}
                    showDivider={index < group.rules.length - 1}
                    onPress={() => openEdit(rule)}
                    right={
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={colors.textTertiary}
                      />
                    }
                  />
                ))}
              </Card>
            </Section>
          ))}
        </View>
      )}

      <Section kicker="Bulk" title="CSV tools">
        <Card surface="info">
          <View style={{ gap: spacing.md }}>
            <AppText variant="footnote" tone="secondary">
              Rule and hierarchy CSV import/export stays in the web tools so
              file preview, downloads, and bulk apply remain auditable.
            </AppText>
            {serverMode === "hosted" && serverUrl ? (
              <Button
                label="Open web tools"
                size="sm"
                variant="secondary"
                onPress={openWebTools}
              />
            ) : (
              <AppText variant="caption" tone="tertiary">
                Open the web app from a trusted local browser session for CSV
                tools.
              </AppText>
            )}
          </View>
        </Card>
      </Section>

      <Sheet
        visible={formOpen}
        onClose={closeForm}
        title={editingRule ? "Edit rule" : "New rule"}
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <TextField
            label="Entry"
            value={form.entry}
            onChangeText={(value) => updateForm("entry", value)}
            placeholder="e.g. Grocery store"
            error={entryError}
            autoFocus={!editingRule}
          />
          <SelectField
            label="Primary category"
            options={primaryOptions}
            value={form.primaryCategoryId || null}
            onChange={(value) => updateForm("primaryCategoryId", value)}
            placeholder="Choose a primary"
            disabled={primaryOptions.length === 0}
          />
          <SelectField
            label="Secondary category"
            options={secondaryOptions}
            value={form.secondaryCategoryId || null}
            onChange={(value) => updateForm("secondaryCategoryId", value)}
            placeholder="Choose a secondary"
            disabled={!form.primaryCategoryId || secondaryOptions.length === 0}
            error={categoryError}
          />

          {actionError ? (
            <Card surface="danger">
              <AppText variant="footnote" tone="danger">
                {actionError}
              </AppText>
            </Card>
          ) : null}

          <Button
            label={editingRule ? "Save changes" : "Create rule"}
            onPress={submit}
            loading={createRule.isPending || updateRule.isPending}
          />
          {editingRule ? (
            <Button
              label="Delete rule"
              variant="danger"
              onPress={() => {
                setConfirmDelete(editingRule);
                setFormOpen(false);
              }}
            />
          ) : null}
          <Button label="Cancel" variant="secondary" onPress={closeForm} />
        </View>
      </Sheet>

      <Sheet
        visible={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete rule?"
      >
        <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
          <AppText variant="footnote" tone="secondary">
            {confirmDelete
              ? `"${confirmDelete.entry}" will stop auto-filling ${confirmDelete.secondaryCategoryName}.`
              : "This rule will be removed."}
          </AppText>
          <Button
            label="Delete"
            variant="danger"
            loading={deleteRule.isPending}
            onPress={async () => {
              if (!confirmDelete) {
                return;
              }

              try {
                await deleteRule.mutateAsync(confirmDelete.id);
                setConfirmDelete(null);
                closeForm();
              } catch (error) {
                setConfirmDelete(null);
                setFormOpen(true);
                setActionError(describeError(error));
              }
            }}
          />
          <Button
            label="Cancel"
            variant="secondary"
            onPress={() => {
              setConfirmDelete(null);
              if (editingRule) {
                setFormOpen(true);
              }
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
