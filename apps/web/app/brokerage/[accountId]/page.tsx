import Container from "@components/Container";
import BrokeragePageClient from "@components/BrokeragePageClient";
import { api } from "@lib/server-api";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";
import type {
  BrokerageWorkspaceResponse,
  CategoryResponse,
} from "@finhance/shared";

export const dynamic = "force-dynamic";

export default async function BrokerageAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  let workspace: BrokerageWorkspaceResponse | null = null;
  let categories: CategoryResponse[] | null = null;
  let showTransactionTimes = true;
  let errorMessage: string | null = null;

  try {
    const [settings, nextWorkspace, nextCategories] = await Promise.all([
      getUserSettingsOrDefaults(),
      api<BrokerageWorkspaceResponse>(`/brokerage/${accountId}`),
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
          showTransactionTimes={showTransactionTimes}
        />
      )}
    </Container>
  );
}
