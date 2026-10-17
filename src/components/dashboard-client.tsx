"use client";

import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import { SHOW_OPTIONS, SORT_OPTIONS, type DashboardQuery } from "@/lib/dashboard";
import { WELCOME_COOKIE, setPreferenceCookie } from "@/lib/preferences";

/**
 * Search, filter and sort. A GET form, so it works without JavaScript and the view
 * lives in the URL (shareable, back button works); next/form navigates without a reload.
 */
export function DashboardFilters({ query, showArchived }: { query: DashboardQuery; showArchived: boolean }) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  const filtered = !!query.q || query.show !== "all" || query.sort !== "newest";
  return (
    <Form action="/dashboard" role="search" aria-label="Find cases" className="flex flex-wrap items-end gap-3">
      {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
      <label className="grid min-w-56 flex-1 gap-1 text-sm">
        <span className="font-medium">Search</span>
        <input className="input" type="search" name="q" defaultValue={query.q} placeholder="VIN, model, case number or your reference" maxLength={80} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Show</span>
        <select className="input w-auto" name="show" defaultValue={query.show} onChange={submit}>
          {Object.entries(SHOW_OPTIONS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Sort</span>
        <select className="input w-auto" name="sort" defaultValue={query.sort} onChange={submit}>
          {Object.entries(SORT_OPTIONS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-secondary">Search</button>
      {filtered ? (
        <Link href={showArchived ? "/dashboard?archived=1" : "/dashboard"} className="link self-center text-sm">
          Clear
        </Link>
      ) : null}
    </Form>
  );
}

/** First-run help. Dismissal is remembered in a cookie, so the server leaves it out next time (no flash). */
export function WelcomePanel({ demoCaseId }: { demoCaseId: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <section aria-labelledby="welcome-title" className="mb-8 rounded-xl border border-brand-600/30 bg-brand-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="welcome-title" className="text-lg font-semibold text-ink">
            New to VoltProof? A review takes four steps.
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink/80">VoltProof checks what a seller says about a used EV against their paperwork, and shows you what is proven, what is only claimed and what is missing.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary px-3 py-1 text-xs"
          onClick={() => {
            setPreferenceCookie(WELCOME_COOKIE, "hidden");
            setHidden(true);
          }}
        >
          Hide this guide
        </button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Upload the documents", "Registration, invoices, battery report, a dashboard photo."],
          ["Add the seller's claims", "Paste the listing; each claim gets a status."],
          ["Review what needs a person", "Conflicts and missing evidence, with a next step for each."],
          ["Download the report", "Print it or save it as a PDF."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-lg bg-[#fdfcfa] p-3">
            <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{t}</p>
              <p className="text-xs text-muted">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={`/cases/${demoCaseId}`} className="btn btn-primary">
          Try a demo case
        </Link>
        <Link href="/cases/new" className="btn btn-secondary">
          Start a new case
        </Link>
        <Link href="/about#glossary" className="link text-sm">
          What the words mean
        </Link>
      </div>
    </section>
  );
}
