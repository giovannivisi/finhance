import { Suspense } from "react";
import Container from "@components/Container";
import DashboardMainSection from "@components/DashboardMainSection";
import DashboardMainSkeleton from "@components/DashboardMainSkeleton";
import DashboardSupportSection from "@components/DashboardSupportSection";
import DashboardSupportSkeleton from "@components/DashboardSupportSkeleton";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <Container>
      <h2 className="home-summary-title">Summary</h2>

      <Suspense fallback={<DashboardMainSkeleton />}>
        <DashboardMainSection />
      </Suspense>

      <Suspense fallback={<DashboardSupportSkeleton />}>
        <DashboardSupportSection />
      </Suspense>
    </Container>
  );
}
