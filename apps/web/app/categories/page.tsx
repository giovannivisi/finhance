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
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Classification</p>
              <h1 className="page-title is-compact">Categories</h1>
            </div>
            <div className="page-inline-notice surface-warning">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </section>
        ) : (
          <CategoriesPageClient categories={categories} />
        )}
      </Container>
    </>
  );
}
