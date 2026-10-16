import Link from "next/link";
import { EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Not found">
      This case or document does not exist.{" "}
      <Link href="/" className="link">
        Back to the dashboard
      </Link>
    </EmptyState>
  );
}
