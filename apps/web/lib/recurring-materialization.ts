import type { MaterializeRecurringRulesResponse } from "@finhance/shared";
import { getApiUrl, readApiError } from "./api.ts";

export type RecurringMaterializationResult =
  | {
      ok: true;
      summary: MaterializeRecurringRulesResponse;
    }
  | {
      ok: false;
      status: number | null;
      error: string;
    };

export async function requestRecurringMaterialization(
  fetchImpl: typeof fetch = fetch,
): Promise<RecurringMaterializationResult> {
  try {
    const response = await fetchImpl(
      getApiUrl("/recurring-rules/materialize"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: await readApiError(response),
      };
    }

    return {
      ok: true,
      summary: (await response.json()) as MaterializeRecurringRulesResponse,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to sync due transactions.",
    };
  }
}
