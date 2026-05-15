"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryResponse } from "@finhance/shared";
import CategoryForm from "@components/CategoryForm";
import DisclosureIcon from "@components/DisclosureIcon";
import Modal from "@components/Modal";
import {
  categoryToFormValues,
  createEmptyCategoryFormValues,
} from "@lib/category-form";
import { CATEGORY_TYPE_LABELS, formatCategoryName } from "@lib/categories";
import { groupCategories } from "@lib/hierarchical-categories";
import { apiMutation } from "@lib/api";
import { useSingleFlightActions } from "@lib/single-flight";

export default function CategoriesPageClient({
  categories,
}: {
  categories: CategoryResponse[];
}) {
  const router = useRouter();
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingArchiveCategoryId, setPendingArchiveCategoryId] = useState<
    string | null
  >(null);
  const [pendingUnarchiveCategoryId, setPendingUnarchiveCategoryId] = useState<
    string | null
  >(null);
  const [pendingDeleteCategoryId, setPendingDeleteCategoryId] = useState<
    string | null
  >(null);
  const [openExpensePrimaries, setOpenExpensePrimaries] = useState<
    Set<string>
  >(() => new Set());
  const actions = useSingleFlightActions<string>();

  const editingCategory =
    categories.find((category) => category.id === editingCategoryId) ?? null;

  const visibleCategories = useMemo(
    () =>
      showArchived
        ? categories
        : categories.filter((category) => category.archivedAt === null),
    [categories, showArchived],
  );
  const groupedCategories = useMemo(
    () => groupCategories(visibleCategories),
    [visibleCategories],
  );

  function toggleExpensePrimary(categoryId: string) {
    setOpenExpensePrimaries((previous) => {
      const next = new Set(previous);

      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }

      return next;
    });
  }

  async function handleArchive(categoryId: string) {
    await actions.run(`archive:${categoryId}`, async () => {
      setActionError(null);
      setPendingArchiveCategoryId(categoryId);

      try {
        await apiMutation<void>(`/categories/${categoryId}`, {
          method: "DELETE",
        });

        if (editingCategoryId === categoryId) {
          setEditingCategoryId(null);
        }

        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to archive category.",
        );
      } finally {
        setPendingArchiveCategoryId(null);
      }
    });
  }

  async function handleUnarchive(categoryId: string) {
    await actions.run(`unarchive:${categoryId}`, async () => {
      setActionError(null);
      setPendingUnarchiveCategoryId(categoryId);

      try {
        await apiMutation<void>(`/categories/${categoryId}/unarchive`, {
          method: "POST",
        });
        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to unarchive category.",
        );
      } finally {
        setPendingUnarchiveCategoryId(null);
      }
    });
  }

  async function handleDeletePermanently(categoryId: string) {
    await actions.run(`delete:${categoryId}`, async () => {
      setActionError(null);
      setPendingDeleteCategoryId(categoryId);

      const confirmed = confirm(
        "Delete this archived category permanently? This cannot be undone.",
      );
      if (!confirmed) {
        setPendingDeleteCategoryId(null);
        return;
      }

      try {
        await apiMutation<void>(`/categories/${categoryId}/permanent`, {
          method: "DELETE",
        });

        if (editingCategoryId === categoryId) {
          setEditingCategoryId(null);
        }

        router.refresh();
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "Unable to delete this category permanently.",
        );
      } finally {
        setPendingDeleteCategoryId(null);
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
              <h2 className="page-title is-compact">Categories</h2>
              <p className="page-description">
                Categories drive income and expense reporting without affecting
                holdings.
              </p>
            </div>

            <div className="page-hero-actions">
              <label className="page-pill">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Show archived
              </label>

              <button
                type="button"
                onClick={() => {
                  setEditingCategoryId(null);
                  setIsCreateModalOpen(true);
                }}
                className="btn-primary"
              >
                New category
              </button>
            </div>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="page-inline-notice surface-danger">
            {actionError}
          </p>
        ) : null}

        {visibleCategories.length === 0 ? (
          <div className="page-inline-notice surface-dashed">
            No categories yet.
          </div>
        ) : (
          <div className="route-stack-desktop-xl">
            <section className="section-stack-tight">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Expense categories
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Primaries group their secondaries. Transactions and budgets
                  attach to secondaries only.
                </p>
              </div>

              <div className="list-stack is-loose">
                {groupedCategories.expensePrimaries.map(
                  ({ primary, secondaries }) => {
                    const isOpen = openExpensePrimaries.has(primary.id);
                    const sectionId = `category-secondary-group-${primary.id}`;

                    return (
                      <article
                        key={primary.id}
                        className="list-card is-roomy category-hierarchy-primary-card"
                      >
                        {renderCategoryCard(primary, {
                          secondaryCount: secondaries.length,
                        })}

                        {secondaries.length > 0 ? (
                          <div
                            className={
                              isOpen
                                ? "category-hierarchy-secondary-panel is-open"
                                : "category-hierarchy-secondary-panel"
                            }
                          >
                            <button
                              type="button"
                              className={
                                isOpen
                                  ? "category-disclosure-toggle is-open"
                                  : "category-disclosure-toggle"
                              }
                              aria-expanded={isOpen}
                              aria-controls={sectionId}
                              onClick={() => toggleExpensePrimary(primary.id)}
                            >
                              <span className="category-disclosure-copy">
                                <span className="category-disclosure-title">
                                  Secondary categories
                                </span>
                              </span>
                              <span className="category-disclosure-meta">
                                <span className="category-disclosure-count">
                                  {secondaries.length}
                                </span>
                                <DisclosureIcon open={isOpen} />
                              </span>
                            </button>

                            {isOpen ? (
                              <div
                                id={sectionId}
                                className="category-hierarchy-secondary-list subcard-stack is-loose"
                              >
                                {secondaries.map((secondary) => (
                                  <div
                                    key={secondary.id}
                                    className="category-hierarchy-secondary-card"
                                  >
                                    {renderCategoryCard(secondary, {
                                      compact: true,
                                    })}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <p className="mt-5 text-sm text-[var(--text-secondary)]">
                            No secondary categories yet.
                          </p>
                        )}
                      </article>
                    );
                  },
                )}
              </div>
            </section>

            <section className="section-stack-tight">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                  Income categories
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Income stays flat and is not grouped under primaries.
                </p>
              </div>

              <div className="list-stack is-loose">
                {groupedCategories.income.map((category) => (
                  <article
                    key={category.id}
                    className="list-card is-roomy category-hierarchy-primary-card"
                  >
                    {renderCategoryCard(category)}
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>

      <Modal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create category"
        maxWidth={560}
      >
        <p className="section-subtitle">
          Add a new income or expense category.
        </p>
        <div className="mt-6">
          <CategoryForm
            mode="create"
            initialValues={createEmptyCategoryFormValues()}
            categories={categories}
            onSuccess={() => setIsCreateModalOpen(false)}
            onCancel={() => setIsCreateModalOpen(false)}
          />
        </div>
      </Modal>

      <Modal
        open={editingCategory !== null}
        onClose={() => setEditingCategoryId(null)}
        title={
          editingCategory ? `Edit ${editingCategory.name}` : "Edit category"
        }
        maxWidth={560}
      >
        {editingCategory ? (
          <>
            <p className="section-subtitle">
              Update category naming or ordering.
            </p>
            <div className="mt-6">
              <CategoryForm
                mode="edit"
                categoryId={editingCategory.id}
                initialValues={categoryToFormValues(editingCategory)}
                categories={categories}
                onSuccess={() => setEditingCategoryId(null)}
                onCancel={() => setEditingCategoryId(null)}
              />
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );

  function renderCategoryCard(
    category: CategoryResponse,
    options?: { compact?: boolean; secondaryCount?: number },
  ) {
    return (
      <div
        className={
          options?.compact
            ? "flex flex-wrap items-center justify-between gap-3"
            : "flex flex-wrap items-start justify-between gap-4"
        }
      >
        <div
          className={
            options?.compact
              ? "category-card-copy is-compact"
              : "category-card-copy"
          }
        >
          <div
            className={
              options?.compact
                ? "category-card-head is-compact"
                : "category-card-head"
            }
          >
            <h3
              className={
                options?.compact
                  ? "category-card-title is-compact"
                  : "category-card-title"
              }
            >
              {formatCategoryName(category)}
            </h3>
            <span
              className={
                options?.compact
                  ? "status-chip is-neutral category-card-chip is-compact"
                  : "status-chip is-neutral"
              }
            >
              {CATEGORY_TYPE_LABELS[category.type]}
            </span>
            {category.isPrimary ? (
              <span className="status-chip is-info">Primary</span>
            ) : null}
            {category.isSecondary ? (
              <span
                className={
                  options?.compact
                    ? "status-chip is-secondary category-card-chip is-compact"
                    : "status-chip is-secondary"
                }
              >
                Secondary
              </span>
            ) : null}
            {category.archivedAt ? (
              <span className="status-chip is-warning">Archived</span>
            ) : null}
          </div>

          {typeof options?.secondaryCount === "number" ? (
            <p className="category-card-secondary-count">
              {options.secondaryCount} secondary{" "}
              {options.secondaryCount === 1 ? "category" : "categories"}
            </p>
          ) : null}

          {category.archivedAt && category.deleteBlockReason ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Permanent delete blocked: {category.deleteBlockReason}
            </p>
          ) : null}
        </div>

        <div
          className={
            options?.compact
              ? "category-card-actions is-compact"
              : "category-card-actions"
          }
        >
          <button
            type="button"
            onClick={() => setEditingCategoryId(category.id)}
            className={
              options?.compact
                ? "link-button mobile-hit-target category-card-action is-compact"
                : "link-button mobile-hit-target category-card-action"
            }
          >
            Edit
          </button>

          {!category.archivedAt ? (
            <button
              type="button"
              onClick={() => void handleArchive(category.id)}
              disabled={pendingArchiveCategoryId === category.id}
              className={
                options?.compact
                  ? "link-button is-danger mobile-hit-target category-card-action is-compact disabled:cursor-not-allowed disabled:opacity-60"
                  : "link-button is-danger mobile-hit-target category-card-action disabled:cursor-not-allowed disabled:opacity-60"
              }
            >
              {pendingArchiveCategoryId === category.id
                ? "Archiving..."
                : "Archive"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void handleUnarchive(category.id)}
                disabled={pendingUnarchiveCategoryId === category.id}
                className={
                  options?.compact
                    ? "link-button mobile-hit-target category-card-action is-compact disabled:cursor-not-allowed disabled:opacity-60"
                    : "link-button mobile-hit-target category-card-action disabled:cursor-not-allowed disabled:opacity-60"
                }
              >
                {pendingUnarchiveCategoryId === category.id
                  ? "Unarchiving..."
                  : "Unarchive"}
              </button>
              {category.canDeletePermanently ? (
                <button
                  type="button"
                  onClick={() => void handleDeletePermanently(category.id)}
                  disabled={pendingDeleteCategoryId === category.id}
                  className={
                    options?.compact
                      ? "link-button is-danger mobile-hit-target category-card-action is-compact disabled:cursor-not-allowed disabled:opacity-60"
                      : "link-button is-danger mobile-hit-target category-card-action disabled:cursor-not-allowed disabled:opacity-60"
                  }
                >
                  {pendingDeleteCategoryId === category.id
                    ? "Deleting..."
                    : "Delete"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    );
  }
}
