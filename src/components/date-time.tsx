"use client";

import { useSyncExternalStore } from "react";

const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const DATE_TIME: Intl.DateTimeFormatOptions = { ...DATE, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" };

/** Server rendering cannot know the viewer's time zone, so it states UTC explicitly. */
export function formatUtc(iso: string, dateOnly = false, locale = "en-GB") {
  return new Date(iso).toLocaleString(locale, { ...(dateOnly ? DATE : DATE_TIME), timeZone: "UTC" });
}

function formatLocal(iso: string, dateOnly: boolean, locale: string) {
  return new Date(iso).toLocaleString(locale, dateOnly ? DATE : DATE_TIME);
}

const noop = () => () => {};

/**
 * A timestamp in the viewer's own time zone, with the zone shown ("17 Oct 2026, 00:43 GMT+8").
 * The server render (and the first client render, so hydration matches) shows UTC, labelled as such.
 */
export function DateTime({ iso, dateOnly = false, locale = "en-GB" }: { iso: string; dateOnly?: boolean; /** BCP 47, e.g. "ko-KR" */ locale?: string }) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  if (!iso || Number.isNaN(new Date(iso).getTime())) return <span>—</span>;
  return (
    <time dateTime={iso} title={new Date(iso).toISOString()}>
      {hydrated ? formatLocal(iso, dateOnly, locale) : formatUtc(iso, dateOnly, locale)}
    </time>
  );
}
