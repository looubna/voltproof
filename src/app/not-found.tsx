import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { EmptyState } from "@/components/ui";

/** For URLs outside every route. Pages inside the app use (app)/not-found.tsx, which keeps the app header. */
export default function NotFound() {
  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-16">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
        <LogoMark className="h-6 w-6" />
        VoltProof
      </Link>
      <EmptyState title="Page not found">
        There is no page at this address.{" "}
        <Link href="/dashboard" className="link">
          Go to the dashboard
        </Link>
      </EmptyState>
    </main>
  );
}
