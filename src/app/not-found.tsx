import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { EmptyState } from "@/components/ui";
import { getI18n } from "@/i18n/server";

/** For URLs outside every route. Pages inside the app use (app)/not-found.tsx, which keeps the app header. */
export default async function NotFound() {
  const { m } = await getI18n();
  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-16">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink">
        <LogoMark size={24} />
        VoltProof
      </Link>
      <EmptyState title={m.notFound.pageTitle}>
        {m.notFound.pageBody}{" "}
        <Link href="/dashboard" className="link">
          {m.notFound.toDashboard}
        </Link>
      </EmptyState>
    </main>
  );
}
