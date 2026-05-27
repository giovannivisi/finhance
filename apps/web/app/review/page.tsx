import ReviewRouteClient from "@components/ReviewRouteClient";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  const rawSearchParams = searchParams ? await searchParams : {};

  return <ReviewRouteClient rawSearchParams={rawSearchParams} />;
}
