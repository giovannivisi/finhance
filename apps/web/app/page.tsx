import { redirect } from "next/navigation";
import AuthPageClient from "@components/AuthPageClient";
import Container from "@components/Container";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";
import { getStartPageHref } from "@lib/user-settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (isHostedAuthMode()) {
    const session = await auth();

    if (!session?.user?.id) {
      return (
        <Container>
          <AuthPageClient mode="landing" callbackUrl="/dashboard" />
        </Container>
      );
    }
  }

  const settings = await getUserSettingsOrDefaults();
  redirect(getStartPageHref(settings.startPage));
}
