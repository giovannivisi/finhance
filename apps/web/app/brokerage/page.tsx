import Container from "@components/Container";
import BrokerageRouteClient from "@components/BrokerageRouteClient";

export const dynamic = "force-dynamic";

export default async function BrokeragePage() {
  return (
    <Container>
      <BrokerageRouteClient />
    </Container>
  );
}
