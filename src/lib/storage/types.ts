import type { Case, Lead } from "../types";

export interface Store {
  readonly kind: "local" | "gcp";
  listCases(): Promise<Case[]>;
  getCase(id: string): Promise<Case | null>;
  /** Writes a case, replacing any existing case with the same id. */
  putCase(c: Case): Promise<void>;
  /** Read-modify-write under a lock (local) or transaction (Firestore). */
  updateCase(id: string, mutate: (c: Case) => void): Promise<Case>;
  putFile(key: string, data: Buffer, contentType: string): Promise<void>;
  getFile(key: string): Promise<Buffer | null>;
  /** Creates the lead if its id is new. Returns false when it already existed. */
  putLead(lead: Lead): Promise<boolean>;
  listLeads(): Promise<Lead[]>;
}
