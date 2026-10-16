"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-[#fdfcfa] px-6 py-10 text-center">
      <p className="font-medium">Something went wrong loading this page.</p>
      <button className="btn btn-secondary mt-3" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
