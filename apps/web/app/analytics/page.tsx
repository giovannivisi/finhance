import AnalyticsRouteClient from "@components/AnalyticsRouteClient";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const rawSearchParams = searchParams ? await searchParams : {};

  return <AnalyticsRouteClient rawSearchParams={rawSearchParams} />;
}
