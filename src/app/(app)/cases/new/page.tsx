import { NewCaseForm } from "@/components/client";
import { PageTitle } from "@/components/ui";
import { format } from "@/i18n/format";
import { rich } from "@/i18n/rich";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { getConfig, typicalReadSeconds } from "@/lib/config";
import { SAMPLE_CASES } from "@/lib/samples/definitions";

export const dynamic = "force-dynamic";

const NEXT_STEPS = ["vehicle", "claims", "review"] as const;

export default async function NewCasePage() {
  await requireUser();
  const { m } = await getI18n();
  const t = m.newCase;
  const cfg = getConfig();
  const maxMb = Math.round(cfg.maxUploadBytes / 1048576);
  return (
    <>
      <PageTitle eyebrow={t.eyebrow} title={t.title}>
        {t.intro}
      </PageTitle>
      <ol aria-label={t.stepsLabel} className="mb-6 grid gap-2 sm:grid-cols-3">
        {NEXT_STEPS.map((key, i) => (
          <li key={key} aria-current={i === 0 ? "step" : undefined} className={`flex gap-3 rounded-xl border bg-[#fdfcfa] p-3 ${i === 0 ? "border-brand-600 ring-1 ring-brand-600" : "border-line"}`}>
            <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${i === 0 ? "bg-brand-600 text-white" : "bg-unknown-bg text-unknown-fg"}`}>
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{t.steps[key].title}</p>
              <p className="text-xs text-muted">{t.steps[key].body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <NewCaseForm
          maxMb={maxMb}
          typicalSeconds={typicalReadSeconds(cfg)}
          copy={{
            form: t.form,
            upload: {
              ...m.upload,
              provenance: m.labels.provenance,
              remove: m.common.remove,
              working: m.common.working,
              updating: m.common.updating,
              seconds: m.common.seconds,
              requestFailed: m.errors.requestFailed,
            },
            vin: { vinChars: m.errors.vinChars, vinIOQ: m.errors.vinIOQ, vinLength: m.errors.vinLength },
            optional: m.common.optional,
          }}
        />
        <aside className="grid content-start gap-4">
          <div className={`card p-4 text-sm ${cfg.aiMode === "demo" ? "border-amber-200 bg-amber-50/60" : ""}`}>
            <h2 className="label mb-1">{t.reading.title}</h2>
            {cfg.aiMode === "vertex" ? (
              <p>
                {t.reading.live}
                <span className="tech-detail text-muted">{format(t.reading.model, { model: cfg.geminiModel })}</span>
              </p>
            ) : (
              <p>{rich(t.reading.demo, { strong: <strong>{t.reading.demoStrong}</strong> })}</p>
            )}
          </div>
          <div className="card p-4 text-sm">
            <h2 className="label mb-1">{t.samples.title}</h2>
            <p className="mb-3 text-xs text-muted">{t.samples.body}</p>
            {SAMPLE_CASES.map((sc) => (
              <div key={sc.id} className="mb-3 last:mb-0">
                <div className="text-xs font-semibold">
                  {sc.vehicle.year} {sc.vehicle.make} {sc.vehicle.model} · VIN <span className="font-mono">{sc.vehicle.vin}</span>
                </div>
                <ul className="mt-1 grid gap-0.5">
                  {sc.docs.map((d) => (
                    <li key={d.id}>
                      <a className="link text-xs" href={`/api/samples/${d.filename}`} download>
                        {d.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
