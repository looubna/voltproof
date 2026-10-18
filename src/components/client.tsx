"use client";

// Interactive parts of the app. Client components get the words they show as `copy` props
// from the server page (only what each one needs, not the whole catalog), and the page's
// language from useI18n() for plurals and numbers.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { format, formatPlural } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/en";
import { rich } from "@/i18n/rich";
import { normalizeVin, vinFormatIssue } from "@/lib/normalize";
import type { ClaimType, Provenance, VerificationMethod } from "@/lib/types";
import { checkDigit, isNorthAmerican } from "@/lib/vin";

type M = Messages;

/** An API error with its HTTP status and any structured details. The server words `message` in the reader's language. */
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
  if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : "", res.status, data);
  return data;
}

const post = (url: string, body: unknown) => send("POST", url, body);

/** What went wrong, for the person: the server's message, or a general one in the page's language. */
function problem(e: unknown, requestFailed: string) {
  if (e instanceof ApiError && e.message) return e.message;
  return format(requestFailed, { status: e instanceof ApiError ? e.status : "—" });
}

/**
 * router.refresh() inside a transition: `refreshing` stays true until the fresh
 * server render has committed, so a button can stay busy until the screen is current.
 */
function useRefresh() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  return { router, refreshing, refresh: () => startTransition(() => router.refresh()) };
}

/** Seconds since `since`, updated every second while mounted. `template` is e.g. "{count} s". */
function Elapsed({ since, template }: { since?: number | null; template: string }) {
  const { locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return null;
  return <span className="tabular-nums"> {format(template, { count: Math.max(0, Math.round((now - since) / 1000)).toLocaleString(INTL_LOCALE[locale]) })}</span>;
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

export function LoginForm({ needsCode, copy }: { needsCode: boolean; copy: Messages["login"] }) {
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
      // The API answers in English; show the message in the page's language instead.
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 401 ? copy.errors.code : status === 400 ? copy.errors.name : status === 500 ? copy.errors.config : copy.errors.generic);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{copy.name}</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} placeholder={copy.namePlaceholder} />
        <span className="text-xs text-muted">{copy.nameHint}</span>
      </label>
      {needsCode && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">{copy.code}</span>
          <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" required />
        </label>
      )}
      <ErrorNote error={error} />
      <button className="btn btn-primary justify-center" disabled={busy}>
        {busy ? copy.busy : copy.submit}
      </button>
    </form>
  );
}

/**
 * Signs out, then loads the landing page in full: a fresh page load also clears the
 * router's cache of signed-in pages, so Back cannot show them again.
 */
export function SignOutButton({ className = "text-xs text-white/70 hover:text-white", label = "Sign out", redirectTo = "/" }: { className?: string; label?: string; redirectTo?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.replace(redirectTo);
      }}
    >
      {label}
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

/** What the upload controls say, in the page's language. */
export type UploadCopy = M["upload"] & {
  provenance: M["labels"]["provenance"];
  remove: string;
  working: string;
  updating: string;
  seconds: string;
  requestFailed: string;
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
// The source decides what a document can verify (only dealer-captured readings are Verified),
// so it is never guessed from the file name: every file starts at the least-trusted source.
const DEFAULT_PROVENANCE: Provenance = "seller_provided";
const PROVENANCES: Provenance[] = ["seller_provided", "dealer_captured", "dealer_ordered", "unknown"];
const UPLOAD_CONCURRENCY = 3;

/** "about a minute", "a few seconds": how long reading one document usually takes. */
function typicalWait(seconds: number, t: UploadCopy["wait"]) {
  return seconds >= 45 ? t.minute : seconds >= 15 ? format(t.seconds, { count: seconds }) : t.few;
}

export function FilePicker({
  files,
  setFiles,
  update,
  maxMb,
  disabled,
  onSourceSaved,
  typicalSeconds,
  copy,
}: {
  files: PendingFile[];
  setFiles: (f: PendingFile[]) => void;
  update: UpdateFile;
  maxMb: number;
  disabled?: boolean;
  onSourceSaved?: () => void;
  /** How long reading one document usually takes on this server, for the progress message. */
  typicalSeconds: number;
  copy: UploadCopy;
}) {
  const { locale } = useI18n();
  const [error, setError] = useState<string | null>(null);
  function add(list: FileList | null) {
    if (!list) return;
    const ok: PendingFile[] = [];
    const rejected: string[] = [];
    for (const f of Array.from(list)) {
      if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) rejected.push(format(copy.wrongType, { file: f.name }));
      else if (f.size > maxMb * 1024 * 1024) rejected.push(format(copy.tooBig, { file: f.name, mb: maxMb }));
      else ok.push({ file: f, provenance: DEFAULT_PROVENANCE, state: "queued" });
    }
    setError(rejected.length ? format(copy.notAdded, { files: rejected.join(", "), mb: maxMb }) : null);
    setFiles([...files, ...ok]);
  }
  async function changeSource(i: number, provenance: Provenance) {
    const p = files[i];
    if (!p.docId || !p.caseId) return update(i, { provenance });
    // Already stored: save the correction to the document (audited, rules re-run).
    update(i, { provenance, sourceNote: copy.savingSource });
    try {
      await send("PATCH", `/api/cases/${p.caseId}/documents/${p.docId}`, { provenance });
      update(i, { sourceNote: copy.sourceSaved });
      onSourceSaved?.();
    } catch (e) {
      update(i, { provenance: p.provenance, sourceNote: format(copy.sourceNotChanged, { error: problem(e, copy.requestFailed) }) });
    }
  }
  return (
    <div className="grid gap-3">
      <label className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-brand-50/50 px-6 py-8 text-center hover:border-brand-500 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        <span className="text-sm font-medium text-ink">{copy.choose}</span>
        <span className="mt-1 text-xs text-muted">{format(copy.hint, { mb: maxMb })}</span>
        <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => (add(e.target.files), (e.target.value = ""))} disabled={disabled} />
      </label>
      <ErrorNote error={error} />
      <UploadProgress files={files} typicalSeconds={typicalSeconds} copy={copy} />
      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-[#fdfcfa]">
          {files.map((p, i) => {
            const working = p.state === "uploading" || p.state === "reading";
            return (
              <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.file.name}</div>
                  <div className="text-xs text-muted">{format(copy.size, { size: Math.round(p.file.size / 1024).toLocaleString(INTL_LOCALE[locale]) })}</div>
                </div>
                <select
                  className="input w-auto py-1 text-xs"
                  value={p.provenance}
                  disabled={working}
                  onChange={(e) => changeSource(i, e.target.value as Provenance)}
                  aria-label={format(copy.sourceFor, { file: p.file.name })}
                  title={p.docId ? copy.sourceHint : undefined}
                >
                  {PROVENANCES.map((k) => (
                    <option key={k} value={k}>
                      {copy.provenance[k]}
                    </option>
                  ))}
                </select>
                <span className={`w-40 text-right text-xs font-medium ${p.state === "error" ? "text-red-700" : p.state === "done" ? "text-verified-fg" : p.state === "not_read" ? "text-conflict-fg" : "text-muted"}`}>
                  {copy.state[p.state]}
                  {working ? <Elapsed key={p.startedAt} since={p.startedAt} template={copy.seconds} /> : null}
                </span>
                {p.state === "reading" ? (
                  <div className="grid w-full gap-1">
                    <div className="progress" role="progressbar" aria-label={format(copy.readingLabel, { file: p.file.name })} aria-valuetext={copy.inProgress} />
                    <p className="text-xs text-muted">{format(copy.takes, { wait: typicalWait(typicalSeconds, copy.wait) })}</p>
                  </div>
                ) : null}
                {p.state === "queued" && (
                  <button type="button" className="text-xs text-muted hover:text-red-700" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    {copy.remove}
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
function UploadProgress({ files, typicalSeconds, copy }: { files: PendingFile[]; typicalSeconds: number; copy: UploadCopy }) {
  const { locale } = useI18n();
  const started = files.filter((f) => f.state !== "queued");
  if (!started.length) return <p className="sr-only" aria-live="polite" />;
  const finished = files.filter((f) => f.state === "done" || f.state === "not_read" || f.state === "error").length;
  const failed = files.filter((f) => f.state === "error").length;
  const working = files.some((f) => f.state === "uploading" || f.state === "reading");
  return (
    <p aria-live="polite" className="text-sm font-medium text-ink">
      {working
        ? formatPlural(locale, copy.progress, files.length, { done: finished, wait: typicalWait(typicalSeconds, copy.wait), parallel: UPLOAD_CONCURRENCY })
        : formatPlural(locale, copy.finished, files.length, { failed: failed ? format(copy.failedCount, { count: failed }) : "" })}
    </p>
  );
}

/**
 * Uploads and reads every queued or failed file, a few at a time, updating
 * per-file state. A file that was stored but failed to read is only re-read.
 */
async function uploadAll(caseId: string, files: PendingFile[], update: UpdateFile, copy: UploadCopy) {
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
          if (!res.ok) throw new ApiError(typeof data.error === "string" ? data.error : copy.uploadFailed, res.status, data);
          docId = data.id as string;
          update(i, { caseId, docId });
        }
        update(i, { state: "reading", startedAt: Date.now(), message: undefined });
        const r = await post(`/api/cases/${caseId}/documents/${docId}/process`, {});
        if (r.status === "extracted") update(i, { state: "done", message: r.mode === "demo-fixture" ? copy.sample : undefined });
        else if (r.status === "not_configured") update(i, { state: "not_read", message: copy.notConfigured });
        else {
          failures++;
          // What the reader returned (an error from the AI service, for example) is shown as it came.
          update(i, { state: "error", message: r.error ?? copy.readFailed });
        }
      } catch (e) {
        failures++;
        update(i, { state: "error", message: problem(e, copy.requestFailed) });
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

export interface NewCaseCopy {
  form: M["newCase"]["form"];
  upload: UploadCopy;
  vin: Pick<M["errors"], "vinChars" | "vinIOQ" | "vinLength">;
  optional: string;
}

export function NewCaseForm({ maxMb, typicalSeconds, copy }: { maxMb: number; typicalSeconds: number; copy: NewCaseCopy }) {
  const { locale } = useI18n();
  const t = copy.form;
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
  const vinIssue = vinFormatIssue(vin);
  const vinProblem = vinIssue ? format(copy.vin[vinIssue.code], { count: vinIssue.count ?? "" }) : null;
  const showVinProblem = !!vinProblem && (vinTouched || vin.length >= 17);
  // A wrong check digit is only a hint: outside North America many makers do not use one.
  const vinHint = !vinProblem && vin && isNorthAmerican(vin) && checkDigit(vin) === "invalid" ? t.vinCheckDigit : null;
  const needsConfirm = duplicates.length > 0 && !confirmDuplicate;

  async function checkDuplicates(v: string) {
    if (!v || vinFormatIssue(v)) return setDuplicates([]);
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
      const failures = await uploadAll(id, files, update, copy.upload);
      if (failures === 0) router.push(`/cases/${id}`);
      else setError(formatPlural(locale, t.failed, failures));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.data.duplicates)) setDuplicates(err.data.duplicates as CaseMatch[]);
      else setError(problem(err, copy.upload.requestFailed));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof vehicle) => (e: React.ChangeEvent<HTMLInputElement>) => setVehicle({ ...vehicle, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="grid content-start gap-6">
      <section className="card p-5">
        <h2 className="mb-4 font-semibold">{t.vehicle}</h2>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.make}</span>
            <input className="input" value={vehicle.make} onChange={set("make")} required placeholder={t.makePlaceholder} disabled={!!caseId} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.model}</span>
            <input className="input" value={vehicle.model} onChange={set("model")} required placeholder={t.modelPlaceholder} disabled={!!caseId} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.year}</span>
            <input className="input" value={vehicle.year} onChange={set("year")} inputMode="numeric" pattern="\d{4}" placeholder={t.yearPlaceholder} disabled={!!caseId} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t.vin}</span>
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
              placeholder={t.vinPlaceholder}
              disabled={!!caseId}
              aria-invalid={showVinProblem}
              aria-describedby="vin-help"
            />
            <span id="vin-help" className={`text-xs ${showVinProblem ? "font-medium text-red-700" : vinHint ? "text-conflict-fg" : "text-muted"}`}>
              {showVinProblem ? vinProblem : (vinHint ?? t.vinHelp)}
            </span>
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium">
              {t.reference} <span className="font-normal text-muted">{copy.optional}</span>
            </span>
            <input className="input" value={vehicle.reference} onChange={set("reference")} maxLength={80} placeholder={t.referencePlaceholder} disabled={!!caseId} aria-describedby="ref-help" />
            <span id="ref-help" className="text-xs text-muted">
              {t.referenceHelp}
            </span>
          </label>
        </div>
        {duplicates.length > 0 && !caseId && (
          <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">{formatPlural(locale, t.duplicates, duplicates.length)}</p>
            <ul className="mt-1 grid gap-0.5">
              {duplicates.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <Link href={`/cases/${d.id}`} className="link">
                    {d.caseNumber}
                  </Link>{" "}
                  · {d.vehicle}
                  {d.archived ? t.archived : ""}
                </li>
              ))}
              {duplicates.length > 5 ? <li className="text-xs">{format(t.more, { count: duplicates.length - 5 })}</li> : null}
            </ul>
            <label className="mt-2 flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={confirmDuplicate} onChange={(e) => setConfirmDuplicate(e.target.checked)} />
              <span>{t.confirmDuplicate}</span>
            </label>
          </div>
        )}
      </section>
      <section className="card p-5">
        <h2 className="mb-1 font-semibold">{t.documents}</h2>
        <p className="mb-4 text-sm text-muted">
          {rich(t.sources, { seller: <strong>{copy.upload.provenance[DEFAULT_PROVENANCE]}</strong>, captured: <strong>{copy.upload.provenance.dealer_captured}</strong> })}
        </p>
        <FilePicker files={files} setFiles={setFiles} update={update} maxMb={maxMb} disabled={busy} typicalSeconds={typicalSeconds} copy={copy.upload} />
      </section>
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy || (!caseId && (needsConfirm || showVinProblem))}>
          {busy ? copy.upload.working : caseId ? t.retry : files.length ? formatPlural(locale, t.createWith, files.length) : t.create}
        </button>
        {caseId && (
          <button type="button" className="btn btn-secondary" onClick={() => router.push(`/cases/${caseId}`)}>
            {t.open}
          </button>
        )}
      </div>
    </form>
  );
}

export function AddDocuments({ caseId, maxMb, typicalSeconds, copy }: { caseId: string; maxMb: number; typicalSeconds: number; copy: UploadCopy }) {
  const { locale } = useI18n();
  const { refresh, refreshing } = useRefresh();
  const { files, setFiles, update } = useFileQueue();
  const [busy, setBusy] = useState(false);
  const pending = files.filter((f) => f.state === "queued" || f.state === "error").length;
  const working = busy || refreshing;
  return (
    <div className="grid gap-3">
      <FilePicker files={files} setFiles={setFiles} update={update} maxMb={maxMb} disabled={working} onSourceSaved={refresh} typicalSeconds={typicalSeconds} copy={copy} />
      {files.length > 0 && (
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            disabled={working || pending === 0}
            onClick={async () => {
              setBusy(true);
              await uploadAll(caseId, files, update, copy);
              setBusy(false);
              refresh();
            }}
          >
            {busy ? copy.working : refreshing ? copy.updating : formatPlural(locale, copy.submit, pending)}
          </button>
          {!working && pending === 0 && (
            <button className="btn btn-secondary" onClick={() => setFiles([])}>
              {copy.clear}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Where a stored document came from, editable. Saving re-runs the rules and is recorded in the history. */
export function DocumentSourceSelect({
  caseId,
  docId,
  value,
  copy,
}: {
  caseId: string;
  docId: string;
  value: Provenance;
  copy: M["document"]["source"] & { provenance: M["labels"]["provenance"]; requestFailed: string };
}) {
  const { refresh, refreshing } = useRefresh();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        className="input w-auto py-1 text-xs"
        value={value}
        disabled={busy || refreshing}
        aria-label={copy.label}
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          try {
            await send("PATCH", `/api/cases/${caseId}/documents/${docId}`, { provenance: e.target.value });
            refresh();
          } catch (err) {
            setError(problem(err, copy.requestFailed));
          } finally {
            setBusy(false);
          }
        }}
      >
        {PROVENANCES.map((k) => (
          <option key={k} value={k}>
            {copy.provenance[k]}
          </option>
        ))}
      </select>
      {busy || refreshing ? <span className="text-xs text-muted">{copy.saving}</span> : null}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

export function ReprocessButton({ caseId, docId, label, copy }: { caseId: string; docId: string; label: string; copy: { reading: string; updating: string; requestFailed: string } }) {
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
            setError(problem(e, copy.requestFailed));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? copy.reading : refreshing ? copy.updating : label}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- review

const RESOLUTIONS = ["resolved", "unresolved", "more_info_requested"] as const;
const MIN_NOTE = 3;

export function ReviewForm({ caseId, findingId, reviewer, copy }: { caseId: string; findingId: string; reviewer: string; copy: M["review"]["form"] & { saving: string; requestFailed: string } }) {
  const { refresh, refreshing } = useRefresh();
  const [resolution, setResolution] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const noDecision = !resolution;
  const shortNote = note.trim().length < MIN_NOTE;
  const toSave = noDecision && shortNote ? format(copy.toSaveBoth, { count: MIN_NOTE }) : noDecision ? copy.toSaveDecision : shortNote ? format(copy.toSaveNote, { count: MIN_NOTE }) : null;
  const noteId = `note-${findingId}`;
  const working = busy || refreshing;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (toSave) return;
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
      setError(problem(err, copy.requestFailed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-canvas p-4">
      <div className="label">{copy.title}</div>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">{copy.decision}</legend>
        {RESOLUTIONS.map((value) => (
          <label key={value} className={`cursor-pointer rounded-lg border bg-[#fdfcfa] p-2.5 text-sm ${resolution === value ? "border-brand-600 ring-1 ring-brand-600" : "border-line"}`}>
            <input type="radio" name={`res-${findingId}`} value={value} checked={resolution === value} onChange={() => setResolution(value)} className="sr-only" />
            <span className="font-medium">{copy.resolutions[value].label}</span>
            <span className="mt-0.5 block text-xs text-muted">{copy.resolutions[value].hint}</span>
          </label>
        ))}
      </fieldset>
      <label className="grid gap-1 text-sm" htmlFor={noteId}>
        <span className="font-medium">
          {copy.note} <span className="font-normal text-muted">{copy.required}</span>
        </span>
        <textarea
          id={noteId}
          className="input min-h-20"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={copy.placeholder}
          maxLength={2000}
          required
          aria-describedby={`${noteId}-hint`}
        />
      </label>
      <ErrorNote error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={working || !!toSave} aria-describedby={`${noteId}-hint`}>
          {working ? copy.saving : copy.save}
        </button>
        <span id={`${noteId}-hint`} className="text-xs text-muted">
          {toSave && !working ? <span className="font-medium text-ink">{toSave} </span> : null}
          {format(copy.recorded, { reviewer })}
        </span>
        {saved && !working ? (
          <span role="status" className="text-xs font-medium text-verified-fg">
            {copy.saved}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** Case, status and text filters for the review queue. Each change updates the URL, so a view can be shared or reloaded. */
export function ReviewFilters({ cases, showCase, copy }: { cases: { id: string; label: string }[]; showCase: boolean; copy: M["review"]["filters"] & { updating: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const statusFilters = [
    { value: "", label: copy.any },
    { value: "conflict", label: copy.conflicts },
    { value: "unknown", label: copy.missing },
  ];

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
        <select className="input input-inline w-auto" value={params.get("case") ?? ""} onChange={(e) => apply({ case: e.target.value })} aria-label={copy.case}>
          <option value="">{copy.allCases}</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <select className="input input-inline w-auto" value={params.get("status") ?? ""} onChange={(e) => apply({ status: e.target.value })} aria-label={copy.status}>
        {statusFilters.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <input className="input input-inline w-48" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={copy.search} aria-label={copy.search} maxLength={80} />
      <button className="btn btn-secondary py-1 text-xs" disabled={pending}>
        {copy.submit}
      </button>
      {pending ? (
        <span role="status" className="text-xs text-muted">
          {copy.updating}
        </span>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- misc

export function PrintButton({ label }: { label: string }) {
  return (
    <button className="btn btn-primary" onClick={() => window.print()}>
      {label}
    </button>
  );
}

export function ResetCaseButton({ caseId, copy }: { caseId: string; copy: M["caseHeader"]["reset"] & { cancel: string } }) {
  const { refresh, refreshing } = useRefresh();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!armed)
    return (
      <button className="btn btn-secondary" onClick={() => setArmed(true)}>
        {copy.start}
      </button>
    );
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-muted">{copy.confirm}</span>
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
        {busy || refreshing ? copy.busy : copy.yes}
      </button>
      <button className="btn btn-secondary" onClick={() => setArmed(false)}>
        {copy.cancel}
      </button>
    </span>
  );
}

/** Archive (or restore) a case. Nothing is deleted: the case keeps its documents and audit trail. */
export function ArchiveCaseButton({ caseId, archived, copy }: { caseId: string; archived: boolean; copy: M["caseHeader"]["archive"] & { cancel: string; requestFailed: string } }) {
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
      setError(problem(e, copy.requestFailed));
    } finally {
      setBusy(false);
    }
  };
  if (archived)
    return (
      <span className="inline-flex flex-col gap-1">
        <button className="btn btn-secondary" disabled={busy || refreshing} onClick={run}>
          {busy || refreshing ? copy.restoring : copy.restore}
        </button>
        {error ? <span className="text-xs text-red-700">{error}</span> : null}
      </span>
    );
  if (!armed)
    return (
      <button className="btn btn-secondary" onClick={() => setArmed(true)}>
        {copy.start}
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{copy.confirm}</span>
      <button className="btn btn-primary" disabled={busy || refreshing} onClick={run}>
        {busy || refreshing ? copy.busy : copy.yes}
      </button>
      <button className="btn btn-secondary" onClick={() => setArmed(false)}>
        {copy.cancel}
      </button>
      {error ? <span className="w-full text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- seller claims

const CLAIM_TYPES: ClaimType[] = ["battery_soh", "odometer", "accident_history", "fast_charging"];

interface DraftClaim {
  key: number;
  type: ClaimType;
  number: string;
  unit: "km" | "mi";
  flag: boolean;
  text: string;
  sourceText: string;
}

interface Proposal {
  type: ClaimType;
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

function blankDraft(type: ClaimType): DraftClaim {
  return { key: ++draftKey, type, number: type === "fast_charging" ? "30" : "", unit: "km", flag: false, text: "", sourceText: "" };
}

export type ClaimsEditorCopy = M["claims"]["editor"] & { types: M["labels"]["claimType"]; requestFailed: string };

export function ClaimsEditor({ caseId, defaultListing, copy }: { caseId: string; defaultListing?: string; copy: ClaimsEditorCopy }) {
  const { locale } = useI18n();
  const { refresh, refreshing } = useRefresh();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftClaim[]>([]);
  const [note, setNote] = useState<{ text: string; technical?: string } | null>(null);
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: number, p: Partial<DraftClaim>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const unused = CLAIM_TYPES.find((t) => !drafts.some((d) => d.type === t));

  async function findClaims() {
    setBusy("parse");
    setError(null);
    setNote(null);
    try {
      const r = (await post(`/api/cases/${caseId}/claims/parse`, { text })) as { proposals: Proposal[]; mode: string; model: string | null; note?: string; noteCode?: "demo" | "fallback"; dropped: string[] };
      setDrafts(r.proposals.map(toDraft));
      const n = r.proposals.length;
      setNote({
        text: n ? formatPlural(locale, copy.found, n) : copy.none,
        technical: r.mode === "vertex-gemini" ? format(copy.readBy, { model: r.model ?? "" }) : r.noteCode === "demo" ? copy.rulesDemo : r.noteCode === "fallback" ? copy.rulesFallback : r.note,
      });
    } catch (e) {
      setError(problem(e, copy.requestFailed));
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
      setNote({ text: formatPlural(locale, copy.saved, n) });
      refresh();
    } catch (e) {
      setError(problem(e, copy.requestFailed));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{copy.paste}</span>
        <textarea className="input min-h-24" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={copy.placeholder} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busy || text.trim().length < 5} onClick={findClaims}>
          {busy === "parse" ? copy.reading : copy.find}
        </button>
        {defaultListing && !text && (
          <button className="btn btn-secondary" onClick={() => setText(defaultListing)}>
            {copy.sample}
          </button>
        )}
        {unused && (
          <button className="btn btn-secondary" disabled={!!busy} onClick={() => setDrafts((ds) => [...ds, blankDraft(unused)])}>
            {copy.byHand}
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
                <select className="input input-inline" value={d.type} onChange={(e) => patch(d.key, { type: e.target.value as ClaimType })} aria-label={copy.type}>
                  {CLAIM_TYPES.map((t) => (
                    <option key={t} value={t} disabled={t !== d.type && drafts.some((x) => x.type === t)}>
                      {copy.types[t]}
                    </option>
                  ))}
                </select>
                {d.type === "battery_soh" && (
                  <label className="flex items-center gap-1">
                    <input className="input input-inline" style={{ width: 80 }} inputMode="decimal" value={d.number} onChange={(e) => patch(d.key, { number: e.target.value })} aria-label={copy.soh} />%
                  </label>
                )}
                {d.type === "odometer" && (
                  <>
                    <input className="input input-inline" style={{ width: 120 }} inputMode="numeric" value={d.number} onChange={(e) => patch(d.key, { number: e.target.value })} aria-label={copy.mileage} />
                    <select className="input input-inline" value={d.unit} onChange={(e) => patch(d.key, { unit: e.target.value as "km" | "mi" })} aria-label={copy.unit}>
                      <option value="km">km</option>
                      <option value="mi">mi</option>
                    </select>
                  </>
                )}
                {d.type === "accident_history" && (
                  <select className="input input-inline" value={d.flag ? "yes" : "no"} onChange={(e) => patch(d.key, { flag: e.target.value === "yes" })} aria-label={copy.accident}>
                    <option value="no">{copy.noAccidents}</option>
                    <option value="yes">{copy.damage}</option>
                  </select>
                )}
                {d.type === "fast_charging" && (
                  <>
                    <input className="input input-inline" style={{ width: 200 }} value={d.text} onChange={(e) => patch(d.key, { text: e.target.value })} placeholder={copy.words} aria-label={copy.words} />
                    <label className="flex items-center gap-1 text-xs text-muted">
                      {copy.atMost}
                      <input className="input input-inline" style={{ width: 64 }} inputMode="numeric" value={d.number} onChange={(e) => patch(d.key, { number: e.target.value })} aria-label={copy.dcShare} />
                      {copy.dc}
                    </label>
                  </>
                )}
                <button className="ml-auto text-xs text-muted hover:text-red-700" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                  {copy.remove}
                </button>
              </div>
              {d.sourceText && <p className="text-xs text-muted">{rich(copy.fromListing, { quote: <q className="italic">{d.sourceText}</q> })}</p>}
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={error} />
      {drafts.length > 0 && (
        <button className="btn btn-primary justify-self-start" disabled={!!busy || refreshing} onClick={save}>
          {busy === "save" || refreshing ? copy.checking : formatPlural(locale, copy.save, drafts.length)}
        </button>
      )}
    </div>
  );
}

/** Withdraws a claim after a confirm step. The claim stays in the history; it is just no longer checked. */
export function WithdrawClaimButton({ caseId, claimId, label, copy }: { caseId: string; claimId: string; label: string; copy: M["claims"]["withdraw"] & { cancel: string; requestFailed: string } }) {
  const { refresh, refreshing } = useRefresh();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = busy || refreshing;
  const name = format(copy.label, { claim: label });
  if (!armed)
    return (
      <button type="button" className="no-print btn btn-secondary px-3 py-1 text-xs" onClick={() => setArmed(true)} aria-label={name}>
        {copy.start}
      </button>
    );
  return (
    <div role="group" aria-label={name} className="no-print flex w-full flex-wrap items-center justify-end gap-2 rounded-lg bg-canvas px-3 py-2 text-sm sm:w-auto">
      <span className="text-muted">{copy.confirm}</span>
      <button
        type="button"
        className="btn btn-primary px-3 py-1 text-xs"
        disabled={working}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/cases/${caseId}/claims/${claimId}`, { method: "DELETE" });
            if (!res.ok) throw new ApiError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "", res.status, {});
            refresh();
          } catch (e) {
            setError(problem(e, copy.requestFailed));
          } finally {
            setBusy(false);
          }
        }}
      >
        {working ? copy.busy : copy.yes}
      </button>
      <button type="button" className="btn btn-secondary px-3 py-1 text-xs" disabled={working} onClick={() => setArmed(false)}>
        {copy.cancel}
      </button>
      {error ? (
        <span role="alert" className="w-full text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** The reviewer's own label for a case (stock number, seller name), so similar cases can be told apart. */
export function ReferenceEditor({ caseId, value, copy }: { caseId: string; value: string | null; copy: M["reference"] & { save: string; saving: string; cancel: string; requestFailed: string } }) {
  const { refresh, refreshing } = useRefresh();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!editing)
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {value ? <span>{value}</span> : <span className="text-muted">{copy.none}</span>}
        <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => (setText(value ?? ""), setEditing(true))}>
          {value ? copy.edit : copy.add}
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
          setError(problem(err, copy.requestFailed));
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} placeholder={copy.placeholder} aria-label={copy.label} autoFocus />
      <div className="flex gap-2">
        <button className="btn btn-primary px-3 py-1 text-xs" disabled={busy || refreshing}>
          {busy || refreshing ? copy.saving : copy.save}
        </button>
        <button type="button" className="btn btn-secondary px-3 py-1 text-xs" onClick={() => setEditing(false)}>
          {copy.cancel}
        </button>
      </div>
      {error ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- registry and issuer checks

export function VinDecodeButton({ caseId, provider = "nhtsa_vpic", label, copy }: { caseId: string; provider?: "nhtsa_vpic" | "nzta_mvr"; label: string; copy: { checking: string; requestFailed: string } }) {
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
            setError(problem(e, copy.requestFailed));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy || refreshing ? copy.checking : label}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

const METHODS: VerificationMethod[] = ["issuer_phone", "issuer_email", "issuer_portal", "registry_lookup", "government_document_number"];
const OUTCOMES = ["confirmed", "denied", "no_response"] as const;

export function VerificationForm({
  caseId,
  docId,
  copy,
}: {
  caseId: string;
  docId: string;
  copy: M["document"]["verify"] & { methods: M["labels"]["verificationMethod"]; saving: string; requestFailed: string };
}) {
  const { refresh, refreshing } = useRefresh();
  const [method, setMethod] = useState<VerificationMethod>("issuer_phone");
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number]>("confirmed");
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
          setError(problem(err, copy.requestFailed));
        } finally {
          setBusy(false);
        }
      }}
    >
      <select className="input" value={method} onChange={(e) => setMethod(e.target.value as VerificationMethod)} aria-label={copy.how}>
        {METHODS.map((m) => (
          <option key={m} value={m}>
            {copy.methods[m]}
          </option>
        ))}
      </select>
      <select className="input" value={outcome} onChange={(e) => setOutcome(e.target.value as (typeof OUTCOMES)[number])} aria-label={copy.said}>
        {OUTCOMES.map((o) => (
          <option key={o} value={o}>
            {copy.outcomes[o]}
          </option>
        ))}
      </select>
      <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={copy.contactPlaceholder} aria-label={copy.contact} required />
      <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={copy.reference} aria-label={copy.reference} />
      <textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder={copy.notePlaceholder} aria-label={copy.note} />
      <ErrorNote error={error} />
      <button className="btn btn-primary justify-self-start" disabled={busy || refreshing}>
        {busy || refreshing ? copy.saving : copy.submit}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- evidence agent

export function RunAgentButton({ caseId, disabled, copy }: { caseId: string; disabled?: boolean; copy: M["agentCard"]["run"] & { seconds: string; requestFailed: string } }) {
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
            setError(problem(e, copy.requestFailed));
          } finally {
            setStartedAt(null);
          }
        }}
      >
        {busy ? (
          <>
            {copy.busy}
            <Elapsed since={startedAt} template={copy.seconds} /> {copy.upTo}
          </>
        ) : refreshing ? (
          copy.loading
        ) : (
          copy.start
        )}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}

export function CopyButton({ text, labels }: { text: string; labels: { copy: string; copied: string } }) {
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
      {done ? labels.copied : labels.copy}
    </button>
  );
}

// ---------------------------------------------------------------- landing page forms

type LandingCopy = Messages["landing"];

/** The leads API answers in English; show its errors in the page's language, by status. */
function leadError(err: unknown, errors: LandingCopy["errors"]) {
  const status = err instanceof ApiError ? err.status : 0;
  return status === 429 ? errors.rateLimited : status === 400 ? errors.invalid : errors.generic;
}

export function WaitlistForm({ dark = true, copy, errors }: { dark?: boolean; copy: LandingCopy["waitlist"]; errors: LandingCopy["errors"] }) {
  // The landing page shows this form twice, so ids must be unique per instance.
  const id = useId();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done")
    return (
      <p role="status" className={`text-sm font-medium ${dark ? "text-[#7fd3b2]" : "text-[#1f6b50]"}`}>
        {copy.done}
      </p>
    );
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
          setError(leadError(err, errors));
          setState("idle");
        }
      }}
    >
      <label className={`text-sm font-semibold ${dark ? "text-white" : "text-ink"}`} htmlFor={`${id}-email`}>
        {copy.label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={copy.placeholder}
          aria-describedby={`${id}-note`}
          className="w-full rounded-lg border-0 bg-[#f3f1ec] px-3 py-2.5 text-sm text-[#16202c] outline-none focus:ring-2 focus:ring-[#7fd3b2]"
        />
        {/* Honeypot: hidden from people, filled by bots. */}
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" className="hidden" aria-hidden />
        <button disabled={state === "busy"} className="whitespace-nowrap rounded-lg bg-[#7fd3b2] px-5 py-2.5 text-sm font-semibold text-[#0f1c2b] hover:bg-[#95ddc0] disabled:opacity-60">
          {state === "busy" ? copy.busy : copy.submit}
        </button>
      </div>
      {error ? (
        <p id={`${id}-note`} role="alert" className={`text-xs ${dark ? "text-red-300" : "text-red-700"}`}>
          {error}
        </p>
      ) : (
        <p id={`${id}-note`} className={`text-xs ${dark ? "text-white/60" : "text-muted"}`}>
          {copy.note}
        </p>
      )}
    </form>
  );
}

export function DemoRequestForm({ copy, errors }: { copy: LandingCopy["demoForm"]; errors: LandingCopy["errors"] }) {
  const [f, setF] = useState({ name: "", email: "", company: "", role: "", volumeRange: "", wantsToVerify: "", marketingOptIn: false, website: "" });
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  if (state === "done")
    return (
      <p role="status" className="rounded-lg bg-[#e6f4ee] px-4 py-3 text-sm font-medium text-[#1f6b50]">
        {copy.done}
      </p>
    );
  const field = "w-full rounded-lg border border-[#d9d5cb] bg-[#fdfcfa] px-3 py-2 text-sm font-normal outline-none focus:ring-2 focus:ring-[#1f6b50]";
  const optional = <span className="font-normal text-muted">{copy.optional}</span>;
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
          setError(leadError(err, errors));
          setState("idle");
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold">
          {copy.name}
          <input required autoComplete="name" className={field} value={f.name} onChange={set("name")} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {copy.email}
          <input required type="email" autoComplete="email" placeholder={copy.emailPlaceholder} className={field} value={f.email} onChange={set("email")} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {copy.company}
          <input required autoComplete="organization" className={field} value={f.company} onChange={set("company")} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {copy.role}
          <select required className={field} value={f.role} onChange={set("role")}>
            <option value="">{copy.roleChoose}</option>
            {(Object.keys(copy.roles) as (keyof typeof copy.roles)[]).map((r) => (
              <option key={r} value={r}>
                {copy.roles[r]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        <span>
          {copy.volume} {optional}
        </span>
        <select className={field} value={f.volumeRange} onChange={set("volumeRange")}>
          <option value="">{copy.volumeChoose}</option>
          <option value="1-10">1–10</option>
          <option value="11-50">11–50</option>
          <option value="51-200">51–200</option>
          <option value="200+">200+</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        <span>
          {copy.verify} {optional}
        </span>
        <textarea className={`${field} min-h-20`} placeholder={copy.verifyPlaceholder} value={f.wantsToVerify} onChange={set("wantsToVerify")} maxLength={1000} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.marketingOptIn} onChange={set("marketingOptIn")} /> {copy.updates} <span className="text-muted">{copy.optional}</span>
      </label>
      <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} name="website" className="hidden" aria-hidden />
      <ErrorNote error={error} />
      <button disabled={state === "busy"} className="rounded-lg bg-[#1f6b50] px-5 py-3 text-sm font-semibold text-white hover:bg-[#185a43] disabled:opacity-60">
        {state === "busy" ? copy.busy : copy.submit}
      </button>
      <p className="text-xs text-muted">{copy.privacy}</p>
    </form>
  );
}
