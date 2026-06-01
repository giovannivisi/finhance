import { redirect } from "next/navigation";
import { getUserSettingsOrDefaults } from "@lib/server-user-settings";
import { getStartPageHref } from "@lib/user-settings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await getUserSettingsOrDefaults();
  redirect(getStartPageHref(settings.startPage));
}
