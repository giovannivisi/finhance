import { CategoryBudgetOverride, Prisma } from '@prisma/client';
import type {
  CategoryBudgetOverrideResponse,
  CategoryBudgetResponse,
} from '@finhance/shared';

function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

function toMonthKey(value: Date | null): string | null {
  return value?.toISOString().slice(0, 7) ?? null;
}

type CategoryBudgetModel = Prisma.CategoryBudgetGetPayload<{
  include: {
    category: true;
  };
}>;

export function toCategoryBudgetOverrideResponse(
  override: CategoryBudgetOverride,
): CategoryBudgetOverrideResponse {
  return {
    id: override.id,
    categoryBudgetId: override.categoryBudgetId,
    month: override.month.toISOString().slice(0, 7),
    amount: decimalToNumber(override.amount),
    note: override.note,
    createdAt: override.createdAt.toISOString(),
    updatedAt: override.updatedAt.toISOString(),
  };
}

export function toCategoryBudgetResponse(
  budget: CategoryBudgetModel,
): CategoryBudgetResponse {
  return {
    id: budget.id,
    categoryId: budget.categoryId,
    categoryName: budget.category.name,
    categoryArchivedAt: budget.category.archivedAt?.toISOString() ?? null,
    currency: budget.currency,
    amount: decimalToNumber(budget.amount),
    startMonth: budget.startMonth.toISOString().slice(0, 7),
    endMonth: toMonthKey(budget.endMonth),
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}
