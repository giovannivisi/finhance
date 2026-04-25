import Container from "@components/Container";
import CategoriesPageClient from "@components/CategoriesPageClient";
import { api } from "@lib/api";
import type { CategoryResponse } from "@finhance/shared";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  let categories: CategoryResponse[] | null = null;
  let errorMessage: string | null = null;

  try {
    categories = await api<CategoryResponse[]>(
      "/categories?includeArchived=true",
    );
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Category data is currently unavailable.";
  }

  return (
    <>
      <Container>
        {!categories ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">Categories</h1>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm text-amber-900/80">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </>
        ) : (
          <CategoriesPageClient categories={categories} />
        )}
      </Container>
    </>
  );
}
