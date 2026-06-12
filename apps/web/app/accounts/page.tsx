import Container from "@components/Container";
import AccountsPageClient from "@components/AccountsPageClient";
import { isMissingPageDataRouteError } from "@lib/api-fallback";
import { api } from "@lib/server-api";
import type {
  AccountReconciliationResponse,
  AccountResponse,
  AccountsPageDataResponse,
} from "@finhance/shared";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  let pageData: AccountsPageDataResponse | null = null;
  let errorMessage: string | null = null;

  try {
    pageData = await api<AccountsPageDataResponse>(
      "/accounts/page-data?includeArchived=true",
    );
  } catch (error) {
    if (isMissingPageDataRouteError(error)) {
      try {
        const [accounts, reconciliations] = await Promise.all([
          api<AccountResponse[]>("/accounts?includeArchived=true"),
          api<AccountReconciliationResponse[]>(
            "/accounts/reconciliation?includeArchived=true",
          ),
        ]);
        pageData = { accounts, reconciliations };
      } catch (fallbackError) {
        errorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : "Account data is currently unavailable.";
      }
    } else {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Account data is currently unavailable.";
    }
  }

  return (
    <>
      <Container>
        {!pageData ? (
          <section className="page-shell">
            <div className="page-hero">
              <p className="page-kicker">Structure</p>
              <h1 className="page-title is-compact">Accounts</h1>
            </div>
            <div className="page-inline-notice surface-warning">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </section>
        ) : (
          <AccountsPageClient
            accounts={pageData.accounts}
            reconciliations={pageData.reconciliations}
          />
        )}
      </Container>
    </>
  );
}
