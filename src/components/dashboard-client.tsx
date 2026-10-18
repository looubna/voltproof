"use client";

import Form from "next/form";
import Link from "next/link";
import { useState } from "react";
import type { Messages } from "@/i18n/messages/en";
import { SHOWS, SORTS, type DashboardQuery } from "@/lib/dashboard";
import { WELCOME_COOKIE, setPreferenceCookie } from "@/lib/preferences";

type DashboardCopy = Messages["dashboard"];

/**
 * Search, filter and sort. A GET form, so it works without JavaScript and the view
 * lives in the URL (shareable, back button works); next/form navigates without a reload.
 */
export function DashboardFilters({ query, showArchived, copy }: { query: DashboardQuery; showArchived: boolean; copy: DashboardCopy["filters"] }) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  const filtered = !!query.q || query.show !== "all" || query.sort !== "newest";
  return (
    <Form action="/dashboard" role="search" aria-label={copy.label} className="flex flex-wrap items-end gap-3">
      {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
      <label className="grid min-w-56 flex-1 gap-1 text-sm">
        <span className="font-medium">{copy.search}</span>
        <input className="input" type="search" name="q" defaultValue={query.q} placeholder={copy.searchPlaceholder} maxLength={80} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{copy.show}</span>
        <select className="input w-auto" name="show" defaultValue={query.show} onChange={submit}>
          {SHOWS.map((v) => (
            <option key={v} value={v}>
              {copy.showOptions[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{copy.sort}</span>
        <select className="input w-auto" name="sort" defaultValue={query.sort} onChange={submit}>
          {SORTS.map((v) => (
            <option key={v} value={v}>
              {copy.sortOptions[v]}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-secondary">{copy.submit}</button>
      {filtered ? (
        <Link href={showArchived ? "/dashboard?archived=1" : "/dashboard"} className="link self-center text-sm">
          {copy.clear}
        </Link>
      ) : null}
    </Form>
  );
}

/** First-run help. Dismissal is remembered in a cookie, so the server leaves it out next time (no flash). */
export function WelcomePanel({ demoCaseId, copy }: { demoCaseId: string; copy: DashboardCopy["welcome"] }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <section aria-labelledby="welcome-title" className="mb-8 rounded-xl border border-brand-600/30 bg-brand-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="welcome-title" className="text-lg font-semibold text-ink">
            {copy.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink/80">{copy.body}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary px-3 py-1 text-xs"
          onClick={() => {
            setPreferenceCookie(WELCOME_COOKIE, "hidden");
            setHidden(true);
          }}
        >
          {copy.hide}
        </button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.values(copy.steps).map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-lg bg-[#fdfcfa] p-3">
            <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={`/cases/${demoCaseId}`} className="btn btn-primary">
          {copy.tryDemo}
        </Link>
        <Link href="/cases/new" className="btn btn-secondary">
          {copy.start}
        </Link>
        <Link href="/about#glossary" className="link text-sm">
          {copy.words}
        </Link>
      </div>
    </section>
  );
}
