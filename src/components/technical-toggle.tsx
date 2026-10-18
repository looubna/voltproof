"use client";

import { useSyncExternalStore } from "react";
import { TECHNICAL_COOKIE, setPreferenceCookie } from "@/lib/preferences";

// The state lives on <html data-technical>, which globals.css uses to show or hide
// `.tech-detail` elements, so switching needs no reload and every toggle on the page agrees.
const EVENT = "vp:technical";
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};
const isOn = () => document.documentElement.dataset.technical === "on";

/** Shows or hides model names, version numbers, hashes and scores. Remembered in a cookie. */
export function TechnicalToggle({ initial, tone = "light", className = "", label = "Technical details" }: { initial: boolean; tone?: "light" | "dark"; className?: string; label?: string }) {
  const on = useSyncExternalStore(subscribe, isOn, () => initial);
  const toggle = () => {
    const next = !isOn();
    document.documentElement.dataset.technical = next ? "on" : "off";
    setPreferenceCookie(TECHNICAL_COOKIE, next ? "on" : "off");
    window.dispatchEvent(new Event(EVENT));
  };
  const track = on ? "bg-brand-500" : tone === "dark" ? "bg-white/25" : "bg-[#c9c4b8]";
  return (
    <button type="button" role="switch" aria-checked={on} onClick={toggle} className={`inline-flex min-h-11 items-center gap-2 text-sm ${className}`}>
      <span aria-hidden className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${track}`}>
        <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </span>
      {label}
    </button>
  );
}
