import Container from "@components/Container";
import TransactionsRouteClient from "@components/TransactionsRouteClient";
import { getDefaultActivityFilters, type ActivityFilters } from "@lib/activity";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

function getSingleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const hasExplicitFilters = Object.keys(resolvedSearchParams).length > 0;
  const defaultFilters = getDefaultActivityFilters();
  const filters: ActivityFilters = hasExplicitFilters
    ? {
        from: getSingleValue(resolvedSearchParams.from),
        to: getSingleValue(resolvedSearchParams.to),
        accountId: getSingleValue(resolvedSearchParams.accountId),
        categoryId: getSingleValue(resolvedSearchParams.categoryId),
        primaryCategoryId: getSingleValue(
          resolvedSearchParams.primaryCategoryId,
        ),
        secondaryCategoryId:
          getSingleValue(resolvedSearchParams.secondaryCategoryId) ||
          getSingleValue(resolvedSearchParams.categoryId),
        kind: getSingleValue(resolvedSearchParams.kind),
        includeArchivedAccounts:
          getSingleValue(resolvedSearchParams.includeArchivedAccounts) ===
          "true",
      }
    : defaultFilters;

  return (
    <Container>
      <TransactionsRouteClient initialFilters={filters} />
    </Container>
  );
}
