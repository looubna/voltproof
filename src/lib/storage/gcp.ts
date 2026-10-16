// Google Cloud store: Firestore for case records (one document per case,
// including findings, reviews and the audit log) and Cloud Storage for
// uploaded files. Authenticates with Application Default Credentials.
import { Firestore } from "@google-cloud/firestore";
import { Storage } from "@google-cloud/storage";
import type { AppConfig } from "../config";
import type { Case, Lead } from "../types";
import type { Store } from "./types";

export class GcpStore implements Store {
  readonly kind = "gcp" as const;
  private db: Firestore;
  private bucket;
  private collection: string;

  constructor(cfg: AppConfig) {
    if (!cfg.gcsBucket) throw new Error("GCS_BUCKET is required when VOLTPROOF_STORAGE=gcp");
    this.db = new Firestore({ projectId: cfg.gcpProject || undefined, databaseId: cfg.firestoreDatabaseId, ignoreUndefinedProperties: true });
    this.bucket = new Storage({ projectId: cfg.gcpProject || undefined }).bucket(cfg.gcsBucket);
    this.collection = cfg.firestoreCollection;
    this.leadsCollection = `${cfg.firestoreCollection}_leads`;
  }

  private leadsCollection: string;

  async putLead(lead: Lead) {
    try {
      await this.db.collection(this.leadsCollection).doc(lead.id).create(lead);
      return true;
    } catch (e) {
      // gRPC ALREADY_EXISTS
      if ((e as { code?: number }).code === 6) return false;
      throw e;
    }
  }

  async listLeads() {
    const snap = await this.db.collection(this.leadsCollection).orderBy("createdAt", "desc").limit(1000).get();
    return snap.docs.map((d) => d.data() as Lead);
  }

  private ref(id: string) {
    return this.db.collection(this.collection).doc(id);
  }

  async listCases() {
    const snap = await this.db.collection(this.collection).get();
    return snap.docs.map((d) => d.data() as Case);
  }

  async getCase(id: string) {
    const snap = await this.ref(id).get();
    return snap.exists ? (snap.data() as Case) : null;
  }

  async putCase(c: Case) {
    await this.ref(c.id).set(JSON.parse(JSON.stringify(c)));
  }

  async updateCase(id: string, mutate: (c: Case) => void) {
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.ref(id));
      if (!snap.exists) throw new Error("Case not found");
      const c = snap.data() as Case;
      mutate(c);
      tx.set(this.ref(id), JSON.parse(JSON.stringify(c)));
      return c;
    });
  }

  async putFile(key: string, data: Buffer, contentType: string) {
    await this.bucket.file(key).save(data, { contentType, resumable: false });
  }

  async getFile(key: string) {
    const f = this.bucket.file(key);
    const [exists] = await f.exists();
    if (!exists) return null;
    const [buf] = await f.download();
    return buf;
  }
}
