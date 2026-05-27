"use client";

import { useEffect, useState } from "react";
import type { CategoryResponse } from "@finhance/shared";
import CategoriesPageClient from "@components/CategoriesPageClient";
import Container from "@components/Container";
import RouteLoadingShell from "@components/RouteLoadingShell";
import { api } from "@lib/api";

export default function CategoriesRouteClient() {
  const [categories, setCategories] = useState<CategoryResponse[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    api<CategoryResponse[]>("/categories?includeArchived=true")
      .then((nextCategories) => {
        if (isActive) {
          setCategories(nextCategories);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Category data is currently unavailable.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (errorMessage) {
    return (
      <Container>
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Classification</p>
            <h1 className="page-title is-compact">Categories</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">{errorMessage}</p>
          </div>
        </section>
      </Container>
    );
  }

  if (!categories) {
    return <RouteLoadingShell kicker="Classification" title="Categories" />;
  }

  return (
    <Container>
      <CategoriesPageClient categories={categories} />
    </Container>
  );
}
