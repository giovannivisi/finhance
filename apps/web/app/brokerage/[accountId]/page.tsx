import Container from "@components/Container";
import BrokerageRouteClient from "@components/BrokerageRouteClient";

export const dynamic = "force-dynamic";

export default async function BrokerageAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;

  return (
    <Container>
      <BrokerageRouteClient accountId={accountId} />
    </Container>
  );
}
