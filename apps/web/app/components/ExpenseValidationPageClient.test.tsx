import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CategoryResponse,
  ExpenseValidationRuleResponse,
} from "@finhance/shared";
import ExpenseValidationPageClient from "@components/ExpenseValidationPageClient";
import { apiMutation, fetchApiMutation } from "@lib/api";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
  }),
}));

vi.mock("@lib/api", () => ({
  apiMutation: vi.fn(),
  fetchApiMutation: vi.fn(),
}));

const mockedApiMutation = vi.mocked(apiMutation);
const mockedFetchApiMutation = vi.mocked(fetchApiMutation);

function buildCategory(
  overrides: Partial<CategoryResponse>,
): CategoryResponse {
  return {
    id: overrides.id ?? "category-1",
    name: overrides.name ?? "Category",
    type: overrides.type ?? "EXPENSE",
    parentCategoryId: overrides.parentCategoryId ?? null,
    parentCategoryName: overrides.parentCategoryName ?? null,
    isPrimary: overrides.isPrimary ?? true,
    isSecondary: overrides.isSecondary ?? false,
    order: overrides.order ?? 1,
    archivedAt: overrides.archivedAt ?? null,
    canDeletePermanently: overrides.canDeletePermanently ?? true,
    deleteBlockReason: overrides.deleteBlockReason ?? null,
    createdAt: overrides.createdAt ?? "2026-05-14T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-14T10:00:00.000Z",
  };
}

function buildRule(
  overrides: Partial<ExpenseValidationRuleResponse>,
): ExpenseValidationRuleResponse {
  return {
    id: overrides.id ?? "rule-1",
    entry: overrides.entry ?? "Coffee",
    normalizedEntry: overrides.normalizedEntry ?? "coffee",
    secondaryCategoryId: overrides.secondaryCategoryId ?? "secondary-1",
    secondaryCategoryName:
      overrides.secondaryCategoryName ?? "Coffee shops",
    primaryCategoryId: overrides.primaryCategoryId ?? "primary-1",
    primaryCategoryName: overrides.primaryCategoryName ?? "Food",
    createdAt: overrides.createdAt ?? "2026-05-14T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-14T10:00:00.000Z",
  };
}

const categories: CategoryResponse[] = [
  buildCategory({
    id: "primary-food",
    name: "Food",
    isPrimary: true,
  }),
  buildCategory({
    id: "secondary-bars",
    name: "Bars",
    parentCategoryId: "primary-food",
    parentCategoryName: "Food",
    isPrimary: false,
    isSecondary: true,
  }),
  buildCategory({
    id: "secondary-cafes",
    name: "Cafes",
    parentCategoryId: "primary-food",
    parentCategoryName: "Food",
    isPrimary: false,
    isSecondary: true,
  }),
  buildCategory({
    id: "primary-health",
    name: "Health",
    isPrimary: true,
  }),
  buildCategory({
    id: "secondary-gym",
    name: "Gym",
    parentCategoryId: "primary-health",
    parentCategoryName: "Health",
    isPrimary: false,
    isSecondary: true,
  }),
];

const rules: ExpenseValidationRuleResponse[] = [
  buildRule({
    id: "rule-health",
    entry: "Gym membership",
    secondaryCategoryName: "Gym",
    primaryCategoryId: "primary-health",
    primaryCategoryName: "Health",
  }),
  buildRule({
    id: "rule-food-b",
    entry: "coffee",
    secondaryCategoryName: "Cafes",
    primaryCategoryId: "primary-food",
    primaryCategoryName: "Food",
  }),
  buildRule({
    id: "rule-food-a",
    entry: "Coffee",
    secondaryCategoryName: "Bars",
    primaryCategoryId: "primary-food",
    primaryCategoryName: "Food",
  }),
  buildRule({
    id: "rule-food-c",
    entry: "Bakery",
    secondaryCategoryName: "Bread",
    primaryCategoryId: "primary-food",
    primaryCategoryName: "Food",
  }),
];

function renderPage() {
  return render(
    <ExpenseValidationPageClient categories={categories} rules={rules} />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ExpenseValidationPageClient", () => {
  it("groups rules by primary category and opens groups by default", () => {
    const { container } = renderPage();

    const groups = Array.from(
      container.querySelectorAll(".expense-validation-group"),
    );
    expect(groups).toHaveLength(2);
    expect(
      within(groups[0] as HTMLElement).getByRole("heading", { name: "Food" }),
    ).toBeInTheDocument();
    expect(
      within(groups[1] as HTMLElement).getByRole("heading", {
        name: "Health",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("Bakery")).toBeInTheDocument();
    expect(screen.getByText("Gym membership")).toBeInTheDocument();
  });

  it("sorts rules alphabetically inside each group and keeps row actions visible", () => {
    const { container } = renderPage();
    const firstGroup = container.querySelector(".expense-validation-group");

    expect(firstGroup).not.toBeNull();
    expect(
      Array.from(
        (firstGroup as HTMLElement).querySelectorAll(
          ".expense-validation-rule-entry",
        ),
      ).map((node) => node.textContent),
    ).toEqual(["Bakery", "Coffee", "coffee"]);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(4);
  });

  it("opens the Rule tools menu and exposes all import/export actions", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Rule tools" }));

    expect(screen.getByRole("menu", { name: "Rule tools" })).toBeInTheDocument();
    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.getByText("Hierarchy")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Import rules" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Export rules" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Import hierarchy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Export hierarchy" }),
    ).toBeInTheDocument();
  });

  it("keeps the export handlers wired through the Rule tools menu", async () => {
    const createObjectUrl = vi.fn(() => "blob:finhance");
    const revokeObjectUrl = vi.fn();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;

    URL.createObjectURL = createObjectUrl;
    URL.revokeObjectURL = revokeObjectUrl;
    mockedFetchApiMutation.mockResolvedValue(
      new Response("rules", {
        headers: {
          "content-disposition":
            'attachment; filename="expense-validation-rules.csv"',
        },
      }),
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Rule tools" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Export rules" }));

    await waitFor(() =>
      expect(mockedFetchApiMutation).toHaveBeenCalledWith(
        "/expense-validation/rules/export",
        { method: "POST" },
      ),
    );
    expect(mockedApiMutation).not.toHaveBeenCalled();

    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  });
});
