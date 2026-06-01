import type { CategoryResponse } from '@finhance/shared';
import type { CategoryDeletionState } from '@transactions/categories.service';
import type { HierarchicalCategoryRecord } from '@transactions/category-hierarchy';

export function toCategoryResponse(
  category: HierarchicalCategoryRecord,
  deletionState?: CategoryDeletionState,
): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    parentCategoryId: category.parentCategoryId,
    parentCategoryName: category.parentCategory?.name ?? null,
    isPrimary:
      category.type === 'EXPENSE' && category.parentCategoryId === null,
    isSecondary:
      category.type === 'EXPENSE' && category.parentCategoryId !== null,
    order: category.order,
    archivedAt: category.archivedAt?.toISOString() ?? null,
    canDeletePermanently: deletionState?.canDeletePermanently ?? false,
    deleteBlockReason: deletionState?.deleteBlockReason ?? null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
