import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Current reviewer name, or null. */
export async function currentUser(): Promise<string | null> {
  const jar = await cookies();
  const s = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  return s?.name ?? null;
}

export async function requireUser(): Promise<string> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
