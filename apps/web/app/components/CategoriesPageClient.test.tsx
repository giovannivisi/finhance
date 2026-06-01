import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CategoryResponse } from "@finhance/shared";
import CategoriesPageClient from "@components/CategoriesPageClient";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
  }),
}));

vi.mock("@components/Modal", () => ({
  default: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("@components/CategoryForm", () => ({
  default: () => <div>Category form</div>,
}));

function buildCategory(overrides: Partial<CategoryResponse>): CategoryResponse {
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
    createdAt: overrides.createdAt ?? "2026-05-15T09:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-15T09:00:00.000Z",
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
    id: "secondary-grocery",
    name: "Groceries",
    parentCategoryId: "primary-food",
    parentCategoryName: "Food",
    isPrimary: false,
    isSecondary: true,
  }),
  buildCategory({
    id: "income-salary",
    name: "Salary",
    type: "INCOME",
    isPrimary: false,
    isSecondary: false,
  }),
];

afterEach(() => {
  vi.clearAllMocks();
});

describe("CategoriesPageClient", () => {
  it("keeps expense secondaries hidden by default and reveals them on demand", () => {
    render(<CategoriesPageClient categories={categories} />);

    expect(screen.queryByText("Bars")).not.toBeInTheDocument();
    expect(screen.queryByText("Groceries")).not.toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Secondary categories/i }),
    );

    expect(
      screen.getByRole("heading", { name: "Food / Bars" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Food / Groceries" }),
    ).toBeInTheDocument();
  });

  it("keeps primary actions visible and preserves secondary actions when the group opens", () => {
    const { container } = render(
      <CategoriesPageClient categories={categories} />,
    );

    const cards = Array.from(container.querySelectorAll(".list-card"));
    const expensePrimaryCard = cards.find((card) =>
      within(card as HTMLElement).queryByRole("heading", { name: "Food" }),
    ) as HTMLElement | undefined;

    expect(expensePrimaryCard).toBeDefined();
    if (!expensePrimaryCard) {
      throw new Error("Expected to find the Food primary card.");
    }
    expect(
      within(expensePrimaryCard).getByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      within(expensePrimaryCard).getByRole("button", { name: "Archive" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(expensePrimaryCard).getByRole("button", {
        name: /Secondary categories/i,
      }),
    );

    const secondaryCards = Array.from(
      expensePrimaryCard.querySelectorAll(".category-hierarchy-secondary-card"),
    );
    expect(secondaryCards).toHaveLength(2);
    expect(
      within(secondaryCards[0] as HTMLElement).getByRole("button", {
        name: "Edit",
      }),
    ).toBeInTheDocument();
    expect(
      within(secondaryCards[0] as HTMLElement).getByRole("button", {
        name: "Archive",
      }),
    ).toBeInTheDocument();
  });
});
