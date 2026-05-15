"use client";

import {
  useEffect,
  useMemo,
  useId,
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
import DisclosureIcon from "@components/DisclosureIcon";
import Modal from "@components/Modal";
import { fetchApiMutation, apiMutation } from "@lib/api";
import { formatCategoryName } from "@lib/categories";
import { groupExpenseValidationRules } from "@lib/expense-validation";
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
  const toolMenuId = useId();
  const router = useRouter();
  const rulesImportInputRef = useRef<HTMLInputElement | null>(null);
  const hierarchyImportInputRef = useRef<HTMLInputElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const actions = useSingleFlightActions<string>();
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [openPrimaryGroups, setOpenPrimaryGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [ruleForm, setRuleForm] = useState<RuleFormState>(emptyRuleFormState);
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(
    null,
  );
  const editingRule = rules.find((rule) => rule.id === editingRuleId) ?? null;
  const groupedRules = useMemo(() => groupExpenseValidationRules(rules), [rules]);

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

  useEffect(() => {
    setOpenPrimaryGroups(
      new Set(groupedRules.map((group) => group.primaryCategoryName)),
    );
  }, [groupedRules]);

  useEffect(() => {
    if (!isToolsMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!toolsMenuRef.current?.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsToolsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isToolsMenuOpen]);

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

  function togglePrimaryGroup(primaryCategoryName: string) {
    setOpenPrimaryGroups((previous) => {
      const next = new Set(previous);

      if (next.has(primaryCategoryName)) {
        next.delete(primaryCategoryName);
      } else {
        next.add(primaryCategoryName);
      }

      return next;
    });
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
        setIsToolsMenuOpen(false);
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
        setIsToolsMenuOpen(false);
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
        <div className="page-hero page-section--allow-overflow">
          <div className="page-hero-row">
            <div className="page-hero-copy">
              <p className="page-kicker">Classification</p>
              <h1 className="page-title is-compact">Expense validation</h1>
              <p className="page-description">
                Map exact descriptions to expense secondaries so primary and
                secondary can autofill during entry.
              </p>
            </div>

            <div className="page-hero-actions">
              <div
                ref={toolsMenuRef}
                className="expense-validation-tools-shell"
              >
                <input
                  ref={rulesImportInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => void handleImport(event, "rules")}
                />
                <input
                  ref={hierarchyImportInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => void handleImport(event, "hierarchy")}
                />
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isToolsMenuOpen}
                  aria-controls={toolMenuId}
                  onClick={() => setIsToolsMenuOpen((current) => !current)}
                  className={`btn-secondary expense-validation-tools-trigger${
                    isToolsMenuOpen ? " is-active" : ""
                  }`}
                >
                  Rule tools
                </button>

                {isToolsMenuOpen ? (
                  <div
                    id={toolMenuId}
                    role="menu"
                    aria-label="Rule tools"
                    className="expense-validation-tools-menu"
                  >
                    <div className="expense-validation-tools-group">
                      <p className="expense-validation-tools-group-title">
                        Rules
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => rulesImportInputRef.current?.click()}
                        className="expense-validation-tools-item"
                      >
                        Import rules
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleExport("rules")}
                        className="expense-validation-tools-item"
                      >
                        Export rules
                      </button>
                    </div>

                    <div className="expense-validation-tools-group">
                      <p className="expense-validation-tools-group-title">
                        Hierarchy
                      </p>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => hierarchyImportInputRef.current?.click()}
                        className="expense-validation-tools-item"
                      >
                        Import hierarchy
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleExport("hierarchy")}
                        className="expense-validation-tools-item"
                      >
                        Export hierarchy
                      </button>
                    </div>
                  </div>
                ) : null}
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
        </div>

        {actionError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {actionError}
          </p>
        ) : null}

        {importSummary ? (
          <p className="page-inline-notice surface-info">{importSummary}</p>
        ) : null}

        {rules.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No expense validation rules yet.
          </div>
        ) : (
          <section className="page-section is-spacious section-stack-tight">
            <div className="expense-validation-section-header">
              <div>
                <h2 className="workflow-card-title">Rules by primary</h2>
                <p className="expense-validation-section-copy">
                  Review exact-match rules by primary category, then drill into
                  each description alphabetically inside that group.
                </p>
              </div>
              <div className="page-pill">{rules.length} total rules</div>
            </div>

            <div className="expense-validation-group-list">
              {groupedRules.map((group) => {
                const isOpen = openPrimaryGroups.has(group.primaryCategoryName);
                const sectionId = `expense-validation-group-${group.primaryCategoryName
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")}`;

                return (
                  <article
                    key={group.primaryCategoryName}
                    className="detail-panel is-roomy expense-validation-group"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={sectionId}
                      onClick={() => togglePrimaryGroup(group.primaryCategoryName)}
                      className="expense-validation-group-toggle"
                    >
                      <div className="expense-validation-group-heading">
                        <h3 className="expense-validation-group-title">
                          {group.primaryCategoryName}
                        </h3>
                        <span className="status-chip is-neutral">
                          {group.rules.length} rule
                          {group.rules.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="expense-validation-group-chevron"
                      >
                        <DisclosureIcon open={isOpen} />
                      </span>
                    </button>

                    {isOpen ? (
                      <div
                        id={sectionId}
                        className="expense-validation-rule-list"
                      >
                        {group.rules.map((rule) => (
                          <div
                            key={rule.id}
                            className="detail-panel expense-validation-rule-row"
                          >
                            <div className="expense-validation-rule-copy">
                              <p className="expense-validation-rule-entry">
                                {rule.entry}
                              </p>
                              <p className="expense-validation-rule-secondary">
                                {rule.secondaryCategoryName}
                              </p>
                            </div>
                            <div className="expense-validation-rule-actions">
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
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
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
