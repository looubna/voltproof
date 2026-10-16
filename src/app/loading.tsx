export default function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded bg-line" />
      <div className="h-40 animate-pulse rounded-xl bg-line/60" />
      <div className="h-64 animate-pulse rounded-xl bg-line/60" />
    </div>
  );
}
