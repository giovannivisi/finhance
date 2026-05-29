import Container from "@components/Container";

export default function RouteLoadingShell({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  return (
    <Container>
      <section className="page-shell is-relaxed" aria-busy="true">
        <section className="page-hero">
          <div className="page-hero-copy">
            <p className="page-kicker">{kicker}</p>
            <h1 className="page-title is-compact">{title}</h1>
          </div>
        </section>

        <section className="route-stack-desktop-xl">
          <div className="glass-card">
            <div className="space-y-4 p-6">
              <div className="h-6 w-40 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="summary-grid is-loose sm:grid-cols-2 xl:grid-cols-4">
                <div className="summary-card h-24 animate-pulse" />
                <div className="summary-card h-24 animate-pulse" />
                <div className="summary-card h-24 animate-pulse" />
                <div className="summary-card h-24 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="glass-card h-64 animate-pulse" />
        </section>
      </section>
    </Container>
  );
}
