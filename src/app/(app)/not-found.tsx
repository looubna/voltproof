import Link from "next/link";
import { EmptyState } from "@/components/ui";

/** Shown inside the app shell (header and navigation) when a case or document does not exist. */
export default function NotFound() {
  return (
    <EmptyState title="Not found">
      This case or document does not exist, or it was removed.{" "}
      <Link href="/dashboard" className="link">
        Back to the dashboard
      </Link>
    </EmptyState>
  );
}
