import type { DashboardSupportDataResponse } from "@finhance/shared";
import DashboardSupportDataClient from "@components/DashboardSupportDataClient";
import { api } from "@lib/server-api";

export default async function DashboardSupportSection() {
  let supportData: DashboardSupportDataResponse | null = null;

  try {
    supportData = await api<DashboardSupportDataResponse>(
      "/dashboard/support-data",
    );
  } catch {
    supportData = null;
  }

  return <DashboardSupportDataClient supportData={supportData} />;
}
