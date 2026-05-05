import type { Category } from '@finhance/db';
import type { CategoryResponse } from '@finhance/shared';
import type { CategoryDeletionState } from '@transactions/categories.service';

export function toCategoryResponse(
  category: Category,
  deletionState?: CategoryDeletionState,
): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    order: category.order,
    archivedAt: category.archivedAt?.toISOString() ?? null,
    canDeletePermanently: deletionState?.canDeletePermanently ?? false,
    deleteBlockReason: deletionState?.deleteBlockReason ?? null,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}
