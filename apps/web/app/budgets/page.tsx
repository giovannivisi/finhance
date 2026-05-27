import BudgetsRouteClient from "@components/BudgetsRouteClient";
import { getBudgetFilters } from "@lib/budgets";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = getBudgetFilters(resolvedSearchParams);

  return <BudgetsRouteClient filters={filters} />;
}
