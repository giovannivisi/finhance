"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl, readApiError } from "@lib/api";

export default function ReviewCaptureSnapshotButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  async function handleCapture() {
    setError(null);
    setIsCapturing(true);

    try {
      const response = await fetch(getApiUrl("/snapshots/capture"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        setError(await readApiError(response));
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
    </div>
  );
}
