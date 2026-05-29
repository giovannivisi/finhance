export default function DashboardSupportSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-live="polite">
      <div className="glass-card h-28 bg-[var(--bg-card-muted)] animate-pulse" />
      <div className="glass-card h-28 bg-[var(--bg-card-muted)] animate-pulse" />
    </div>
  );
}
