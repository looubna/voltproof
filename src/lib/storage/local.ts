// Local development store: one JSON file per case, documents on disk.
// Not durable on Cloud Run (ephemeral filesystem); use the gcp store there.
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Case, Lead } from "../types";
import type { Store } from "./types";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_KEY = /^[A-Za-z0-9_\-/.]+$/;

export class LocalStore implements Store {
  readonly kind = "local" as const;
  private locks = new Map<string, Promise<unknown>>();
  constructor(private root: string) {}

  private casePath(id: string) {
    if (!SAFE_ID.test(id)) throw new Error("Invalid case id");
    return path.join(this.root, "cases", `${id}.json`);
  }

  private filePath(key: string) {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("Invalid file key");
    return path.join(this.root, "files", key);
  }

  async listCases() {
    const dir = path.join(this.root, "cases");
    await mkdir(dir, { recursive: true });
    const names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
    const cases = await Promise.all(names.map((n) => this.getCase(n.slice(0, -5))));
    return cases.filter((c): c is Case => c !== null);
  }

  async getCase(id: string) {
    try {
      return JSON.parse(await readFile(this.casePath(id), "utf8")) as Case;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async putCase(c: Case) {
    const p = this.casePath(c.id);
    await mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(c, null, 2));
    await rename(tmp, p);
  }

  async updateCase(id: string, mutate: (c: Case) => void) {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(async () => {
      const c = await this.getCase(id);
      if (!c) throw new Error("Case not found");
      mutate(c);
      await this.putCase(c);
      return c;
    });
    this.locks.set(id, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(id) === run) this.locks.delete(id);
    }
  }

  async putFile(key: string, data: Buffer) {
    const p = this.filePath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }

  async getFile(key: string) {
    try {
      return await readFile(this.filePath(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async putLead(lead: Lead) {
    if (!/^[a-f0-9]{64}$/.test(lead.id)) throw new Error("Invalid lead id");
    const dir = path.join(this.root, "leads");
    await mkdir(dir, { recursive: true });
    try {
      await writeFile(path.join(dir, `${lead.id}.json`), JSON.stringify(lead, null, 2), { flag: "wx" });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw e;
    }
  }

  async listLeads() {
    const dir = path.join(this.root, "leads");
    await mkdir(dir, { recursive: true });
    const names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
    return Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as Lead));
  }
}
