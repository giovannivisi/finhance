"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryResponse } from "@finhance/shared";
import CategoryForm from "@components/CategoryForm";
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
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-green)]/85">
                  Expense hierarchy
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Primaries group their secondaries. Transactions and budgets
                  attach to secondaries only.
                </p>
              </div>

              <div className="list-stack is-loose">
                {groupedCategories.expensePrimaries.map(
                  ({ primary, secondaries }) => (
                    <article key={primary.id} className="list-card is-roomy">
                      {renderCategoryCard(primary, {
                        secondaryCount: secondaries.length,
                      })}

                      {secondaries.length > 0 ? (
                        <div className="mt-5 subcard-stack is-loose">
                          {secondaries.map((secondary) => (
                            <div
                              key={secondary.id}
                              className="detail-panel is-roomy"
                            >
                              {renderCategoryCard(secondary, {
                                compact: true,
                              })}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-5 text-sm text-[var(--text-secondary)]">
                          No secondary categories yet.
                        </p>
                      )}
                    </article>
                  ),
                )}
              </div>
            </section>

            <section className="section-stack-tight">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--accent-green)]/85">
                  Income categories
                </h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Income stays flat and is not grouped under primaries.
                </p>
              </div>

              <div className="list-stack is-loose">
                {groupedCategories.income.map((category) => (
                  <article key={category.id} className="list-card is-roomy">
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="section-stack-tight">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={
                options?.compact
                  ? "text-base font-semibold text-[var(--text-primary)]"
                  : "text-lg font-semibold text-[var(--text-primary)]"
              }
            >
              {formatCategoryName(category)}
            </h3>
            <span className="status-chip is-neutral">
              {CATEGORY_TYPE_LABELS[category.type]}
            </span>
            {category.isPrimary ? (
              <span className="status-chip is-info">Primary</span>
            ) : null}
            {category.isSecondary ? (
              <span className="status-chip is-neutral">Secondary</span>
            ) : null}
            {category.archivedAt ? (
              <span className="status-chip is-warning">Archived</span>
            ) : null}
          </div>

          <p className="text-sm text-[var(--text-secondary)]">
            Order {category.order}
            {typeof options?.secondaryCount === "number"
              ? ` · ${options.secondaryCount} secondary${options.secondaryCount === 1 ? "" : "ies"}`
              : ""}
          </p>

          {category.archivedAt && category.deleteBlockReason ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Permanent delete blocked: {category.deleteBlockReason}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditingCategoryId(category.id)}
            className="link-button mobile-hit-target"
          >
            Edit
          </button>

          {!category.archivedAt ? (
            <button
              type="button"
              onClick={() => void handleArchive(category.id)}
              disabled={pendingArchiveCategoryId === category.id}
              className="link-button is-danger mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
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
                className="link-button mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="link-button is-danger mobile-hit-target disabled:cursor-not-allowed disabled:opacity-60"
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
