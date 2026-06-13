import { getPrivacyNoticeConfig } from "@lib/privacy-notice";

export const runtime = "nodejs";

/**
 * Public mobile counterpart to `/privacy`. It exposes the same notice data
 * already rendered by the web page so native clients can show current
 * operator-specific controller, rights, processor, transfer, and retention
 * facts.
 */
export async function GET() {
  return Response.json(getPrivacyNoticeConfig(), {
    headers: { "cache-control": "no-store" },
  });
}
