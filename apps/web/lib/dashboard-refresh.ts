import { fetchApiMutation, readApiError } from "./api.ts";
import { getRepeatedActionNotice } from "./request-safety.ts";
import type { RefreshAssetsResponse } from "@finhance/shared";

export type DashboardRefreshMode = "auto" | "manual";

export type DashboardRefreshResult =
  | {
      ok: true;
      refreshedAt: string | null;
      warning: string | null;
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
      let refreshedAt: string | null = null;
      let warning: string | null = null;
      try {
        const payload =
          (await response.json()) as Partial<RefreshAssetsResponse>;
        if (
          payload &&
          typeof payload === "object" &&
          "refreshedAt" in payload &&
          typeof payload.refreshedAt === "string"
        ) {
          refreshedAt = payload.refreshedAt;
        }
        if (typeof payload.priceRefresh?.message === "string") {
          warning = payload.priceRefresh.message;
        }
      } catch {
        // Older/local endpoints may return an empty success body.
      }

      return { ok: true, refreshedAt, warning };
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
