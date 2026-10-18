"use client";

import { useEffect, useRef } from "react";
import { setLocale } from "@/i18n/actions";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";

interface Props {
  current: Locale;
  /** "Language", in the current language. */
  label: string;
  /**
   * Links per language, for pages whose URL carries the language (the landing page):
   * crawlable, shareable and working without JavaScript. Without them, the choice is
   * saved with a Server Action and the page re-renders in place (the app).
   */
  hrefs?: Record<Locale, string>;
  /** "menu": a button that opens a list. "list": the options shown inline (inside the phone menu). */
  variant?: "menu" | "list";
  tone?: "dark" | "light";
  className?: string;
}

function Globe() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M2.75 10h14.5M10 2.75c2 2.1 3 4.5 3 7.25s-1 5.15-3 7.25c-2-2.1-3-4.5-3-7.25s1-5.15 3-7.25Z" />
    </svg>
  );
}

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor">
      <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" />
    </svg>
  );
}

/** One option per language, named in that language (never a flag: flags are countries, not languages). */
function Options({ current, hrefs, tone, onChosen }: Pick<Props, "current" | "hrefs" | "tone"> & { onChosen?: () => void }) {
  const item = (l: Locale) =>
    `flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm ${
      tone === "dark" ? (l === current ? "bg-white/10 font-semibold text-white" : "text-white/85 hover:bg-white/10") : l === current ? "bg-brand-50 font-semibold text-ink" : "text-ink hover:bg-brand-50"
    }`;
  const content = (l: Locale) => (
    <>
      {LOCALE_NAMES[l]}
      {l === current ? <Check /> : null}
    </>
  );
  if (hrefs)
    return (
      <ul className="grid gap-0.5">
        {LOCALES.map((l) => (
          <li key={l}>
            {/* A full page load: the landing page's <html lang> and metadata belong to each URL. */}
            <a href={hrefs[l]} hrefLang={l} lang={l} aria-current={l === current ? "true" : undefined} className={item(l)}>
              {content(l)}
            </a>
          </li>
        ))}
      </ul>
    );
  return (
    <form action={setLocale} onSubmit={onChosen}>
      <ul className="grid gap-0.5">
        {LOCALES.map((l) => (
          <li key={l}>
            <button type="submit" name="locale" value={l} lang={l} aria-current={l === current ? "true" : undefined} className={item(l)}>
              {content(l)}
            </button>
          </li>
        ))}
      </ul>
    </form>
  );
}

export function LanguageSwitcher({ current, label, hrefs, variant = "menu", tone = "dark", className = "" }: Props) {
  const details = useRef<HTMLDetailsElement>(null);

  // <details> opens and closes by itself (so it works before JavaScript loads); this adds
  // closing on Escape, with focus back on the button, and on a click outside.
  useEffect(() => {
    const el = details.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  if (variant === "list")
    return (
      <div role="group" aria-label={label} className={className}>
        <p className={`mb-1 flex items-center gap-2 text-sm ${tone === "dark" ? "text-white/70" : "text-muted"}`}>
          <Globe />
          {label}
        </p>
        <Options current={current} hrefs={hrefs} tone={tone} />
      </div>
    );

  return (
    <details ref={details} className={`relative ${className}`}>
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 text-sm [&::-webkit-details-marker]:hidden ${
          tone === "dark" ? "text-white/85 hover:bg-white/10 hover:text-white" : "text-ink hover:bg-brand-50"
        }`}
      >
        <Globe />
        <span className="sr-only">{label}: </span>
        {/* Phones show the short code to leave room in the header; screen readers always get the full name. */}
        <span lang={current} className="sr-only sm:not-sr-only">
          {LOCALE_NAMES[current]}
        </span>
        <span aria-hidden className="text-xs font-semibold uppercase sm:hidden">
          {current}
        </span>
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor">
          <path d="M5.2 7.7a.75.75 0 0 1 1.06.04L10 11.6l3.74-3.86a.75.75 0 1 1 1.08 1.04l-4.28 4.42a.75.75 0 0 1-1.08 0L5.16 8.78a.75.75 0 0 1 .04-1.06Z" />
        </svg>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-[#fdfcfa] p-1.5 shadow-lg">
        <Options current={current} hrefs={hrefs} tone="light" onChosen={() => details.current && (details.current.open = false)} />
      </div>
    </details>
  );
}
