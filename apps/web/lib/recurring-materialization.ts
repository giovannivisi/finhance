import type { MaterializeRecurringRulesResponse } from "@finhance/shared";
import { fetchApiMutation, readApiError } from "./api.ts";

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

let inFlightRecurringMaterialization: Promise<RecurringMaterializationResult> | null =
  null;

export async function requestRecurringMaterialization(
  fetchImpl: typeof fetch = fetch,
): Promise<RecurringMaterializationResult> {
  if (inFlightRecurringMaterialization) {
    return inFlightRecurringMaterialization;
  }

  inFlightRecurringMaterialization = (async () => {
    try {
      const response = await fetchApiMutation(
        "/recurring-rules/materialize",
        {
          method: "POST",
        },
        fetchImpl,
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
    } finally {
      inFlightRecurringMaterialization = null;
    }
  })();

  return inFlightRecurringMaterialization;
}
