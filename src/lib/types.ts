// Core domain model for VoltProof.
// Principle: Gemini reads (Extraction), rules decide (Finding), people resolve (Review).

export type Status = "verified" | "consistent" | "conflict" | "unknown";

export type DocumentType =
  | "service_invoice"
  | "purchase_invoice"
  | "vehicle_registration"
  | "dashboard_photo"
  | "battery_report"
  | "insurance_or_repair_record"
  | "charging_log"
  | "other";

/** Who produced or obtained the document, as recorded by the uploader. */
export type Provenance = "seller_provided" | "dealer_captured" | "dealer_ordered" | "unknown";

export type OdometerUnit = "km" | "mi";

/** One extracted value plus the evidence behind it. */
export interface ExtractedField<T> {
  value: T | null;
  page: number | null;
  quote: string | null;
  /** Model self-reported confidence (0–1). Not calibrated. */
  confidence: number | null;
  /** False when the value lacks a quote or falls below the confidence threshold. */
  supported: boolean;
  unsupportedReason?: string;
  /** Result of checking the quote against the document's own text layer. */
  grounded?: GroundingResult;
  /** Images only: where the value is, as [ymin, xmin, ymax, xmax] scaled 0–1000. */
  box?: [number, number, number, number] | null;
  /** Set when a forensic check found a possible edit on this value. */
  tamperIndicator?: string;
  /** A second, independent OCR read of this identifier (photos and scans). */
  secondRead?: SecondRead;
}

export interface SecondRead {
  engine: "paddleocr";
  result: "agree" | "disagree" | "not_found";
  /** What the second reader saw, when it disagrees. */
  text?: string;
}

export type GroundingResult = "exact" | "fuzzy" | "other_page" | "not_found" | "not_checked";

export interface Odometer {
  reading: number;
  unit: OdometerUnit;
}

export interface ExtractionFields {
  documentType: ExtractedField<DocumentType>;
  issuer: ExtractedField<string>;
  documentDate: ExtractedField<string>;
  vin: ExtractedField<string>;
  make: ExtractedField<string>;
  model: ExtractedField<string>;
  odometer: ExtractedField<Odometer>;
  serviceDetails: ExtractedField<string>;
  batteryTestDate: ExtractedField<string>;
  batterySohPercent: ExtractedField<number>;
  batteryTestProvider: ExtractedField<string>;
  /** Collision, body or structural damage repair described in the document. Absent for routine maintenance. */
  damageRepair: ExtractedField<string>;
  /** Share of charging energy from DC fast charging, only when the document states it. */
  dcChargingSharePercent: ExtractedField<number>;
  /** Registration (licence plate) number, as printed. */
  registrationNumber: ExtractedField<string>;
}

export type FieldName = keyof ExtractionFields;

export type ExtractionMode = "vertex-gemini" | "demo-fixture";

export interface ModelUsage {
  model: string;
  latencyMs: number;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface Extraction {
  mode: ExtractionMode;
  model: string | null;
  extractedAt: string;
  fields: ExtractionFields;
  warnings: string[];
  usage?: ModelUsage;
  /** How quotes were checked against the file: PDF text layer, or not checkable (images, scans). */
  grounding?: "pdf_text" | "not_checkable";
}

export type ExtractionStatus = "pending" | "processing" | "extracted" | "failed" | "not_configured";

export interface IntegrityIndicator {
  code: string;
  /** "potential" = possible sign of alteration (never proof). "info" = context only. */
  severity: "potential" | "info";
  message: string;
}

export interface IntegrityResult {
  sha256: string;
  detectedType: string;
  checkedAt: string;
  indicators: IntegrityIndicator[];
}

export interface CaseDocument {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: string;
  uploadedBy: string;
  provenance: Provenance;
  /** Set for documents from the built-in synthetic sample set. */
  sampleId: string | null;
  integrity: IntegrityResult;
  extractionStatus: ExtractionStatus;
  extractionError: string | null;
  /** Latest extraction. Earlier ones are kept in extractionHistory. */
  extraction: Extraction | null;
  extractionHistory: Extraction[];
  /** Field-level forensic checks and digital signatures. Run after extraction. */
  forensics?: DocumentForensics;
  /** Confirmations obtained from the issuer or a registry, recorded by a person. */
  verifications?: IssuerVerification[];
}

export type ForensicMethod = "pdf_text_layer" | "pdf_annotation" | "pdf_signature" | "jpeg_ghost" | "ink_marks" | "injection_scan";

export interface ForensicIndicator {
  code: string;
  severity: "potential" | "info";
  method: ForensicMethod;
  message: string;
  /** The extracted field this concerns, when it can be tied to one. */
  field?: FieldName;
  page?: number;
}

export interface PdfSignatureCheck {
  signer: string | null;
  organization: string | null;
  signedAt: string | null;
  /** valid: the signed bytes are unchanged; invalid: they changed; unverifiable: could not be checked. */
  integrity: "valid" | "invalid" | "unverifiable";
  /** False when bytes were added to the file after this signature (an incremental update). */
  coversWholeFile: boolean;
  /** Name from the trust list when the signer's certificate is on it. */
  trustedAs: string | null;
  certificateSha256: string | null;
  detail: string;
}

export interface DocumentForensics {
  checkedAt: string;
  /** Which checks could run on this file. */
  methods: ForensicMethod[];
  indicators: ForensicIndicator[];
  signatures: PdfSignatureCheck[];
  /** Storage key of the compression-history heat map (photos with a JPEG-ghost indicator). */
  heatmapKey?: string;
}

export type VerificationMethod = "issuer_phone" | "issuer_email" | "issuer_portal" | "registry_lookup" | "government_document_number";

/** A person's record of checking a document with whoever issued it. */
export interface IssuerVerification {
  id: string;
  method: VerificationMethod;
  outcome: "confirmed" | "denied" | "no_response";
  /** Who was contacted, and any reference number they gave. */
  contact: string;
  reference: string;
  note: string;
  by: string;
  at: string;
}

export interface EvidenceRef {
  documentId: string | null;
  documentName: string;
  field: string;
  value: string;
  page: number | null;
  quote: string | null;
  confidence: number | null;
  note?: string;
}

export type FindingCategory =
  | "vehicle_identity"
  | "odometer"
  | "dates"
  | "battery"
  | "extraction"
  | "integrity"
  | "authenticity"
  | "claim";

export interface Finding {
  /** Stable across rule runs, so human reviews can follow a finding. */
  id: string;
  ruleId: string;
  category: FindingCategory;
  title: string;
  checked: string;
  evidence: EvidenceRef[];
  status: Status;
  result: string;
  whyItMatters: string;
  nextAction: string | null;
  /** Shown in the Decision Impact panel when unresolved. */
  decisionImpact: boolean;
  /** Placed in the human review queue. */
  requiresReview: boolean;
  /** Set when this finding is the assessment of a seller claim. */
  claim?: ClaimAssessmentInfo;
}

// ---------------------------------------------------------------- seller claims

export type ClaimType = "battery_soh" | "odometer" | "accident_history" | "fast_charging";

/** What the seller says. Exactly one of the value shapes is used per claim type. */
export interface ClaimStated {
  /** battery_soh: percent. odometer: reading. fast_charging: highest DC share the claim allows, in percent. */
  number?: number;
  unit?: OdometerUnit | "%";
  /** accident_history: true = "the car has had accident damage", false = "no accidents". */
  flag?: boolean;
  /** The seller's own wording, for display. */
  text?: string;
}

export type ClaimSource = "seller_listing" | "seller_form" | "manual";

export interface Claim {
  id: string;
  type: ClaimType;
  stated: ClaimStated;
  source: ClaimSource;
  /** Exact span of the listing the claim was parsed from, if any. */
  sourceText: string | null;
  createdBy: string;
  createdAt: string;
  withdrawn?: boolean;
}

export interface ClaimAssessmentInfo {
  claimId: string;
  type: ClaimType;
  /** "Battery health: 92% claimed" */
  label: string;
  /** One-line reason shown under the label, as on the landing page. */
  headline: string;
  /** What evidence would move an Unknown claim forward. */
  missing: string | null;
  assessorVersion: string;
}

export interface RuleRun {
  id: string;
  at: string;
  rulesVersion: string;
  assessorVersion?: string;
  trigger: string;
  findings: Finding[];
}

export type Resolution = "resolved" | "unresolved" | "more_info_requested";

/** A human decision. Append-only; never modifies the machine finding. */
export interface Review {
  id: string;
  findingId: string;
  ruleRunId: string;
  findingSnapshot: { title: string; status: Status; result: string; evidenceKey?: string };
  resolution: Resolution;
  note: string;
  reviewer: string;
  at: string;
}

export interface AuditEvent {
  at: string;
  actor: string;
  type: string;
  /** What happened, in plain words. */
  detail: string;
  /** Model names, versions, hashes and timings, shown only with "Technical details" on. Older events have none. */
  technical?: string;
}

export interface Vehicle {
  make: string;
  model: string;
  year: number | null;
  vin: string;
}

export interface Case {
  id: string;
  caseNumber: string;
  synthetic: boolean;
  vehicle: Vehicle;
  createdAt: string;
  createdBy: string;
  documents: CaseDocument[];
  /** Seller claims under review. Older stored cases may lack this field. */
  claims?: Claim[];
  /** External VIN decodes and registry lookups, newest last. */
  registryChecks?: RegistryCheck[];
  /** Runs of the ADK evidence agent, newest last. */
  agentRuns?: AgentRun[];
  ruleRuns: RuleRun[];
  reviews: Review[];
  events: AuditEvent[];
  /** The reviewer's own label, such as a stock number or the seller's name, to tell cases apart. */
  reference?: string | null;
  /** Set when a person archived the case. Archived cases keep their audit trail but leave the dashboard and review queue. */
  archivedAt?: string | null;
  archivedBy?: string | null;
}

// ---------------------------------------------------------------- landing page leads

export type LeadRole = "lender" | "dealer" | "marketplace" | "insurer" | "fleet" | "buyer" | "other";

export interface Lead {
  /** SHA-256 of kind + lowercased email, so repeat sign-ups are idempotent. */
  id: string;
  kind: "waitlist" | "demo";
  email: string;
  name?: string;
  company?: string;
  role?: LeadRole;
  volumeRange?: string;
  wantsToVerify?: string;
  marketingOptIn: boolean;
  createdAt: string;
  /** Salted hash of the client IP, for abuse control. Never the raw IP. */
  ipHash: string;
  userAgent: string;
}

// ---------------------------------------------------------------- registry and issuer checks

export type RegistryProvider = "nhtsa_vpic" | "nzta_mvr" | "kr_car365";

/** A lookup against an external reference source (VIN decoder or vehicle registry). */
export interface RegistryCheck {
  id: string;
  provider: RegistryProvider;
  providerName: string;
  kind: "vin_decode" | "register_match" | "registration_lookup";
  query: { vin?: string; registrationNumber?: string };
  checkedAt: string;
  checkedBy: string;
  outcome: "ok" | "not_found" | "error" | "not_configured";
  /** Normalised values returned by the source (make, model, modelYear, ...). */
  data: Record<string, string | null>;
  message: string;
  sourceUrl: string | null;
}

// ---------------------------------------------------------------- evidence agent (ADK)

export interface AgentStep {
  /** Workflow node or agent that produced the step. */
  node: string;
  kind: "check" | "tool_call" | "decision" | "draft" | "model_call" | "analysis";
  /** Tool name, for tool calls. */
  tool?: string;
  /** Gemini model, for model calls and analyses. */
  model?: string;
  /** Duration in milliseconds. */
  ms?: number;
  summary: string;
  /** Result of a tool call or longer output. */
  detail?: string;
}

export interface ForensicFindingExplanation {
  indicatorCode: string;
  field: string | null;
  whatWasFound: string;
  whatYouCanSee: string;
  howSuchEditsAreMade: string;
  innocentExplanations: string;
  whatToRequest: string;
}

/** Gemini's explanation of one flagged document (it never changes a status). */
export interface ForensicDocumentReport {
  documentId: string;
  filename: string;
  model: string;
  summary: string;
  findings: ForensicFindingExplanation[];
  limitations: string;
}

export interface CitedText {
  text: string;
  /** Finding ids this text is about. Every draft must cite at least one. */
  findingIds: string[];
}

export interface IssuerRequestDraft extends CitedText {
  documentId: string;
  /** Who to contact, e.g. "Lakeside EV Centre (find contact details independently)". */
  to: string;
  subject: string;
}

export interface AgentRun {
  id: string;
  startedAt: string;
  finishedAt: string;
  model: string;
  agentVersion: string;
  steps: AgentStep[];
  reviewerSummary: CitedText[];
  sellerQuestions: CitedText[];
  issuerRequests: IssuerRequestDraft[];
  /** Forensic analyst explanations of flagged documents. */
  forensicReport?: ForensicDocumentReport[];
  /** Drafts removed by validation (uncited, unknown finding, verdict language). */
  dropped: string[];
  by: string;
}
