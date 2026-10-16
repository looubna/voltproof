import { route } from "@/lib/api";
import { getStore } from "@/lib/storage";

function csv(v: unknown) {
  const s = v === undefined || v === null ? "" : String(v);
  // Quote, and neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

/** Signed-in only: download waitlist and demo requests as CSV. */
export const GET = route(async () => {
  const leads = await getStore().listLeads();
  const cols = ["createdAt", "kind", "email", "name", "company", "role", "volumeRange", "wantsToVerify", "marketingOptIn"] as const;
  const rows = [cols.join(","), ...leads.map((l) => cols.map((c) => csv(l[c])).join(","))];
  return new Response(rows.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="voltproof-leads.csv"' } });
});
