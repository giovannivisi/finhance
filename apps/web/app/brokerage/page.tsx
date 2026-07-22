import Container from "@components/Container";
import BrokeragePageClient from "@components/BrokeragePageClient";
import { api } from "@lib/server-api";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";
import type {
  BrokerageAccountSummaryResponse,
  BrokerageWorkspaceResponse,
  CategoryResponse,
} from "@finhance/shared";

export const dynamic = "force-dynamic";

export default async function BrokeragePage() {
  let brokers: BrokerageAccountSummaryResponse[] | null = null;
  let workspace: BrokerageWorkspaceResponse | null = null;
  let categories: CategoryResponse[] | null = null;
  let showTransactionTimes = true;
  let errorMessage: string | null = null;

  try {
    brokers = await api<BrokerageAccountSummaryResponse[]>("/brokerage");
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Brokerage data is currently unavailable.";
  }

  if (brokers && brokers.length > 0) {
    try {
      const [settings, nextWorkspace, nextCategories] = await Promise.all([
        getUserSettingsOrDefaults(),
        api<BrokerageWorkspaceResponse>(`/brokerage/${brokers[0].account.id}`),
        api<CategoryResponse[]>("/categories?includeArchived=true"),
      ]);
      showTransactionTimes = settings.showTransactionTimes;
      workspace = nextWorkspace;
      categories = nextCategories;
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Brokerage data is currently unavailable.";
    }
  }

  return (
    <Container>
      {!brokers || errorMessage ? (
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
      ) : brokers.length === 0 ? (
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Investing</p>
            <h1 className="page-title is-compact">Brokerage</h1>
            <p className="page-description">
              Create a broker account first to unlock positions, trades, and
              allocation targets.
            </p>
          </div>
          <div className="page-inline-notice surface-dashed">
            No active broker accounts yet.
          </div>
        </section>
      ) : workspace && categories ? (
        <BrokeragePageClient
          workspace={workspace}
          categories={categories}
          showTransactionTimes={showTransactionTimes}
        />
      ) : null}
    </Container>
  );
}
