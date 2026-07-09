import type { UserSettingsResponse } from "@finhance/shared/users";
import Container from "@components/Container";
import UserSettingsPageClient from "@components/UserSettingsPageClient";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { getUserIdentityForUser } from "@lib/connected-accounts";
import { api } from "@lib/server-api";

export const dynamic = "force-dynamic";

export default async function UserSettingsPage() {
  let settings: UserSettingsResponse | null = null;
  let errorMessage: string | null = null;
  const hostedAuthMode = isHostedAuthMode();
  const session = hostedAuthMode ? await auth() : null;
  const userId = session?.user?.id?.trim() || null;
  const identity = userId ? await getUserIdentityForUser(userId) : null;

  try {
    settings = await api<UserSettingsResponse>("/users/me/settings");
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "User settings are currently unavailable.";
  }

  return (
    <Container>
      {!settings ? (
        <section className="page-shell">
          <div className="page-hero">
            <p className="page-kicker">Account</p>
            <h1 className="page-title is-compact">User settings</h1>
          </div>
          <div className="page-inline-notice surface-warning">
            <p className="font-medium">The web app could not reach the API.</p>
            <p className="mt-2 text-sm">
              {errorMessage ?? "Start the API and refresh the page."}
            </p>
          </div>
        </section>
      ) : (
        <UserSettingsPageClient
          initialSettings={settings}
          identity={identity}
          canSignOutMobileDevices={hostedAuthMode}
          canManageConnectedAccounts={hostedAuthMode}
          canManagePasskeys={hostedAuthMode}
        />
      )}
    </Container>
  );
}
