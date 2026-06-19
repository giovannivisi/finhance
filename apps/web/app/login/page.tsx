import { redirect } from "next/navigation";
import AuthPageClient from "@components/AuthPageClient";
import Container from "@components/Container";
import { auth } from "@lib/auth";
import { isHostedAuthMode } from "@lib/auth-mode";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";
import { getStartPageHref } from "@lib/user-settings";

export const dynamic = "force-dynamic";

type RawSearchParams = Promise<Record<string, string | string[] | undefined>>;

function resolveCallbackUrl(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const rawValue = searchParams.callbackUrl;
  const callbackUrl = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (
    typeof callbackUrl === "string" &&
    callbackUrl.startsWith("/") &&
    !callbackUrl.startsWith("//")
  ) {
    return callbackUrl;
  }

  return "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: RawSearchParams;
}) {
  if (!isHostedAuthMode()) {
    return redirect("/");
  }

  const session = await auth();

  if (session?.user?.id) {
    const settings = await getUserSettingsOrDefaults();
    return redirect(getStartPageHref(settings.startPage));
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};

  return (
    <Container>
      <AuthPageClient
        mode="login"
        callbackUrl={resolveCallbackUrl(resolvedSearchParams)}
      />
    </Container>
  );
}
