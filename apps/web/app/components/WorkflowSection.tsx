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
    <section
      className="glass-card"
      style={{ padding: "32px", marginTop: "24px" }}
    >
      <h2 style={{ marginBottom: "8px" }}>{title}</h2>
      <p style={{ marginBottom: "24px" }}>{description}</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "20px",
        }}
      >
        {cards.map((card) => (
          <article
            key={card.code}
            className="glass-card"
            style={{ padding: "24px", background: "var(--bg-card-hover)" }}
          >
            <h3>{card.title}</h3>
            <p style={{ fontSize: "14px", marginBottom: "16px" }}>
              {card.detail}
            </p>
            <Link href={card.href} className="btn-primary">
              {card.actionLabel}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
