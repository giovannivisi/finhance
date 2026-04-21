import Header from "@components/Header";
import Container from "@components/Container";
import AccountsPageClient from "@components/AccountsPageClient";
import { api } from "@lib/api";
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
      <Header />
      <Container>
        {!accounts || !reconciliations ? (
          <>
            <h1 className="text-3xl font-semibold text-gray-900">Accounts</h1>
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
              <p className="font-medium">
                The web app could not reach the API.
              </p>
              <p className="mt-2 text-sm text-amber-900/80">
                {errorMessage ?? "Start the API and refresh the page."}
              </p>
            </div>
          </>
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
