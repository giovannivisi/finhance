import { redirect } from "next/navigation";
import AuthPageClient from "@components/AuthPageClient";
import Container from "@components/Container";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";
import { getStartPageHref } from "@lib/user-settings";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (!isHostedAuthMode()) {
    return redirect("/");
  }

  const session = await auth();

  if (session?.user?.id) {
    const settings = await getUserSettingsOrDefaults();
    return redirect(getStartPageHref(settings.startPage));
  }

  return (
    <Container>
      <AuthPageClient mode="signup" callbackUrl="/dashboard" />
    </Container>
  );
}
