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
    <form onSubmit={handleSubmit} className="filter-actions items-end">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="review-month"
          className="text-sm font-medium text-[var(--text-secondary)]"
        >
          Month
        </label>
        <input
          id="review-month"
          name="month"
          type="month"
          defaultValue={currentMonth}
        />
      </div>
      <button
        type="submit"
        disabled={navigation.isRunning}
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {navigation.isRunning ? "Loading..." : "Load"}
      </button>
    </form>
  );
}
