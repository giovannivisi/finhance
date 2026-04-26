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
      style={{
        padding: "40px",
        marginTop: "32px",
        border: "1px solid var(--border-glass-strong)",
      }}
    >
      <h2
        style={{
          fontSize: "24px",
          fontWeight: 700,
          marginBottom: "8px",
          color: "var(--text-primary)",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: "15px",
          color: "var(--text-secondary)",
          marginBottom: "32px",
          maxWidth: "700px",
        }}
      >
        {description}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "24px",
        }}
      >
        {cards.map((card) => (
          <article
            key={card.code}
            className="glass-card"
            style={{
              padding: "28px",
              background: "var(--bg-card-hover)",
              border: "1px solid var(--border-glass-strong)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "-20px",
                right: "-20px",
                width: "100px",
                height: "100px",
                background: "var(--color-primary)",
                opacity: 0.05,
                filter: "blur(40px)",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            />

            <h3
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "12px",
                color: "var(--text-primary)",
              }}
            >
              {card.title}
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
                lineHeight: "1.6",
                marginBottom: "28px",
                flex: 1,
              }}
            >
              {card.detail}
            </p>
            <Link
              href={card.href}
              className="btn-primary"
              style={{ alignSelf: "flex-start" }}
            >
              {card.actionLabel}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
