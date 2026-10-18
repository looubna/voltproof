import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { getI18n } from "@/i18n/server";

/** Shown inside the app shell (header and navigation) when a case or document does not exist. */
export default async function NotFound() {
  const { m } = await getI18n();
  return (
    <EmptyState title={m.notFound.title}>
      {m.notFound.body}{" "}
      <Link href="/dashboard" className="link">
        {m.notFound.back}
      </Link>
    </EmptyState>
  );
}
