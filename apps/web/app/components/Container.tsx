export default function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-12 pb-24 lg:pb-12">
      {children}
    </div>
  );
}
