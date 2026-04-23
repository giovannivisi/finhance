"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getRepeatedActionNotice } from "@lib/request-safety";
import { requestSnapshotCapture } from "@lib/snapshot-capture";
import { useSingleFlightActions } from "@lib/single-flight";

export default function ReviewCaptureSnapshotButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const actions = useSingleFlightActions<"capture">();

  async function handleCapture() {
    await actions.run("capture", async () => {
      setError(null);
      setNotice(null);
      setIsCapturing(true);

      try {
        const result = await requestSnapshotCapture();
        if (!result.ok) {
          const repeatedActionNotice = getRepeatedActionNotice({
            status: result.status,
            error: result.error,
          });

          if (repeatedActionNotice) {
            setNotice(repeatedActionNotice);
            return;
          }

          setError(result.error);
          return;
        }

        router.refresh();
      } catch (captureError) {
        setError(
          captureError instanceof Error
            ? captureError.message
            : "Unable to capture this snapshot.",
        );
      } finally {
        setIsCapturing(false);
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleCapture()}
        disabled={isCapturing}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isCapturing ? "Capturing..." : "Capture snapshot"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-amber-700">{notice}</p> : null}
    </div>
  );
}
