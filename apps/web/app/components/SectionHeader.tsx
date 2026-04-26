export default function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "4px",
      }}
    >
      <h2
        style={{
          fontSize: "32px",
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "-0.03em",
          margin: 0,
        }}
      >
        {title}
      </h2>
      {action}
    </div>
  );
}
