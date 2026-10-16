import Link from "next/link";
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The four steps of a review, worked out from the case, so a first-time user always sees what to do next. */
export function caseSteps(c: Case): Step[] {
  const s = caseSummary(c);
  const docs = c.documents.length;
  const claims = activeClaims(c.claims).length;
  const reading = s.stage === "processing";
  return [
    {
      title: "Upload the documents",
      detail: docs ? `${plural(docs, "document")} on file` : "Registration, invoices, battery report, dashboard photo",
      done: docs > 0,
      href: "#upload",
      action: docs ? "Add more" : "Upload",
    },
    {
      title: "Add the seller's claims",
      detail: claims ? `${plural(claims, "claim")} being checked` : "Paste the listing: battery health, mileage, accidents",
      done: claims > 0,
      href: "#claims",
      action: claims ? "Change" : "Add claims",
    },
    {
      title: "Review what needs a person",
      detail: !docs ? "Conflicts and missing evidence appear here" : reading ? "Documents are still being read" : s.openReviewItems ? `${plural(s.openReviewItems, "item")} to review` : "Nothing left to review",
      done: docs > 0 && !reading && s.openReviewItems === 0,
      href: `/review?case=${c.id}`,
      action: "Review",
    },
    {
      title: "Download the report",
      detail: "Print it or save it as a PDF to share",
      done: false,
      href: `/cases/${c.id}/report`,
      action: "Open report",
    },
  ];
}

export function CaseSteps({ c }: { c: Case }) {
  const steps = caseSteps(c);
  const current = steps.findIndex((s) => !s.done);
  return (
    <nav aria-label="Steps for this case" className="mb-6">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => {
          const isCurrent = i === current;
          return (
            <li
              key={s.title}
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
                  <span className="sr-only">{s.done ? "Done: " : isCurrent ? "Next: " : ""}</span>
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
