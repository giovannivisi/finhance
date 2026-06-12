import { normalizeServerUrl } from "@/api/client";

/**
 * The hosted finhance deployment this app signs into by default — the mobile
 * counterpart of visiting the web app. Overridable at build time for forks
 * and staging builds via EXPO_PUBLIC_PRODUCTION_SERVER_URL. Any override is
 * normalised the same way manual server URLs are; invalid values fall back to
 * the default deployment instead of producing a malformed auth URL.
 */
export const PRODUCTION_SERVER_URL =
  normalizeServerUrl(process.env.EXPO_PUBLIC_PRODUCTION_SERVER_URL ?? "") ||
  "https://finhance-web.vercel.app";
