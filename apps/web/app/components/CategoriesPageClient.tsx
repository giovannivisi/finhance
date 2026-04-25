"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryResponse } from "@finhance/shared";
import CategoryForm from "@components/CategoryForm";
import {
  categoryToFormValues,
  createEmptyCategoryFormValues,
} from "@lib/category-form";
import { CATEGORY_TYPE_LABELS } from "@lib/categories";
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Categories</h2>
            <p className="text-sm text-gray-500">
              Categories drive income and expense reporting without affecting
              holdings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived
            </label>

            <button
              type="button"
              onClick={() => setEditingCategoryId(null)}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              New category
            </button>
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="text-sm text-red-600">
            {actionError}
          </p>
        ) : null}

        {visibleCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            No categories yet.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleCategories.map((category) => (
              <article
                key={category.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {category.name}
                      </h3>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                        {CATEGORY_TYPE_LABELS[category.type]}
                      </span>
                      {category.archivedAt ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                          Archived
                        </span>
                      ) : null}
                    </div>

                    <p className="text-sm text-gray-600">
                      Order {category.order}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingCategoryId(category.id)}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Edit
                    </button>

                    {!category.archivedAt ? (
                      <button
                        type="button"
                        onClick={() => void handleArchive(category.id)}
                        disabled={pendingArchiveCategoryId === category.id}
                        className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
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
                          className="text-sm font-medium text-blue-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pendingUnarchiveCategoryId === category.id
                            ? "Unarchiving..."
                            : "Unarchive"}
                        </button>
                        {category.canDeletePermanently ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleDeletePermanently(category.id)
                            }
                            disabled={pendingDeleteCategoryId === category.id}
                            className="text-sm font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
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

                {category.archivedAt && category.deleteBlockReason ? (
                  <p className="mt-4 text-sm text-gray-500">
                    Permanent delete blocked: {category.deleteBlockReason}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <aside className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <h2 className="text-xl font-semibold text-gray-900">
          {editingCategory ? "Edit category" : "Create category"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {editingCategory
            ? "Update category naming or ordering."
            : "Add a new income or expense category."}
        </p>

        <div className="mt-6">
          <CategoryForm
            mode={editingCategory ? "edit" : "create"}
            categoryId={editingCategory?.id}
            initialValues={
              editingCategory
                ? categoryToFormValues(editingCategory)
                : createEmptyCategoryFormValues()
            }
            onSuccess={() => setEditingCategoryId(null)}
            onCancel={
              editingCategory ? () => setEditingCategoryId(null) : undefined
            }
          />
        </div>
      </aside>
    </div>
  );
}
