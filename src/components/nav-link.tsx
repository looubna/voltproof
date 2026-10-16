"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

function PendingDot() {
  const { pending } = useLinkStatus();
  // Absolutely positioned, so it takes no width (tab bars must still fit at 390 px).
  return <span aria-hidden className={`pointer-events-none absolute right-0.5 top-1 h-1.5 w-1.5 rounded-full bg-brand-600 transition-opacity ${pending ? "animate-pulse opacity-100" : "opacity-0"}`} />;
}

/** A Link that shows a small pulsing dot while its navigation is in flight, so a click always gets feedback. */
export function NavLink({ children, className = "", ...props }: ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link {...props} className={`relative ${className}`}>
      {children}
      <PendingDot />
    </Link>
  );
}
