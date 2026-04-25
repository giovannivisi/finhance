import Link from "next/link";
import type { WorkflowCard } from "@lib/workflow";

export default function WorkflowSection({
  title,
  description,
  cards,
}: {
  title: string;
  description: string;
  cards: WorkflowCard[];
}) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.code}
            className="rounded-2xl border border-gray-200 p-5"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              {card.title}
            </h3>
            <p className="mt-2 text-sm text-gray-600">{card.detail}</p>
            <Link
              href={card.href}
              className="mt-4 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              {card.actionLabel}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
