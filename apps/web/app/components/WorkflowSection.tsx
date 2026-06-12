import Link from "next/link";
import type { WorkflowCard } from "@lib/workflow";

export default function WorkflowSection({
  title,
  description,
  cards,
  className,
}: {
  title: string;
  description: string;
  cards: WorkflowCard[];
  className?: string;
}) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section
      className={`page-section workflow-section${className ? ` ${className}` : ""}`}
    >
      <h2 className="section-title">{title}</h2>
      <p className="section-subtitle">{description}</p>

      <div className="workflow-grid">
        {cards.map((card) => (
          <article key={card.code} className="workflow-card">
            <h3 className="workflow-card-title">{card.title}</h3>
            <p className="workflow-card-detail">{card.detail}</p>
            <Link
              href={card.href}
              prefetch={false}
              className="btn-secondary mt-auto self-start"
            >
              {card.actionLabel}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
