import type {
  CategoryResponse,
  CategoryType,
  UpsertCategoryRequest,
} from "@finhance/shared";

export interface CategoryFormValues {
  name: string;
  type: CategoryType;
  order: string;
}

const DEFAULT_CATEGORY_TYPE: CategoryType = "EXPENSE";

export function createEmptyCategoryFormValues(): CategoryFormValues {
  return {
    name: "",
    type: DEFAULT_CATEGORY_TYPE,
    order: "",
  };
}

export function categoryToFormValues(
  category: CategoryResponse,
): CategoryFormValues {
  return {
    name: category.name,
    type: category.type,
    order: String(category.order),
  };
}

export function buildCategoryPayload(values: CategoryFormValues): {
  payload?: UpsertCategoryRequest;
  error?: string;
} {
  const name = values.name.trim();
  const order = parseInteger(values.order);

  if (!name) {
    return { error: "Name is required." };
  }

  return {
    payload: {
      name,
      type: values.type,
      order,
    },
  };
}

function parseInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
