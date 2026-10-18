import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { formatPlural } from "@/i18n/format";
import { en, type Messages } from "@/i18n/messages/en";
import { getI18n } from "@/i18n/server";
import { activeClaims } from "@/lib/claims/assess";
import { caseSummary } from "@/lib/derive";
import type { Case } from "@/lib/types";

interface Step {
  title: string;
  detail: string;
  done: boolean;
  href: string;
  action: string;
}

/** The four steps of a review, worked out from the case, so a first-time user always sees what to do next. */
export function caseSteps(c: Case, locale: Locale = "en", t: Messages["caseSteps"] = en.caseSteps): Step[] {
  const s = caseSummary(c);
  const docs = c.documents.length;
  const claims = activeClaims(c.claims).length;
  const reading = s.stage === "processing";
  const count = (forms: Parameters<typeof formatPlural>[1], n: number) => formatPlural(locale, forms, n);
  return [
    {
      title: t.upload.title,
      detail: docs ? count(t.upload.detail, docs) : t.upload.empty,
      done: docs > 0,
      href: "#upload",
      action: docs ? t.upload.more : t.upload.start,
    },
    {
      title: t.claims.title,
      detail: claims ? count(t.claims.detail, claims) : t.claims.empty,
      done: claims > 0,
      href: "#claims",
      action: claims ? t.claims.change : t.claims.start,
    },
    {
      title: t.review.title,
      detail: !docs ? t.review.noDocuments : reading ? t.review.reading : s.openReviewItems ? count(t.review.open, s.openReviewItems) : t.review.none,
      done: docs > 0 && !reading && s.openReviewItems === 0,
      href: `/review?case=${c.id}`,
      action: t.review.action,
    },
    {
      title: t.report.title,
      detail: t.report.detail,
      done: false,
      href: `/cases/${c.id}/report`,
      action: t.report.action,
    },
  ];
}

export async function CaseSteps({ c }: { c: Case }) {
  const { locale, m } = await getI18n();
  const t = m.caseSteps;
  const steps = caseSteps(c, locale, t);
  const current = steps.findIndex((s) => !s.done);
  return (
    <nav aria-label={t.label} className="mb-6">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li
              key={s.href}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex gap-3 rounded-xl border p-3 ${isCurrent ? "border-brand-600 bg-[#fdfcfa] ring-1 ring-brand-600" : "border-line bg-[#fdfcfa]"}`}
            >
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${s.done ? "bg-verified-dot text-white" : isCurrent ? "bg-brand-600 text-white" : "bg-unknown-bg text-unknown-fg"}`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  <span className="sr-only">{s.done ? t.done : isCurrent ? t.next : ""}</span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-xs text-muted">{s.detail}</p>
                <Link href={s.href} className={`mt-1.5 inline-block text-sm font-medium ${isCurrent ? "text-brand-700 underline underline-offset-2" : "text-brand-600 hover:underline"}`}>
                  {s.action} →
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
