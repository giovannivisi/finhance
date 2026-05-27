import Container from "@components/Container";

export default function DashboardLoading() {
  return (
    <Container>
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <div className="glass-card p-8">
          <div className="space-y-3">
            <div className="h-4 w-28 rounded-full bg-[var(--bg-card-muted)]" />
            <div className="h-12 w-64 rounded-2xl bg-[var(--bg-card-muted)]" />
            <div className="h-4 w-56 rounded-full bg-[var(--bg-card-muted)]" />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass-card h-64 bg-[var(--bg-card-muted)]" />
          <div className="glass-card h-64 bg-[var(--bg-card-muted)]" />
        </div>

        <div className="grid gap-6">
          <div className="glass-card h-28 bg-[var(--bg-card-muted)]" />
          <div className="glass-card h-28 bg-[var(--bg-card-muted)]" />
        </div>
      </div>
    </Container>
  );
}
