"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSingleFlightNavigation } from "@lib/single-flight";

export default function ReviewMonthPicker({
  currentMonth,
}: {
  currentMonth: string;
}) {
  const router = useRouter();
  const navigation = useSingleFlightNavigation();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const month =
      typeof formData.get("month") === "string"
        ? (formData.get("month") as string)
        : "";

    const target = month
      ? `/review?month=${encodeURIComponent(month)}`
      : "/review";
    const currentTarget = `/review?month=${encodeURIComponent(currentMonth)}`;

    if (target === currentTarget) {
      return;
    }

    navigation.run(() => {
      router.push(target);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="review-month"
          className="text-sm font-medium text-gray-600"
        >
          Month
        </label>
        <input
          id="review-month"
          name="month"
          type="month"
          defaultValue={currentMonth}
          className="rounded-lg border px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={navigation.isRunning}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {navigation.isRunning ? "Loading..." : "Load"}
      </button>
    </form>
  );
}
