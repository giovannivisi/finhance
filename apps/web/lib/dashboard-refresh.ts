import { fetchApiMutation, readApiError } from "./api.ts";
import { getRepeatedActionNotice } from "./request-safety.ts";

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

export function getDashboardRefreshNotice(
  status: number | null,
  error: string,
): string | null {
  return getRepeatedActionNotice({ status, error });
}

export async function requestDashboardRefresh(
  fetchImpl: typeof fetch = fetch,
): Promise<DashboardRefreshResult> {
  try {
    const response = await fetchApiMutation(
      "/assets/refresh",
      {
        method: "POST",
      },
      fetchImpl,
    );

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
