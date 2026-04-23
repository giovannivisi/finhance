import { fetchApiMutation, readApiError } from "./api.ts";

export type SnapshotCaptureResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number | null;
      error: string;
    };

export async function requestSnapshotCapture(
  fetchImpl: typeof fetch = fetch,
): Promise<SnapshotCaptureResult> {
  try {
    const response = await fetchApiMutation(
      "/snapshots/capture",
      {
        method: "POST",
        body: JSON.stringify({}),
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
          : "Unable to capture this snapshot.",
    };
  }
}
