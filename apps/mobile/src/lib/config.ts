/**
 * The hosted finhance deployment this app signs into by default — the mobile
 * counterpart of visiting the web app. Overridable at build time for forks
 * and staging builds via EXPO_PUBLIC_PRODUCTION_SERVER_URL.
 */
export const PRODUCTION_SERVER_URL =
  process.env.EXPO_PUBLIC_PRODUCTION_SERVER_URL?.trim() ||
  "https://finhance-web.vercel.app";
