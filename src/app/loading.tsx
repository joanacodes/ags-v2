export default function RootLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-ink-muted">
        <span className="h-2 w-2 animate-ping rounded-full bg-accent" />
        <span className="text-sm">Loading workspace…</span>
      </div>
    </div>
  );
}
