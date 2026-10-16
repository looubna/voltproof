// The VoltProof mark: one logo everywhere (landing page, app, sign-in, favicon in src/app/icon.svg).
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="#7fd3b2" />
      <path d="M8 16.5 13.5 22 24 10" fill="none" stroke="#0f1c2b" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
