"use client";

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type {
  CategoryResponse,
  ExpenseValidationRuleResponse,
  UpsertExpenseValidationRuleRequest,
} from "@finhance/shared";
import Modal from "@components/Modal";
import { fetchApiMutation, apiMutation } from "@lib/api";
import { formatCategoryName } from "@lib/categories";
import {
  expensePrimaryCategories,
  expenseSecondaryCategories,
} from "@lib/hierarchical-categories";
import { useSingleFlightActions } from "@lib/single-flight";

interface ExpenseValidationPageClientProps {
  categories: CategoryResponse[];
  rules: ExpenseValidationRuleResponse[];
}

interface RuleFormState {
  entry: string;
  primaryCategoryId: string;
  secondaryCategoryId: string;
}

interface ImportSummary {
  createdCount: number;
  updatedCount: number;
}

function emptyRuleFormState(): RuleFormState {
  return {
    entry: "",
    primaryCategoryId: "",
    secondaryCategoryId: "",
  };
}

export default function ExpenseValidationPageClient({
  categories,
  rules,
}: ExpenseValidationPageClientProps) {
  const router = useRouter();
  const rulesImportInputRef = useRef<HTMLInputElement | null>(null);
  const hierarchyImportInputRef = useRef<HTMLInputElement | null>(null);
  const actions = useSingleFlightActions<string>();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleFormState);
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(
    null,
  );
  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;

  const primaryCategories = useMemo(
    () => expensePrimaryCategories(categories, ruleForm.primaryCategoryId),
    [categories, ruleForm.primaryCategoryId],
  );
  const secondaryCategories = useMemo(
    () =>
      ruleForm.primaryCategoryId
        ? expenseSecondaryCategories(
            categories,
            ruleForm.primaryCategoryId,
            ruleForm.secondaryCategoryId,
          )
        : [],
    [categories, ruleForm.primaryCategoryId, ruleForm.secondaryCategoryId],
  );

  function openCreateModal() {
    setEditingRuleId(null);
    setRuleForm(emptyRuleFormState());
    setActionError(null);
    setImportSummary(null);
    setIsCreateModalOpen(true);
  }

  function openEditModal(rule: ExpenseValidationRuleResponse) {
    setEditingRuleId(rule.id);
    setRuleForm({
      entry: rule.entry,
      primaryCategoryId: rule.primaryCategoryId,
      secondaryCategoryId: rule.secondaryCategoryId,
    });
    setActionError(null);
    setImportSummary(null);
  }

  function closeModal() {
    setIsCreateModalOpen(false);
    setEditingRuleId(null);
    setRuleForm(emptyRuleFormState());
    setActionError(null);
  }

  function updateRuleForm<Field extends keyof RuleFormState>(
    field: Field,
    value: RuleFormState[Field],
  ) {
    setRuleForm((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "primaryCategoryId" ? { secondaryCategoryId: "" } : {}),
    }));
  }

  async function handleRuleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await actions.run("save-rule", async () => {
      setActionError(null);
      setImportSummary(null);

      const entry = ruleForm.entry.trim();
      if (!entry) {
        setActionError("Entry is required.");
        return;
      }

      if (!ruleForm.secondaryCategoryId) {
        setActionError("Select a secondary category.");
        return;
      }

      const payload: UpsertExpenseValidationRuleRequest = {
        entry,
        secondaryCategoryId: ruleForm.secondaryCategoryId,
      };

      setIsSubmitting(true);
      try {
        await apiMutation(
          editingRule
            ? `/expense-validation/${editingRule.id}`
            : "/expense-validation",
          {
            method: editingRule ? "PUT" : "POST",
            body: JSON.stringify(payload),
          },
        );
        closeModal();
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error ? error.message : "Unable to save this rule.",
        );
      } finally {
        setIsSubmitting(false);
      }
    });
  }

  async function handleDelete(ruleId: string) {
    await actions.run(`delete:${ruleId}`, async () => {
      setActionError(null);
      setImportSummary(null);
      setPendingDeleteRuleId(ruleId);

      try {
        await apiMutation<void>(`/expense-validation/${ruleId}`, {
          method: "DELETE",
        });
        if (editingRuleId === ruleId) {
          closeModal();
        }
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to delete this rule.",
        );
      } finally {
        setPendingDeleteRuleId(null);
      }
    });
  }

  async function handleImport(
    event: ChangeEvent<HTMLInputElement>,
    kind: "rules" | "hierarchy",
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await actions.run(`import:${kind}`, async () => {
      setActionError(null);
      setImportSummary(null);
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await apiMutation<ImportSummary>(
          `/expense-validation/${kind}/import`,
          {
            method: "POST",
            body: formData,
          },
        );
        setImportSummary(
          `${kind === "rules" ? "Rules" : "Hierarchy"} import: ${response.createdCount} created, ${response.updatedCount} updated.`,
        );
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : `Unable to import ${kind} CSV.`,
        );
      } finally {
        event.target.value = "";
      }
    });
  }

  async function handleExport(kind: "rules" | "hierarchy") {
    await actions.run(`export:${kind}`, async () => {
      setActionError(null);
      setImportSummary(null);

      try {
        const response = await fetchApiMutation(
          `/expense-validation/${kind}/export`,
          {
            method: "POST",
          },
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download =
          kind === "rules"
            ? "expense-validation-rules.csv"
            : "expense-category-hierarchy.csv";
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : `Unable to export ${kind} CSV.`,
        );
      }
    });
  }

  return (
    <div className="page-shell is-relaxed">
      <section className="route-stack-desktop-xl">
        <div className="page-hero">
          <div className="page-hero-row">
            <div className="page-hero-copy">
              <p className="page-kicker">Classification</p>
              <h1 className="page-title is-compact">Expense validation</h1>
              <p className="page-description">
                Map exact descriptions to expense secondaries so primary and
                secondary can autofill during entry.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateModal}
              className="btn-primary"
            >
              New rule
            </button>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {actionError}
          </p>
        ) : null}

        {importSummary ? (
          <p className="page-inline-notice surface-info">{importSummary}</p>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <article className="detail-panel is-roomy expense-validation-card">
            <div className="expense-validation-card-copy">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-green)]/85">
                Rules CSV
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Non-destructive create/update import for description rules.
              </p>
            </div>
            <input
              ref={rulesImportInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => void handleImport(event, "rules")}
            />
            <div className="compact-toolbar-actions is-equal expense-validation-card-actions">
              <button
                type="button"
                onClick={() => rulesImportInputRef.current?.click()}
                className="btn-secondary"
              >
                Import rules
              </button>
              <button
                type="button"
                onClick={() => void handleExport("rules")}
                className="btn-secondary"
              >
                Export rules
              </button>
            </div>
          </article>

          <article className="detail-panel is-roomy expense-validation-card">
            <div className="expense-validation-card-copy">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-green)]/85">
                Hierarchy CSV
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Lossless primary/secondary round-trip with non-destructive
                import semantics.
              </p>
            </div>
            <input
              ref={hierarchyImportInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => void handleImport(event, "hierarchy")}
            />
            <div className="compact-toolbar-actions is-equal expense-validation-card-actions">
              <button
                type="button"
                onClick={() => hierarchyImportInputRef.current?.click()}
                className="btn-secondary"
              >
                Import hierarchy
              </button>
              <button
                type="button"
                onClick={() => void handleExport("hierarchy")}
                className="btn-secondary"
              >
                Export hierarchy
              </button>
            </div>
          </article>
        </div>

        {rules.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No expense validation rules yet.
          </div>
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="pb-3 pr-4 font-medium">Entry</th>
                  <th className="pb-3 pr-4 font-medium">Primary</th>
                  <th className="pb-3 pr-4 font-medium">Secondary</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="text-[var(--text-secondary)]">
                    <td className="py-3 pr-4 text-[var(--text-primary)]">
                      {rule.entry}
                    </td>
                    <td className="py-3 pr-4">{rule.primaryCategoryName}</td>
                    <td className="py-3 pr-4">{rule.secondaryCategoryName}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openEditModal(rule)}
                          className="link-button mobile-hit-target"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(rule.id)}
                          disabled={pendingDeleteRuleId === rule.id}
                          className="link-button is-danger mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingDeleteRuleId === rule.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={isCreateModalOpen || editingRule !== null}
        onClose={closeModal}
        title={editingRule ? `Edit ${editingRule.entry}` : "Create rule"}
        maxWidth={560}
      >
        <form onSubmit={handleRuleSubmit} className="app-form">
          <div className="app-form-field">
            <label htmlFor="expense-validation-entry">Entry</label>
            <input
              id="expense-validation-entry"
              value={ruleForm.entry}
              onChange={(event) => updateRuleForm("entry", event.target.value)}
              required
            />
          </div>

          <div className="app-form-grid is-relaxed">
            <div className="app-form-field">
              <label htmlFor="expense-validation-primary">Primary</label>
              <select
                id="expense-validation-primary"
                value={ruleForm.primaryCategoryId}
                onChange={(event) =>
                  updateRuleForm("primaryCategoryId", event.target.value)
                }
                required
              >
                <option value="">Select a primary</option>
                {primaryCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="app-form-field">
              <label htmlFor="expense-validation-secondary">Secondary</label>
              <select
                id="expense-validation-secondary"
                value={ruleForm.secondaryCategoryId}
                onChange={(event) =>
                  updateRuleForm("secondaryCategoryId", event.target.value)
                }
                required
              >
                <option value="">Select a secondary</option>
                {secondaryCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {formatCategoryName(category)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {actionError ? (
            <p role="alert" className="app-form-error">
              {actionError}
            </p>
          ) : null}

          <div className="app-form-actions">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting
                ? "Saving..."
                : editingRule
                  ? "Save changes"
                  : "Create rule"}
            </button>

            <button
              type="button"
              onClick={closeModal}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
