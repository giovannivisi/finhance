import { CategoryType, Prisma } from '@finhance/db';

export type HierarchicalCategoryRecord = Prisma.CategoryGetPayload<{
  include: {
    parentCategory: true;
  };
}>;

export interface CategoryHierarchyMetadata {
  primaryCategoryId: string | null;
  primaryCategoryName: string | null;
  secondaryCategoryId: string | null;
  secondaryCategoryName: string | null;
}

export function normalizeExpenseValidationEntry(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function getCategoryHierarchyMetadata(
  category: HierarchicalCategoryRecord | null | undefined,
): CategoryHierarchyMetadata {
  if (!category) {
    return {
      primaryCategoryId: null,
      primaryCategoryName: null,
      secondaryCategoryId: null,
      secondaryCategoryName: null,
    };
  }

  if (category.type === CategoryType.EXPENSE && category.parentCategory) {
    return {
      primaryCategoryId: category.parentCategory.id,
      primaryCategoryName: category.parentCategory.name,
      secondaryCategoryId: category.id,
      secondaryCategoryName: category.name,
    };
  }

  return {
    primaryCategoryId: null,
    primaryCategoryName: null,
    secondaryCategoryId: null,
    secondaryCategoryName: null,
  };
}
