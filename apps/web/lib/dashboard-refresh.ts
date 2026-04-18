import { getApiUrl, readApiError } from "./api.ts";

export type DashboardRefreshMode = "auto" | "manual";

export type DashboardRefreshResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number | null;
      error: string;
    };

export function shouldIgnoreDashboardRefreshError(
  mode: DashboardRefreshMode,
  status: number | null,
): boolean {
  return mode === "auto" && (status === 409 || status === 429);
}

export async function requestDashboardRefresh(
  fetchImpl: typeof fetch = fetch,
): Promise<DashboardRefreshResult> {
  try {
    const response = await fetchImpl(getApiUrl("/assets/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      return { ok: true };
    }

    return {
      ok: false,
      status: response.status,
      error: await readApiError(response),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to refresh asset quotes.",
    };
  }
}
