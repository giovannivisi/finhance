import Container from "@components/Container";
import DashboardMainSection from "@components/DashboardMainSection";
import DashboardSupportSection from "@components/DashboardSupportSection";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <Container>
      <h2 className="home-summary-title">Summary</h2>

      <DashboardMainSection />
      <DashboardSupportSection />
    </Container>
  );
}
