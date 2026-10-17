"use client";

import { useI18n } from "@/i18n/client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { errorPage } = useI18n();
  return (
    <div className="rounded-xl border border-red-200 bg-[#fdfcfa] px-6 py-10 text-center">
      <p className="font-medium">{errorPage.title}</p>
      <button className="btn btn-secondary mt-3" onClick={reset}>
        {errorPage.retry}
      </button>
    </div>
  );
}
