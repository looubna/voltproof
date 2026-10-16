"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { PROVENANCE_LABEL } from "@/lib/labels";
import { vinFormatProblem, normalizeVin } from "@/lib/normalize";
import type { Provenance } from "@/lib/types";
import { checkDigit, isNorthAmerican } from "@/lib/vin";

/** An API error with its HTTP status and any structured details the route returned. */
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function send(method: "POST" | "PATCH", url: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data);
  return data;
}

const post = (url: string, body: unknown) => send("POST", url, body);

/**
 * router.refresh() inside a transition: `refreshing` stays true until the fresh
 * server render has committed, so a button can stay busy until the screen is current.
 */
function useRefresh() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  return { router, refreshing, refresh: () => startTransition(() => router.refresh()) };
}

/** Seconds since `since`, updated every second while mounted. */
function Elapsed({ since }: { since?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  return <span className="tabular-nums"> {Math.max(0, Math.round((now - since) / 1000))} s</span>;
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {error}
    </p>
  );
}

// ---------------------------------------------------------------- sign in

export function LoginForm({ needsCode }: { needsCode: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/login", { name, accessCode: code });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Your name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder="e.g. Sam Lee, Appraiser" />
        <span className="text-xs text-muted">Recorded with every review decision you make.</span>
      </label>
      {needsCode && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Access code</span>
          <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
      )}
      <ErrorNote error={error} />
      <button className="btn btn-primary justify-center" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SignOutButton({ className = "text-xs text-white/70 hover:text-white" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

// ---------------------------------------------------------------- uploads

type UploadState = "queued" | "uploading" | "reading" | "done" | "not_read" | "error";
interface PendingFile {
  file: File;
  provenance: Provenance;
  state: UploadState;
  message?: string;
  /** Set once the file is stored, so a retry only re-reads it and a source change is saved to it. */
  caseId?: string;
  docId?: string;
  /** When the current step started, for the elapsed-time display. */
  startedAt?: number;
  sourceNote?: string;
}

type UpdateFile = (i: number, p: Partial<PendingFile>) => void;

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
const STATE_TEXT: Record<UploadState, string> = {
  queued: "Ready to upload",
  uploading: "Uploading…",
  reading: "Reading document…",
  done: "Read and checked",
  not_read: "Stored, not read",
  error: "Failed",
};
// The source decides what a document can verify (only dealer-captured readings are Verified),
// so it is never guessed from the file name: every file starts at the least-trusted source.
const DEFAULT_PROVENANCE: Provenance = "seller_provided";
const UPLOAD_CONCURRENCY = 3;

/** "about a minute", "a few seconds": how long reading one document usually takes. */
function typicalWait(seconds: number) {
  return seconds >= 45 ? "about a minute" : seconds >= 15 ? `about ${seconds} seconds` : "a few seconds";
}

export function FilePicker({
  files,
  setFiles,
  update,
  maxMb,
  disabled,
  onSourceSaved,
  typicalSeconds,
}: {
  files: PendingFile[];
  setFiles: (f: PendingFile[]) => void;
  update: UpdateFile;
  maxMb: number;
  disabled?: boolean;
  onSourceSaved?: () => void;
  /** How long reading one document usually takes on this server, for the progress message. */
  typicalSeconds: number;
}) {
  const [error, setError] = useState<string | null>(null);
  function add(list: FileList | null) {
    if (!list) return;
    const ok: PendingFile[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) rejected.push(`${f.name} (type not supported)`);
      else if (f.size > maxMb * 1024 * 1024) rejected.push(`${f.name} (over ${maxMb} MB)`);
      else ok.push({ file: f, provenance: DEFAULT_PROVENANCE, state: "queued" });
    }
    setError(rejected.length ? `Not added: ${rejected.join(", ")}. Use PDF, JPG or PNG up to ${maxMb} MB.` : null);
    setFiles([...files, ...ok]);
  }
  async function changeSource(i: number, provenance: Provenance) {
    const p = files[i];
    if (!p.docId || !p.caseId) return update(i, { provenance });
    // Already stored: save the correction to the document (audited, rules re-run).
    update(i, { provenance, sourceNote: "Saving source…" });
    try {
      await send("PATCH", `/api/cases/${p.caseId}/documents/${p.docId}`, { provenance });
      update(i, { sourceNote: "Source saved." });
      onSourceSaved?.();
    } catch (e) {
      update(i, { provenance: p.provenance, sourceNote: `Source not changed: ${(e as Error).message}` });
    }
  }
  return (
    <div className="grid gap-3">
      <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-brand-50/50 px-6 py-8 text-center hover:border-brand-500 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        <span className="text-sm font-medium text-ink">Choose documents to upload</span>
        <span className="mt-1 text-xs text-muted">Invoices, registration, dashboard photos, battery reports · PDF, JPG or PNG · up to {maxMb} MB each</span>
        <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => (add(e.target.files), (e.target.value = ""))} disabled={disabled} />
      </label>
      <ErrorNote error={error} />
      <UploadProgress files={files} typicalSeconds={typicalSeconds} />
      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-[#fdfcfa]">
          {files.map((p, i) => {
            const working = p.state === "uploading" || p.state === "reading";
            return (
              <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.file.name}</div>
                  <div className="text-xs text-muted">{(p.file.size / 1024).toFixed(0)} KB</div>
                </div>
                <select
                  className="input w-auto py-1 text-xs"
                  value={p.provenance}
                  disabled={working}
                  onChange={(e) => changeSource(i, e.target.value as Provenance)}
                  aria-label={`Where ${p.file.name} came from`}
                  title={p.docId ? "Changing this updates the stored document and is recorded in the case history." : undefined}
                >
                  {(Object.keys(PROVENANCE_LABEL) as Provenance[]).map((k) => (
                    <option key={k} value={k}>
                      {PROVENANCE_LABEL[k]}
                    </option>
                  ))}
                </select>
                <span className={`w-40 text-right text-xs font-medium ${p.state === "error" ? "text-red-700" : p.state === "done" ? "text-verified-fg" : p.state === "not_read" ? "text-conflict-fg" : "text-muted"}`}>
                  {STATE_TEXT[p.state]}
                  {working ? <Elapsed key={p.startedAt} since={p.startedAt} /> : null}
                </span>
                {p.state === "reading" ? (
                  <div className="grid w-full gap-1">
                    <div className="progress" role="progressbar" aria-label={`Reading ${p.file.name}`} aria-valuetext="In progress" />
                    <p className="text-xs text-muted">Reading and checking usually takes {typicalWait(typicalSeconds)} per document. Keep this page open.</p>
                  </div>
                ) : null}
                {p.state === "queued" && (
                  <button type="button" className="text-xs text-muted hover:text-red-700" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                )}
                {p.message && p.state !== "done" ? <p className="w-full text-xs text-muted">{p.message}</p> : null}
                {p.sourceNote ? <p className="w-full text-xs text-muted">{p.sourceNote}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** One live summary for screen readers and sighted users: "2 of 4 documents done". */
function UploadProgress({ files, typicalSeconds }: { files: PendingFile[]; typicalSeconds: number }) {
  const started = files.filter((f) => f.state !== "queued");
  if (!started.length) return <p className="sr-only" aria-live="polite" />;
  const finished = files.filter((f) => f.state === "done" || f.state === "not_read" || f.state === "error").length;
  const failed = files.filter((f) => f.state === "error").length;
  const working = files.some((f) => f.state === "uploading" || f.state === "reading");
  return (
    <p aria-live="polite" className="text-sm font-medium text-ink">
      {working
        ? `${finished} of ${files.length} document${files.length === 1 ? "" : "s"} done. Each takes ${typicalWait(typicalSeconds)}; up to ${UPLOAD_CONCURRENCY} are read at once.`
        : `All ${files.length} document${files.length === 1 ? "" : "s"} processed${failed ? `, ${failed} failed` : ""}.`}
    </p>
  );
}

/**
 * Uploads and reads every queued or failed file, a few at a time, updating
 * per-file state. A file that was stored but failed to read is only re-read.
 */
async function uploadAll(caseId: string, files: PendingFile[], update: UpdateFile) {
  const jobs = files.map((f, i) => ({ f, i })).filter(({ f }) => f.state === "queued" || f.state === "error");
  let failures = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { f, i } = jobs[next++];
      try {
        let docId = f.docId;
        if (!docId) {
          update(i, { state: "uploading", startedAt: Date.now(), message: undefined });
          const form = new FormData();
          form.set("file", f.file);
          form.set("provenance", f.provenance);
          const res = await fetch(`/api/cases/${caseId}/documents`, { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Upload failed");
          docId = data.id as string;
          update(i, { caseId, docId });
        }
        update(i, { state: "reading", startedAt: Date.now(), message: undefined });
        const r = await post(`/api/cases/${caseId}/documents/${docId}/process`, {});
        if (r.status === "extracted") update(i, { state: "done", message: r.mode === "demo-fixture" ? "Sample document recognised: demo values, no AI used." : undefined });
        else if (r.status === "not_configured") update(i, { state: "not_read", message: r.error });
        else {
          failures++;
          update(i, { state: "error", message: r.error ?? "Extraction failed" });
        }
      } catch (e) {
        failures++;
        update(i, { state: "error", message: (e as Error).message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, worker));
  return failures;
}

function useFileQueue() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const update: UpdateFile = (i, p) => setFiles((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return { files, setFiles, update };
}

interface CaseMatch {
  id: string;
  caseNumber: string;
  vehicle: string;
  createdAt: string;
  archived: boolean;
}

export function NewCaseForm({ maxMb, typicalSeconds }: { maxMb: number; typicalSeconds: number }) {
  const router = useRouter();
  const { files, setFiles, update } = useFileQueue();
  const [vehicle, setVehicle] = useState({ make: "", model: "", year: "", vin: "", reference: "" });
  const [vinTouched, setVinTouched] = useState(false);
  const [duplicates, setDuplicates] = useState<CaseMatch[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<string | null>(null);

  const vin = normalizeVin(vehicle.vin);
  const vinProblem = vinFormatProblem(vin);
  const showVinProblem = !!vinProblem && (vinTouched || vin.length >= 17);
  // A wrong check digit is only a hint: outside North America many makers do not use one.
  const vinHint = !vinProblem && vin && isNorthAmerican(vin) && checkDigit(vin) === "invalid" ? "Position 9 does not match this VIN's check digit. Check the VIN plate for a mistyped character." : null;
  const needsConfirm = duplicates.length > 0 && !confirmDuplicate;

  async function checkDuplicates(v: string) {
    if (!v || vinFormatProblem(v)) return setDuplicates([]);
    try {
      const res = await fetch(`/api/cases?vin=${encodeURIComponent(v)}`);
      const data = (await res.json().catch(() => ({}))) as { cases?: CaseMatch[] };
      setDuplicates(data.cases ?? []);
    } catch {
      // The server checks again when the case is created.
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (vinProblem) return setVinTouched(true);
    if (needsConfirm) return;
    setBusy(true);
    setError(null);
    try {
      const id = caseId ?? (await post("/api/cases", { ...vehicle, vin, allowDuplicateVin: confirmDuplicate })).id;
      setCaseId(id);
      const failures = await uploadAll(id, files, update);
      if (failures === 0) router.push(`/cases/${id}`);
      else setError(`${failures} document(s) failed. The case was created; you can retry or open it.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.data.duplicates)) setDuplicates(err.data.duplicates as CaseMatch[]);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof vehicle) => (e: React.ChangeEvent<HTMLInputElement>) => setVehicle({ ...vehicle, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid content-start gap-6">
      <section className="card p-5">
        <h2 className="mb-4 font-semibold">1 · Vehicle details</h2>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Make</span>
            <input className="input" value={vehicle.make} onChange={set("make")} required placeholder="e.g. Hyundai" disabled={!!caseId} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Model</span>
            <input className="input" value={vehicle.model} onChange={set("model")} required placeholder="e.g. Ioniq 5" disabled={!!caseId} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Model year</span>
            <input className="input" value={vehicle.year} onChange={set("year")} inputMode="numeric" pattern="\d{4}" placeholder="e.g. 2022" disabled={!!caseId} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">VIN</span>
            <input
              className="input font-mono uppercase"
              value={vehicle.vin}
              onChange={(e) => {
                set("vin")(e);
                setDuplicates([]);
                setConfirmDuplicate(false);
              }}
              onBlur={() => {
                setVinTouched(true);
                void checkDuplicates(vin);
              }}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              placeholder="17 characters, from the VIN plate"
              disabled={!!caseId}
              aria-invalid={showVinProblem}
              aria-describedby="vin-help"
            />
            <span id="vin-help" className={`text-xs ${showVinProblem ? "font-medium text-red-700" : vinHint ? "text-conflict-fg" : "text-muted"}`}>
              {showVinProblem ? vinProblem : (vinHint ?? "Optional. Every document is compared against this VIN.")}
            </span>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">
              Your reference <span className="font-normal text-muted">(optional)</span>
            </span>
            <input className="input" value={vehicle.reference} onChange={set("reference")} maxLength={80} placeholder="e.g. Stock A-1042, or the seller's name" disabled={!!caseId} aria-describedby="ref-help" />
            <span id="ref-help" className="text-xs text-muted">
              Shown on the dashboard so you can tell similar cases apart.
            </span>
          </label>
        </div>
        {duplicates.length > 0 && !caseId && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">{duplicates.length === 1 ? "A case already exists" : `${duplicates.length} cases already exist`} for this VIN:</p>
            <ul className="mt-1 grid gap-0.5">
              {duplicates.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <Link href={`/cases/${d.id}`} className="link">
                    {d.caseNumber}
                  </Link>{" "}
                  · {d.vehicle}
                  {d.archived ? " (archived)" : ""}
                </li>
              ))}
              {duplicates.length > 5 ? <li className="text-xs">and {duplicates.length - 5} more</li> : null}
            </ul>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
              <span>This is a separate review of the same vehicle. Create a new case anyway.</span>
            </label>
          </div>
        )}
      </section>
      <section className="card p-5">
        <h2 className="mb-1 font-semibold">2 · Documents</h2>
        <p className="mb-4 text-sm text-muted">
          Say where each document came from. Every file starts as <strong>{PROVENANCE_LABEL[DEFAULT_PROVENANCE]}</strong>; choose <strong>{PROVENANCE_LABEL.dealer_captured}</strong> only for photos your staff took
          themselves. Only those readings can be marked Verified.
        </p>
        <FilePicker files={files} setFiles={setFiles} update={update} maxMb={maxMb} disabled={busy} typicalSeconds={typicalSeconds} />
      </section>
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy || (!caseId && (needsConfirm || showVinProblem))}>
          {busy ? "Working…" : caseId ? "Retry failed uploads" : files.length ? `Create case and check ${files.length} document${files.length === 1 ? "" : "s"}` : "Create case"}
        </button>
        {caseId && (
          <button type="button" className="btn btn-secondary" onClick={() => router.push(`/cases/${caseId}`)}>
            Open case
          </button>
        )}
      </div>
    </form>
  );
}

export function AddDocuments({ caseId, maxMb, typicalSeconds }: { caseId: string; maxMb: number; typicalSeconds: number }) {
  const { refresh, refreshing } = useRefresh();
  const { files, setFiles, update } = useFileQueue();
  const [busy, setBusy] = useState(false);
  const pending = files.filter((f) => f.state === "queued" || f.state === "error").length;
  const working = busy || refreshing;
  return (
    <div className="grid gap-3">
      <FilePicker files={files} setFiles={setFiles} update={update} maxMb={maxMb} disabled={working} onSourceSaved={refresh} typicalSeconds={typicalSeconds} />
      {files.length > 0 && (
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            disabled={working || pending === 0}
            onClick={async () => {
              setBusy(true);
              await uploadAll(caseId, files, update);
              setBusy(false);
              refresh();
            }}
          >
            {busy ? "Working…" : refreshing ? "Updating…" : `Upload and check ${pending} document${pending === 1 ? "" : "s"}`}
          </button>
          {!working && pending === 0 && (
            <button className="btn btn-secondary" onClick={() => setFiles([])}>
              Clear list
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Where a stored document came from, editable. Saving re-runs the rules and is recorded in the history. */
export function DocumentSourceSelect({ caseId, docId, value }: { caseId: string; docId: string; value: Provenance }) {
  const { refresh, refreshing } = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        className="input w-auto py-1 text-xs"
        value={value}
        disabled={busy || refreshing}
        aria-label="Where this document came from"
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          try {
            await send("PATCH", `/api/cases/${caseId}/documents/${docId}`, { provenance: e.target.value });
            refresh();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {(Object.keys(PROVENANCE_LABEL) as Provenance[]).map((k) => (
          <option key={k} value={k}>
            {PROVENANCE_LABEL[k]}
          </option>
        ))}
      </select>
      {busy || refreshing ? <span className="text-xs text-muted">Saving and re-checking…</span> : null}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

export function ReprocessButton({ caseId, docId, label }: { caseId: string; docId: string; label: string }) {
  const { refresh, refreshing } = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn btn-secondary py-1 text-xs"
        disabled={busy || refreshing}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await post(`/api/cases/${caseId}/documents/${docId}/process`, {});
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Reading…" : refreshing ? "Updating…" : label}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- review

const RESOLUTIONS = [
  { value: "resolved", label: "Resolved", hint: "The issue is explained and no longer affects the decision." },
  { value: "unresolved", label: "Unresolved", hint: "Reviewed, but the issue still stands." },
  { value: "more_info_requested", label: "Needs more information", hint: "Waiting on the seller, a workshop or a test." },
];
const MIN_NOTE = 3;

export function ReviewForm({ caseId, findingId, reviewer }: { caseId: string; findingId: string; reviewer: string }) {
  const { refresh, refreshing } = useRefresh();
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const missing = [!resolution && "choose a decision", note.trim().length < MIN_NOTE && `write a note (at least ${MIN_NOTE} characters)`].filter(Boolean) as string[];
  const noteId = `note-${findingId}`;
  const working = busy || refreshing;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (missing.length) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await post(`/api/cases/${caseId}/reviews`, { findingId, resolution, note });
      setNote("");
      setResolution("");
      setSaved(true);
      // Re-render the queue, counts and case header with the new decision; "Saved." shows once that is on screen.
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-canvas p-4">
      <div className="label">Record your decision</div>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Decision (required)</legend>
        {RESOLUTIONS.map((r) => (
          <label key={r.value} className={`cursor-pointer rounded-lg border bg-[#fdfcfa] p-2.5 text-sm ${resolution === r.value ? "border-brand-600 ring-1 ring-brand-600" : "border-line"}`}>
            <input type="radio" name={`res-${findingId}`} value={r.value} checked={resolution === r.value} onChange={() => setResolution(r.value)} className="sr-only" />
            <span className="font-medium">{r.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{r.hint}</span>
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1 text-sm" htmlFor={noteId}>
        <span className="font-medium">
          Reviewer note <span className="font-normal text-muted">(required)</span>
        </span>
        <textarea
          id={noteId}
          className="input min-h-20"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you check, and what did you find?"
          maxLength={2000}
          required
          aria-describedby={`${noteId}-hint`}
        />
      </label>
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={working || missing.length > 0} aria-describedby={`${noteId}-hint`}>
          {working ? "Saving…" : "Save review"}
        </button>
        <span id={`${noteId}-hint`} className="text-xs text-muted">
          {missing.length && !working ? <span className="font-medium text-ink">To save, {missing.join(" and ")}. </span> : null}
          Recorded as {reviewer} with a timestamp. The machine finding is kept unchanged.
        </span>
        {saved && !working ? (
          <span role="status" className="text-xs font-medium text-verified-fg">
            Saved.
          </span>
        ) : null}
      </div>
    </form>
  );
}

const STATUS_FILTERS = [
  { value: "", label: "Any status" },
  { value: "conflict", label: "Conflicts" },
  { value: "unknown", label: "Missing evidence" },
];

/** Case, status and text filters for the review queue. Each change updates the URL, so a view can be shared or reloaded. */
export function ReviewFilters({ cases, showCase }: { cases: { id: string; label: string }[]; showCase: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  }

  return (
    <form
      role="search"
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() });
      }}
    >
      {showCase && (
        <select className="input input-inline w-auto" value={params.get("case") ?? ""} onChange={(e) => apply({ case: e.target.value })} aria-label="Filter by case">
          <option value="">All cases</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <select className="input input-inline w-auto" value={params.get("status") ?? ""} onChange={(e) => apply({ status: e.target.value })} aria-label="Filter by status">
        {STATUS_FILTERS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <input className="input input-inline w-48" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search findings" aria-label="Search findings" maxLength={80} />
      <button className="btn btn-secondary py-1 text-xs" disabled={pending}>
        Search
      </button>
      {pending ? (
        <span role="status" className="text-xs text-muted">
          Updating…
        </span>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- misc

export function PrintButton() {
  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
      Print / save as PDF
    </button>
  );
}

export function ResetCaseButton({ caseId }: { caseId: string }) {
  const { refresh, refreshing } = useRefresh();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!armed)
    return (
      <button className="btn btn-secondary" onClick={() => setArmed(true)}>
        Reset demo case
      </button>
    );
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted">Discard reviews and uploads?</span>
      <button
        className="btn btn-primary"
        disabled={busy || refreshing}
        onClick={async () => {
          setBusy(true);
          await post(`/api/cases/${caseId}/reset`, {});
          setBusy(false);
          setArmed(false);
          refresh();
        }}
      >
        {busy || refreshing ? "Resetting…" : "Yes, reset"}
      </button>
      <button className="btn btn-secondary" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}

/** Archive (or restore) a case. Nothing is deleted: the case keeps its documents and audit trail. */
export function ArchiveCaseButton({ caseId, archived }: { caseId: string; archived: boolean }) {
  const { refresh, refreshing } = useRefresh();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/cases/${caseId}/archive`, { archived: !archived });
      setArmed(false);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (archived)
    return (
      <span className="inline-flex flex-col gap-1">
        <button className="btn btn-secondary" disabled={busy || refreshing} onClick={run}>
          {busy || refreshing ? "Restoring…" : "Restore case"}
        </button>
        {error ? <span className="text-xs text-red-700">{error}</span> : null}
      </span>
    );
  if (!armed)
    return (
      <button className="btn btn-secondary" onClick={() => setArmed(true)}>
        Archive case
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Hide this case from the dashboard and review queue? Its history is kept.</span>
      <button className="btn btn-primary" disabled={busy || refreshing} onClick={run}>
        {busy || refreshing ? "Archiving…" : "Yes, archive"}
      </button>
      <button className="btn btn-secondary" onClick={() => setArmed(false)}>
        Cancel
      </button>
      {error ? <span className="w-full text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- seller claims

type ClaimTypeKey = "battery_soh" | "odometer" | "accident_history" | "fast_charging";
const CLAIM_TYPE_OPTIONS: { value: ClaimTypeKey; label: string }[] = [
  { value: "battery_soh", label: "Battery health" },
  { value: "odometer", label: "Mileage" },
  { value: "accident_history", label: "Accident history" },
  { value: "fast_charging", label: "Fast-charging history" },
];

interface DraftClaim {
  key: number;
  type: ClaimTypeKey;
  number: string;
  unit: "km" | "mi";
  flag: boolean;
  text: string;
  sourceText: string;
}

interface Proposal {
  type: ClaimTypeKey;
  stated: { number?: number; unit?: string; flag?: boolean; text?: string };
  sourceText: string;
}

let draftKey = 0;

function toDraft(p: Proposal): DraftClaim {
  return {
    key: ++draftKey,
    type: p.type,
    number: p.stated.number !== undefined ? String(p.stated.number) : "",
    unit: p.stated.unit === "mi" ? "mi" : "km",
    flag: p.stated.flag ?? false,
    text: p.stated.text ?? (p.type === "fast_charging" ? p.sourceText : ""),
    sourceText: p.sourceText,
  };
}

function blankDraft(type: ClaimTypeKey): DraftClaim {
  return { key: ++draftKey, type, number: type === "fast_charging" ? "30" : "", unit: "km", flag: false, text: "", sourceText: "" };
}

export function ClaimsEditor({ caseId, defaultListing }: { caseId: string; defaultListing?: string }) {
  const { refresh, refreshing } = useRefresh();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftClaim[]>([]);
  const [note, setNote] = useState<{ text: string; technical?: string } | null>(null);
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: number, p: Partial<DraftClaim>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const unused = CLAIM_TYPE_OPTIONS.find((o) => !drafts.some((d) => d.type === o.value))?.value;

  async function findClaims() {
    setBusy("parse");
    setError(null);
    setNote(null);
    try {
      const r = (await post(`/api/cases/${caseId}/claims/parse`, { text })) as { proposals: Proposal[]; mode: string; model: string | null; note?: string; dropped: string[] };
      setDrafts(r.proposals.map(toDraft));
      const n = r.proposals.length;
      setNote({
        text: n ? `${n} claim${n === 1 ? "" : "s"} found. Check ${n === 1 ? "it" : "them"} before saving.` : "No claims found in this text. You can add one by hand.",
        technical: r.mode === "vertex-gemini" ? `Read by ${r.model} (Gemini on Vertex AI).` : r.note,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await post(`/api/cases/${caseId}/claims`, {
        claims: drafts.map((d) => ({
          type: d.type,
          source: d.sourceText ? "seller_listing" : "manual",
          sourceText: d.sourceText,
          stated:
            d.type === "accident_history"
              ? { flag: d.flag }
              : d.type === "odometer"
                ? { number: Number(d.number.replace(/[,\s]/g, "")), unit: d.unit }
                : d.type === "fast_charging"
                  ? { number: Number(d.number), text: d.text }
                  : { number: Number(d.number) },
        })),
      });
      const n = drafts.length;
      setDrafts([]);
      setText("");
      setNote({ text: `${n} claim${n === 1 ? "" : "s"} saved and checked. ${n === 1 ? "Its status is" : "Their statuses are"} shown above.` });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Paste the seller's listing or message</span>
        <textarea
          className="input min-h-24"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          placeholder="e.g. 2021 ID.3 Pro, battery health 92%, 48,200 km, no accidents, mostly home charged."
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busy || text.trim().length < 5} onClick={findClaims}>
          {busy === "parse" ? "Reading…" : "Find claims"}
        </button>
        {defaultListing && !text && (
          <button className="btn btn-secondary" onClick={() => setText(defaultListing)}>
            Use sample listing
          </button>
        )}
        {unused && (
          <button className="btn btn-secondary" disabled={!!busy} onClick={() => setDrafts((ds) => [...ds, blankDraft(unused)])}>
            Add a claim by hand
          </button>
        )}
      </div>
      {note && (
        <p role="status" className="text-sm text-ink">
          {note.text}
          {note.technical ? <span className="tech-detail text-xs text-muted"> {note.technical}</span> : null}
        </p>
      )}
      {drafts.length > 0 && (
        <ul className="grid gap-2">
          {drafts.map((d) => (
            <li key={d.key} className="grid gap-2 rounded-lg border border-line bg-canvas p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <select className="input input-inline" value={d.type} onChange={(e) => patch(d.key, { type: e.target.value as ClaimTypeKey })} aria-label="Claim type">
                  {CLAIM_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.value !== d.type && drafts.some((x) => x.type === o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {d.type === "battery_soh" && (
                  <label className="flex items-center gap-1">
                    <input className="input input-inline" style={{ width: 80 }} inputMode="decimal" value={d.number} onChange={(e) => patch(d.key, { number: e.target.value })} aria-label="Battery health percent" />%
                  </label>
                )}
                {d.type === "odometer" && (
                  <>
                    <input className="input input-inline" style={{ width: 120 }} inputMode="numeric" value={d.number} onChange={(e) => patch(d.key, { number: e.target.value })} aria-label="Mileage" />
                    <select className="input input-inline" value={d.unit} onChange={(e) => patch(d.key, { unit: e.target.value as "km" | "mi" })} aria-label="Unit">
                      <option value="km">km</option>
                      <option value="mi">mi</option>
                    </select>
                  </>
                )}
                {d.type === "accident_history" && (
                  <select className="input input-inline" value={d.flag ? "yes" : "no"} onChange={(e) => patch(d.key, { flag: e.target.value === "yes" })} aria-label="Accident claim">
                    <option value="no">Seller says no accidents</option>
                    <option value="yes">Seller reports accident damage</option>
                  </select>
                )}
                {d.type === "fast_charging" && (
                  <>
                    <input className="input input-inline" style={{ width: 200 }} value={d.text} onChange={(e) => patch(d.key, { text: e.target.value })} placeholder="Seller's words" aria-label="Seller's words" />
                    <label className="flex items-center gap-1 text-xs text-muted">
                      at most
                      <input className="input input-inline" style={{ width: 64 }} inputMode="numeric" value={d.number} onChange={(e) => patch(d.key, { number: e.target.value })} aria-label="Highest DC share" />% DC
                    </label>
                  </>
                )}
                <button className="ml-auto text-xs text-muted hover:text-red-700" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                  Remove
                </button>
              </div>
              {d.sourceText && (
                <p className="text-xs text-muted">
                  From the listing: <q className="italic">{d.sourceText}</q>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={error} />
      {drafts.length > 0 && (
        <button className="btn btn-primary justify-self-start" disabled={!!busy || refreshing} onClick={save}>
          {busy === "save" || refreshing ? "Checking…" : `Save and check ${drafts.length} claim${drafts.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

/** Withdraws a claim after a confirm step. The claim stays in the history; it is just no longer checked. */
export function WithdrawClaimButton({ caseId, claimId, label }: { caseId: string; claimId: string; label: string }) {
  const { refresh, refreshing } = useRefresh();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = busy || refreshing;
  if (!armed)
    return (
      <button type="button" className="no-print btn btn-secondary px-3 py-1 text-xs" onClick={() => setArmed(true)} aria-label={`Withdraw claim: ${label}`}>
        Withdraw
      </button>
    );
  return (
    <div role="group" aria-label={`Withdraw claim: ${label}`} className="no-print flex w-full flex-wrap items-center justify-end gap-2 rounded-lg bg-canvas px-3 py-2 text-sm sm:w-auto">
      <span className="text-muted">Stop checking this claim? It stays in the history.</span>
      <button
        type="button"
        className="btn btn-primary px-3 py-1 text-xs"
        disabled={working}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/cases/${caseId}/claims/${claimId}`, { method: "DELETE" });
            if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`);
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {working ? "Withdrawing…" : "Yes, withdraw"}
      </button>
      <button type="button" className="btn btn-secondary px-3 py-1 text-xs" disabled={working} onClick={() => setArmed(false)}>
        Cancel
      </button>
      {error ? <span role="alert" className="w-full text-xs text-red-700">{error}</span> : null}
    </div>
  );
}

/** The reviewer's own label for a case (stock number, seller name), so similar cases can be told apart. */
export function ReferenceEditor({ caseId, value }: { caseId: string; value: string | null }) {
  const { refresh, refreshing } = useRefresh();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!editing)
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {value ? <span>{value}</span> : <span className="text-muted">None</span>}
        <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => (setText(value ?? ""), setEditing(true))}>
          {value ? "Edit" : "Add"}
        </button>
      </span>
    );
  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await send("PATCH", `/api/cases/${caseId}`, { reference: text });
          setEditing(false);
          refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder="e.g. Stock A-1042, or the seller's name" aria-label="Your reference for this case" autoFocus />
      <div className="flex gap-2">
        <button className="btn btn-primary px-3 py-1 text-xs" disabled={busy || refreshing}>
          {busy || refreshing ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      {error ? <span role="alert" className="text-xs text-red-700">{error}</span> : null}
    </form>
  );
}

// ---------------------------------------------------------------- registry and issuer checks

export function VinDecodeButton({ caseId, provider = "nhtsa_vpic", label = "Look up the VIN (US database)" }: { caseId: string; provider?: "nhtsa_vpic" | "nzta_mvr"; label?: string }) {
  const { refresh, refreshing } = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn btn-secondary py-1 text-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await post(`/api/cases/${caseId}/registry`, { provider });
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy || refreshing ? "Checking…" : label}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

const METHOD_OPTIONS = [
  { value: "issuer_phone", label: "Phoned the issuer" },
  { value: "issuer_email", label: "Emailed the issuer" },
  { value: "issuer_portal", label: "Issuer's own portal" },
  { value: "registry_lookup", label: "Vehicle registry lookup" },
  { value: "government_document_number", label: "Government document-number check" },
];

export function VerificationForm({ caseId, docId }: { caseId: string; docId: string }) {
  const { refresh, refreshing } = useRefresh();
  const [method, setMethod] = useState("issuer_phone");
  const [outcome, setOutcome] = useState("confirmed");
  const [contact, setContact] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-2 text-sm"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await post(`/api/cases/${caseId}/documents/${docId}/verifications`, { method, outcome, contact, reference, note });
          setContact("");
          setReference("");
          setNote("");
          refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="How it was checked">
        {METHOD_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="What they said">
        <option value="confirmed">They confirmed they issued it, with these values</option>
        <option value="denied">They said they did not issue it</option>
        <option value="no_response">No response</option>
      </select>
      <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Who: e.g. Lakeside EV Centre, service desk" required />
      <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference they gave (optional)" />
      <textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What they confirmed, e.g. invoice LS-26-08114, odometer 47,950 km" />
      <ErrorNote error={error} />
      <button className="btn btn-primary justify-self-start" disabled={busy || refreshing}>
        {busy || refreshing ? "Saving…" : "Record verification"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- evidence agent

export function RunAgentButton({ caseId, disabled }: { caseId: string; disabled?: boolean }) {
  const { refresh, refreshing } = useRefresh();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = startedAt !== null;
  return (
    <div className="grid gap-2">
      <button
        className="btn btn-primary justify-self-start"
        disabled={busy || refreshing || disabled}
        onClick={async () => {
          setStartedAt(Date.now());
          setError(null);
          try {
            await post(`/api/cases/${caseId}/investigate`, {});
            // The agent has stored its run by now: show it (and any new statuses) without a manual reload.
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setStartedAt(null);
          }
        }}
      >
        {busy ? (
          <>
            Investigating…
            <Elapsed since={startedAt} /> (up to a minute)
          </>
        ) : refreshing ? (
          "Loading the results…"
        ) : (
          "Run evidence agent"
        )}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

// ---------------------------------------------------------------- landing page forms

export function WaitlistForm({ dark = true }: { dark?: boolean }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") return <p className={`text-sm font-medium ${dark ? "text-[#7fd3b2]" : "text-[#1f6b50]"}`}>You're on the list. We'll email you once when your spot opens.</p>;
  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        try {
          await post("/api/leads", { kind: "waitlist", email, website });
          setState("done");
        } catch (err) {
          setError((err as Error).message);
          setState("idle");
        }
      }}
    >
      <label className={`text-sm font-semibold ${dark ? "text-white" : "text-ink"}`} htmlFor="wl-email">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id="wl-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="w-full rounded-lg border-0 bg-[#f3f1ec] px-3 py-2.5 text-sm text-[#16202c] outline-none focus:ring-2 focus:ring-[#7fd3b2]" />
        {/* Honeypot: hidden from people, filled by bots. */}
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" className="hidden" aria-hidden />
        <button disabled={state === "busy"} className="whitespace-nowrap rounded-lg bg-[#7fd3b2] px-5 py-2.5 text-sm font-semibold text-[#0f1c2b] hover:bg-[#95ddc0] disabled:opacity-60">
          {state === "busy" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : <p className={`text-xs ${dark ? "text-white/60" : "text-muted"}`}>We only email you about early access. Unsubscribe anytime.</p>}
    </form>
  );
}

export function DemoRequestForm() {
  const [f, setF] = useState({ name: "", email: "", company: "", role: "", volumeRange: "", wantsToVerify: "", marketingOptIn: false, website: "" });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  if (state === "done") return <p className="rounded-lg bg-[#e6f4ee] px-4 py-3 text-sm font-medium text-[#1f6b50]">Thanks. We'll be in touch to arrange your demo.</p>;
  const field = "w-full rounded-lg border border-[#d9d5cb] bg-[#fdfcfa] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1f6b50]";
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        try {
          await post("/api/leads", { kind: "demo", ...f, volumeRange: f.volumeRange || undefined, wantsToVerify: f.wantsToVerify || undefined });
          setState("done");
        } catch (err) {
          setError((err as Error).message);
          setState("idle");
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">Full name<input required className={field} value={f.name} onChange={set("name")} /></label>
        <label className="grid gap-1 text-sm font-semibold">Work email<input required type="email" placeholder="name@company.com" className={field} value={f.email} onChange={set("email")} /></label>
        <label className="grid gap-1 text-sm font-semibold">Company<input required className={field} value={f.company} onChange={set("company")} /></label>
        <label className="grid gap-1 text-sm font-semibold">
          Your role
          <select required className={field} value={f.role} onChange={set("role")}>
            <option value="">Choose one</option>
            <option value="lender">Lender or lessor</option>
            <option value="dealer">Dealer</option>
            <option value="marketplace">Marketplace</option>
            <option value="insurer">Insurer</option>
            <option value="fleet">Fleet manager</option>
            <option value="buyer">Buyer</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        <span>Used EVs you handle per month <span className="font-normal text-muted">(optional)</span></span>
        <select className={field} value={f.volumeRange} onChange={set("volumeRange")}>
          <option value="">Choose a range</option>
          <option value="1-10">1–10</option>
          <option value="11-50">11–50</option>
          <option value="51-200">51–200</option>
          <option value="200+">200+</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        <span>What would you like to verify? <span className="font-normal text-muted">(optional)</span></span>
        <textarea className={`${field} min-h-20`} placeholder="For example: battery health on trade-ins before we finance them" value={f.wantsToVerify} onChange={set("wantsToVerify")} maxLength={1000} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.marketingOptIn} onChange={set("marketingOptIn")} /> Send me occasional product updates <span className="text-muted">(optional)</span>
      </label>
      <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} name="website" className="hidden" aria-hidden />
      <ErrorNote error={error} />
      <button disabled={state === "busy"} className="rounded-lg bg-[#1f6b50] px-5 py-3 text-sm font-semibold text-white hover:bg-[#185a43] disabled:opacity-60">
        {state === "busy" ? "Sending…" : "Request a demo"}
      </button>
      <p className="text-xs text-muted">We only use these details to arrange your demo. We don't sell them.</p>
    </form>
  );
}
