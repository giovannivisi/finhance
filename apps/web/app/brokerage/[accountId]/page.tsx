import Container from "@components/Container";
import BrokeragePageClient from "@components/BrokeragePageClient";
import { api } from "@lib/server-api";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";
import type {
  BrokerageWorkspaceResponse,
  CategoryResponse,
  InvestmentPlanResponse,
} from "@finhance/shared";

export const dynamic = "force-dynamic";

export default async function BrokerageAccountPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ accountId: string }>;
  searchParams?: Promise<{ recordPlan?: string | string[] }>;
}) {
  const [{ accountId }, query] = await Promise.all([params, searchParams]);
  const initialRecordPlanId =
    typeof query.recordPlan === "string" ? query.recordPlan : null;
  let workspace: BrokerageWorkspaceResponse | null = null;
  let categories: CategoryResponse[] | null = null;
  let plans: InvestmentPlanResponse[] = [];
  let showTransactionTimes = true;
  let errorMessage: string | null = null;

  try {
    const [settings, nextWorkspace, nextCategories, nextPlans] =
      await Promise.all([
        getUserSettingsOrDefaults(),
        api<BrokerageWorkspaceResponse>(`/brokerage/${accountId}`),
        api<CategoryResponse[]>("/categories?includeArchived=true"),
        api<InvestmentPlanResponse[]>("/investment-plans"),
      ]);
    showTransactionTimes = settings.showTransactionTimes;
    workspace = nextWorkspace;
    categories = nextCategories;
    plans = nextPlans;
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Brokerage data is currently unavailable.";
  }

  return (
    <Container>
      {!workspace || !categories ? (
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Investing</p>
            <h1 className="page-title is-compact">Brokerage</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </section>
      ) : (
        <BrokeragePageClient
          workspace={workspace}
          categories={categories}
          plans={plans}
          initialRecordPlanId={initialRecordPlanId}
          showTransactionTimes={showTransactionTimes}
        />
      )}
    </Container>
  );
}
