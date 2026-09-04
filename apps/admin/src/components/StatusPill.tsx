const styles: Record<string, string> = {
  draft: "bg-card-alt text-lilac",
  ready: "bg-pink/20 text-pink-soft",
  live: "bg-live/20 text-live",
  closed: "bg-line text-lilac",
  open: "bg-lime/20 text-lime",
  resolved: "bg-line text-lilac",
};

export function StatusPill({ status }: { status: string }) {
  const cls = styles[status] ?? "bg-card-alt text-lilac";
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}
