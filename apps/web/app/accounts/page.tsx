import Container from "@components/Container";
import AccountsPageClient from "@components/AccountsPageClient";
import { api } from "@lib/server-api";
import type {
  AccountReconciliationResponse,
  AccountResponse,
} from "@finhance/shared";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  let accounts: AccountResponse[] | null = null;
  let reconciliations: AccountReconciliationResponse[] | null = null;
  let errorMessage: string | null = null;

  try {
    [accounts, reconciliations] = await Promise.all([
      api<AccountResponse[]>("/accounts?includeArchived=true"),
      api<AccountReconciliationResponse[]>(
        "/accounts/reconciliation?includeArchived=true",
      ),
    ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Account data is currently unavailable.";
  }

  return (
    <>
      <Container>
        {!accounts || !reconciliations ? (
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
            accounts={accounts}
            reconciliations={reconciliations}
          />
        )}
      </Container>
    </>
  );
}
