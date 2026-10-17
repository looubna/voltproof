"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SignOutButton } from "@/components/client";
import { TechnicalToggle } from "@/components/technical-toggle";
import type { Messages } from "@/i18n/messages/en";

type NavCopy = Messages["nav"];

const LINKS: { href: string; key: "dashboard" | "newCase" | "reviewQueue" | "howItWorks" }[] = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/cases/new", key: "newCase" },
  { href: "/review", key: "reviewQueue" },
  { href: "/about", key: "howItWorks" },
];

/** Closes a popover on Escape (returning focus to its button) and on a click outside it. */
function useDismiss(open: boolean, close: () => void, root: React.RefObject<HTMLElement | null>, button: React.RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close, root, button]);
}

function NavLinks({ pathname, copy, vertical = false }: { pathname: string; copy: NavCopy; vertical?: boolean }) {
  return (
    <>
      {LINKS.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 ${vertical ? "flex min-h-11 items-center text-base" : "py-1.5"} ${active ? "bg-white/10 font-medium text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
          >
            {copy[l.key]}
          </Link>
        );
      })}
    </>
  );
}

function AccountMenu({ user, technical, copy, homeHref }: { user: string; technical: boolean; copy: NavCopy; homeHref: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, button);
  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-white/85 hover:bg-white/10 hover:text-white">
        {user}
        <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="currentColor">
          <path d="M5.2 7.7a.75.75 0 0 1 1.06.04L10 11.6l3.74-3.86a.75.75 0 1 1 1.08 1.04l-4.28 4.42a.75.75 0 0 1-1.08 0L5.16 8.78a.75.75 0 0 1 .04-1.06Z" />
        </svg>
      </button>
      {open && (
        <div id={id} className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-line bg-[#fdfcfa] p-3 text-ink shadow-lg">
          <p className="px-1 text-xs text-muted">{copy.signedInAs}</p>
          <p className="truncate px-1 font-medium">{user}</p>
          <div className="mt-2 border-t border-line pt-1">
            <TechnicalToggle initial={technical} className="w-full px-1" label={copy.technicalDetails} />
            <p className="px-1 pb-2 text-xs text-muted">{copy.technicalHint}</p>
          </div>
          <div className="border-t border-line pt-2">
            <SignOutButton className="w-full rounded-md px-1 py-2 text-left text-sm text-ink hover:bg-brand-50" label={copy.signOut} redirectTo={homeHref} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The app header's navigation: inline on wide screens, a menu on phones. The language switcher
 * comes in twice: as a menu in the header, and as a list inside the phone menu.
 */
export function AppNav({
  user,
  technical,
  aiMode,
  copy,
  homeHref,
  languageMenu,
  languageList,
}: {
  user: string;
  technical: boolean;
  aiMode: ReactNode;
  copy: NavCopy;
  /** Where signing out leads: the landing page in the current language. */
  homeHref: string;
  languageMenu: ReactNode;
  languageList: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root, button);
  // A link in the menu was followed: close it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <nav aria-label={copy.label} className="hidden flex-wrap gap-1 text-sm md:flex">
        <NavLinks pathname={pathname} copy={copy} />
      </nav>
      <div className="ml-auto hidden items-center gap-2 md:flex">
        {aiMode}
        {languageMenu}
        <AccountMenu user={user} technical={technical} copy={copy} homeHref={homeHref} />
      </div>

      <div ref={root} className="ml-auto md:hidden">
        <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-white hover:bg-white/10">
          <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
          </svg>
          {open ? copy.close : copy.menu}
        </button>
        {open && (
          <div id={id} className="absolute inset-x-0 top-full z-20 border-t border-white/10 bg-navy-950 px-4 pb-4 pt-2 shadow-lg">
            <nav aria-label={copy.label} className="grid gap-1">
              <NavLinks pathname={pathname} copy={copy} vertical />
            </nav>
            <div className="mt-3 border-t border-white/10 pt-3">{languageList}</div>
            <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 text-sm">
              <div>{aiMode}</div>
              <p className="text-white/70">
                {copy.signedInAs} <span className="font-medium text-white">{user}</span>
              </p>
              <TechnicalToggle initial={technical} tone="dark" className="text-white/85" label={copy.technicalDetails} />
              <SignOutButton className="min-h-11 text-left text-sm text-white/85 hover:text-white" label={copy.signOut} redirectTo={homeHref} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
