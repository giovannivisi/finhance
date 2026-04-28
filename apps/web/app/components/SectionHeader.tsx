export default function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-header">
      <h2 className="section-header-title">{title}</h2>
      {action}
    </div>
  );
}
