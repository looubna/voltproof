// Server-side configuration. Never import from client components.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfig() {
  const aiModeRaw = (process.env.VOLTPROOF_AI_MODE || "demo").toLowerCase();
  const project = process.env.GOOGLE_CLOUD_PROJECT || "";
  return {
    aiMode: aiModeRaw === "vertex" && project ? ("vertex" as const) : ("demo" as const),
    aiModeRequested: aiModeRaw,
    gcpProject: project,
    gcpLocation: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || "",
    geminiTimeoutMs: num("GEMINI_TIMEOUT_MS", 45000),
    storage: (process.env.VOLTPROOF_STORAGE || "local").toLowerCase() === "gcp" ? ("gcp" as const) : ("local" as const),
    dataDir: process.env.VOLTPROOF_DATA_DIR || "./data",
    firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
    firestoreCollection: process.env.FIRESTORE_COLLECTION || "voltproof_cases",
    gcsBucket: process.env.GCS_BUCKET || "",
    accessCode: process.env.VOLTPROOF_ACCESS_CODE || "",
    batteryReportMaxAgeDays: num("BATTERY_REPORT_MAX_AGE_DAYS", 90),
    minConfidence: Math.min(num("EXTRACTION_MIN_CONFIDENCE", 0.7), 1),
    maxUploadBytes: num("MAX_UPLOAD_MB", 10) * 1024 * 1024,
    sohTolerancePts: num("SOH_TOLERANCE_PTS", 2),
    odometerToleranceKm: num("ODOMETER_TOLERANCE_KM", 500),
    odometerFreshDays: num("ODOMETER_FRESH_DAYS", 30),
    /** Origin of the marketing site allowed to post to /api/leads (CORS). */
    landingOrigin: process.env.LANDING_ORIGIN || "",
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
