import { CategoryBudgetOverride, Prisma } from '@prisma/client';
import type {
  CategoryBudgetOverrideResponse,
  CategoryBudgetResponse,
} from '@finhance/shared';

function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

function toUtcMonthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toMonthKey(value: Date | null): string | null {
  return value ? toUtcMonthKey(value) : null;
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
    month: toUtcMonthKey(override.month),
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
    startMonth: toUtcMonthKey(budget.startMonth),
    endMonth: toMonthKey(budget.endMonth),
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  };
}
