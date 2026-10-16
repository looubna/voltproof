// Display labels shared by server and client code. No secrets, no Node APIs.
import type { ClaimType, DocumentType, Provenance, Resolution, Status, ExtractionStatus } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  verified: "Verified",
  consistent: "Consistent",
  conflict: "Conflict",
  unknown: "Unknown",
};

export const STATUS_MEANING: Record<Status, string> = {
  verified: "A specific fact was established by a clearly identified source or check. The finding says exactly what was verified.",
  consistent: "The available documents agree with one another. This does not prove that their contents are true.",
  conflict: "Sources disagree or a deterministic check failed. A person must review it. A conflict is not proof of fraud.",
  unknown: "There is not enough evidence to reach a conclusion.",
};

export const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  service_invoice: "Service invoice",
  purchase_invoice: "Purchase invoice",
  vehicle_registration: "Vehicle registration",
  dashboard_photo: "Dashboard photo",
  battery_report: "Battery report",
  insurance_or_repair_record: "Insurance or repair record",
  charging_log: "Charging log",
  other: "Other document",
};

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  seller_provided: "Provided by seller",
  dealer_captured: "Captured by dealership staff",
  dealer_ordered: "Ordered by dealership from provider",
  unknown: "Source not recorded",
};

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  resolved: "Resolved",
  unresolved: "Unresolved",
  more_info_requested: "More information requested",
};

export const EXTRACTION_STATUS_LABEL: Record<ExtractionStatus, string> = {
  pending: "Waiting to be read",
  processing: "Reading…",
  extracted: "Read",
  failed: "Reading failed",
  not_configured: "Not read (AI not configured)",
};

export const FIELD_LABEL: Record<string, string> = {
  documentType: "Document type",
  issuer: "Issuer",
  documentDate: "Document date",
  vin: "VIN",
  make: "Make",
  model: "Model",
  odometer: "Odometer",
  serviceDetails: "Service / invoice details",
  batteryTestDate: "Battery test date",
  batterySohPercent: "Battery state of health (as reported)",
  batteryTestProvider: "Battery test provider",
  damageRepair: "Damage repair",
  dcChargingSharePercent: "DC fast-charging share",
  registrationNumber: "Registration number",
};

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  battery_soh: "Battery health",
  odometer: "Mileage",
  accident_history: "Accident history",
  fast_charging: "Fast-charging history",
};
