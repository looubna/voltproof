// The sentences the rules and the claim assessor write, in English: the language of the stored
// record. id.ts and ko.ts give the same sentences in other languages (same shape, enforced by
// the RuleText type). Values from documents (file names, quotes, dates, VINs) are passed in
// and shown as they are; only VoltProof's own wording is translated.
//
// These are functions rather than "{placeholder}" strings because word order, plurals and
// lists differ between languages, and each language arranges its own sentence.
import { en as m } from "../messages/en";
import type { ClaimType, DocumentType, Odometer } from "../../lib/types";

const n = (x: number) => x.toLocaleString("en-US");
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** "a", "a and b", "a, b and c". */
const and = (items: string[]) => (items.length <= 2 ? items.join(" and ") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const field = (name: string) => (m.labels.field as Record<string, string>)[name] ?? name;
const odo = (o: Odometer) => `${n(o.reading)} ${o.unit}`;
/** "Odometer" → "odometer", while "VIN" and "DC …" keep their capitals. */
const fieldInline = (name: string) => field(name).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
const docTypeInline = (t: DocumentType) => m.labels.docType[t].toLowerCase();
const claimTypeInline = (t: ClaimType) => m.labels.claimType[t].toLowerCase();

export type DocumentIssue = "signature" | "forensic" | "fileChecks" | "denied";

export const en = {
  // ------------------------------------------------------------ shared wording
  odo,
  km: (x: number) => `${n(Math.round(x))} km`,
  and,
  docType: (t: DocumentType) => m.labels.docType[t],
  docTypeInline,
  docLabel: (type: DocumentType | null, filename: string) => (type ? `${m.labels.docType[type]} · ${filename}` : filename),
  field,
  fieldInline,
  claimTypeInline,
  /** Why the reader's value was set aside (written when the document was read). */
  reason: (raw: string) => raw,
  /** How a lookup ended, as a value in the evidence table. */
  outcome: (code: string) => code,
  registerOutcome: (code: string) => code.replace("_", " "),
  verificationMethod: (code: string) => code.replace(/_/g, " "),
  documentIssue: {
    signature: "its digital signature no longer matches the content",
    forensic: "a forensic check found a possible edit",
    fileChecks: "file checks found possible signs of alteration",
    denied: "the issuer said it did not issue this document",
  } satisfies Record<DocumentIssue, string>,

  // ------------------------------------------------------------ evidence table
  ev: {
    caseRecord: "Case record (entered by appraiser)",
    vin: "VIN",
    makeModel: "Make / model",
    notUsed: (reason: string) => `Not used: ${reason}`,
    unsupported: "not supported by a quote",
    dated: (iso: string) => `Dated ${iso}`,
    datedMiles: (iso: string, km: number) => `Dated ${iso} (≈ ${n(Math.round(km))} km)`,
    noTimelineDate: "Not placed on the timeline: the document has no usable date.",
    noDate: "Not used: the document has no usable date",
    invalidDate: "Invalid date",
    futureDate: "Date is in the future",
    beforeModelYear: "Earlier than the model year",
    daysBefore: (days: number) => `${days} days before the review date`,
    noDamage: "No damage repair mentioned",
    possibleEdit: "Possible edit found by a forensic check",
    captured: (by: string) => `Uploaded by ${by}, marked as captured by dealership staff`,
    file: "File",
    forensicCheck: "Forensic check",
    fileCheck: "File check",
    signature: "Digital signature",
    unknownSigner: "Unknown signer",
    issuerVerification: "Issuer verification",
    notPerformed: "Not performed",
    issuerDenied: "Issuer denied issuing it",
    vinDecode: "VIN decode",
    decoded: "decoded",
    lookedUp: (date: string, by: string) => `Looked up ${date} by ${by}`,
    registerRecords: "Register records for VIN prefix",
    registerValue: (matches: string | null, models: string | null) => `${matches} × ${models}`,
    registerNote: (message: string, date: string, by: string) => `${message} Looked up ${date} by ${by}`,
  },

  // ------------------------------------------------------------ rule 1: VIN consistency
  vinConsistency: {
    title: "VIN consistency",
    checked: "Whether every document that shows a VIN identifies the same vehicle as the case record.",
    why: "Documents for a different vehicle cannot support claims about this one. A mismatch can also come from a typing error or a mixed-up file.",
    none: "No document provides a readable VIN.",
    noneNext: "Photograph the VIN plate and upload the registration document.",
    mismatch: (doc: string, tail: string) => `${doc} shows a VIN ending ${tail}`,
    conflict: (mismatches: string[], against: "case" | "document", tail: string) => `${mismatches.join("; ")}, but the ${against === "case" ? "case record" : "first document"} has a VIN ending ${tail}.`,
    conflictNext: "Check the VIN on the vehicle itself and ask the seller to explain why the document shows a different VIN.",
    malformedNote: (count: number) => ` Note: ${plural(count, "VIN")} does not have the standard 17-character format.`,
    single: (doc: string) => `Only one source (${doc}) shows a VIN; nothing to compare.`,
    singleNext: "Enter the VIN from the vehicle plate in the case record.",
    consistent: (documents: number, withCase: boolean, tail: string) =>
      `${plural(documents, "document")}${withCase ? " and the case record" : ""} show the same VIN (ending ${tail}). This shows the documents agree; it does not prove they are genuine.`,
  },

  // ------------------------------------------------------------ rule 2: make and model
  vehicle: {
    title: "Make and model consistency",
    checked: "Whether the make and model on each document match the vehicle in the case record.",
    why: "A different make or model suggests the document belongs to another vehicle or was filled in incorrectly.",
    makeProblem: (doc: string, value: string, expected: string) => `${doc} names the make as "${value}", not "${expected}"`,
    modelProblem: (doc: string, value: string, expected: string) => `${doc} names the model as "${value}", not "${expected}"`,
    trimNote: (value: string, expected: string) => `"${value}" treated as a trim of "${expected}"`,
    conflict: (problems: string[]) => `${problems.join("; ")}.`,
    conflictNext: "Confirm the make and model on the vehicle and ask the seller to explain the document.",
    none: "No document states a readable make or model.",
    noneNext: "Upload the registration document.",
    consistent: (notes: string[]) => `Every stated make and model matches the case record.${notes.length ? ` ${notes.join("; ")}.` : ""}`,
  },

  // ------------------------------------------------------------ rule 3: mileage timeline
  mileage: {
    title: "Mileage timeline",
    checked: "Whether odometer readings increase over time, after converting miles to kilometres and ordering by document date.",
    why: "A reading that goes down over time leaves the mileage history unresolved. Mileage strongly affects a used vehicle's value and condition.",
    one: "Only one dated odometer reading is available, so a timeline cannot be checked.",
    none: "No dated odometer readings are available.",
    noneNext: "Ask the seller for dated service invoices that show the odometer.",
    drop: (d: { from: string; fromDate: string; fromDoc: string; to: string; toDate: string; toDoc: string; dropKm: number }) =>
      `${d.from} on ${d.fromDate} (${d.fromDoc}) is followed by ${d.to} on ${d.toDate} (${d.toDoc}), a drop of about ${n(Math.round(d.dropKm))} km`,
    conflict: (drops: string[]) =>
      `The odometer reading decreases over time: ${drops.join("; ")}. This needs investigation. It is not, by itself, proof of tampering. Possible explanations include an instrument-cluster replacement, a data-entry error on an invoice, or odometer rollback.`,
    conflictNext: "Ask the seller to explain the readings and to provide any instrument-cluster repair or replacement records. Check the service history with the workshop that issued the invoice.",
    consistent: (readings: number, first: string, last: string) =>
      `${plural(readings, "dated reading")} from ${first} to ${last} increase over time. This shows the documents agree; it does not prove the readings are accurate.`,
  },

  // ------------------------------------------------------------ rule 4: document dates
  dates: {
    title: "Document dates",
    checked: "Whether each document date is a real calendar date, is not later than the review date, and is not earlier than the vehicle's model year.",
    why: "The mileage timeline and the battery report age depend on correct dates. An impossible or future date suggests an error or an altered document.",
    invalid: (doc: string, fieldName: string, problem: "format" | "calendar", value: string) =>
      `${doc}: ${fieldInline(fieldName)} "${value}" ${problem === "format" ? "is not in YYYY-MM-DD form" : "is not a real calendar date"}`,
    future: (doc: string, iso: string, reviewDate: string) => `${doc} is dated ${iso}, after this review was opened (${reviewDate})`,
    beforeModelYear: (doc: string, iso: string, year: number) => `${doc} is dated ${iso}, before the vehicle's ${year} model year`,
    missingNote: (docs: string[]) => ` No date found on: ${docs.join("; ")}.`,
    conflict: (problems: string[]) => `${problems.join("; ")}.`,
    conflictNext: "Check the dates on the original documents and ask the issuer or seller to confirm them.",
    none: "No usable document dates were found.",
    noneNext: "Ask the seller for dated documents.",
    consistent: (dates: number) => `${plural(dates, "date")} checked; all are real dates within the expected range.`,
    undatedNext: "Ask for dated versions of the undated documents if they matter for the decision.",
  },

  // ------------------------------------------------------------ rules 5 and 6: battery report VIN and age
  noBatteryReport: "No battery report was provided.",
  arrangeTest: "Arrange an independent battery test.",
  batteryVin: {
    title: "Battery report VIN",
    checked: "Whether the battery report names the same VIN as the case record.",
    why: "A battery report for another vehicle says nothing about this vehicle's battery.",
    mismatch: (doc: string, tail: string, caseTail: string) => `${doc} names a VIN ending ${tail}; the case VIN ends ${caseTail}`,
    conflict: (mismatches: string[]) => `${mismatches.join("; ")}.`,
    conflictNext: "Do not rely on this report. Ask the provider to confirm which vehicle was tested, or arrange a new independent test.",
    noCaseVin: "The case record has no VIN to compare against.",
    noCaseVinNext: "Enter the VIN from the vehicle plate.",
    unreadable: "The battery report does not show a readable VIN, so it cannot be linked to this vehicle.",
    unreadableNext: "Ask the test provider for a report that names the VIN.",
    consistent: (tail: string, unreadable: number) =>
      `The battery report names the case VIN (ending ${tail}).${unreadable ? ` ${plural(unreadable, "other report")} had no readable VIN.` : ""} This links the report to the vehicle on paper; it does not confirm the report with its issuer.`,
  },
  batteryAge: {
    title: "Battery report age",
    checked: (maxDays: number, reviewDate: string) => `Whether the battery test was performed within ${maxDays} days of this review (${reviewDate}).`,
    why: "Battery condition changes with time and use. An old report may not describe the battery today.",
    noDate: "The battery report has no usable test date.",
    noDateNext: "Ask the provider for the test date, or arrange a new test.",
    conflict: (iso: string, days: number, maxDays: number) => `The most recent battery test (${iso}) was ${days} days before this review, more than the ${maxDays}-day limit.`,
    conflictNext: "Arrange a new independent battery test.",
    consistent: (iso: string, days: number, maxDays: number) =>
      `The battery test date stated on the report (${iso}) is ${days} days before this review, within the ${maxDays}-day limit. The date was read from the report, not confirmed with the provider.`,
  },

  // ------------------------------------------------------------ rule 7: VIN structure and decode
  vinStructure: {
    title: "VIN structure and decode",
    checked:
      "Whether each VIN is well-formed (17 characters, no I/O/Q), has a valid check digit where one is used, and encodes the same manufacturer and model year as the case record; and, if a reference decoder was consulted, what it returned.",
    why: "A VIN that fails these checks was mistyped, misread or made up. A valid VIN is not proof the documents are genuine: forgers copy real VINs.",
    caseRecord: "the case record",
    none: "No VIN is available to check.",
    noneNext: "Enter the VIN from the vehicle plate.",
    malformed: (where: string, vin: string) => `${where}: "${vin}" is not a well-formed 17-character VIN`,
    checkDigit: (where: string, tail: string, found: string, expected: string) => `${where}: VIN ending ${tail} fails its check digit (position 9 is "${found}", the VIN's other characters require "${expected}")`,
    checkDigitNote: (message: string) => `${message}. Some manufacturers outside North America do not use a check digit, so this is noted rather than flagged`,
    maker: (where: string, prefix: string, maker: string, make: string) => `${where}: VIN starting ${prefix} is assigned to ${maker}, not ${make}`,
    modelYear: (where: string, code: string, encoded: number | undefined, year: number) => `${where}: position 10 ("${code}") encodes model year ${encoded}, not ${year}`,
    decodeMake: (provider: string, decoded: string, make: string) => `${provider} decodes the VIN as a ${decoded}, not a ${make}`,
    decodeYear: (provider: string, decoded: string, year: number) => `${provider} decodes model year ${decoded}, not ${year}`,
    registerMake: (provider: string, prefix: string | null, makes: string | null, make: string) => `the ${provider} records vehicles with VIN prefix ${prefix} as ${makes}, not ${make}`,
    registerModel: (provider: string, prefix: string | null, models: string | null, model: string) => `the ${provider} records VIN prefix ${prefix} as ${models}, not ${model}`,
    registerPower: (provider: string, prefix: string | null, powers: string) => `the ${provider} records VIN prefix ${prefix} with motive power ${powers}, not electric`,
    registerVerified: (r: { provider: string; matches: string | null; prefix: string | null; years: string | null; make: string | null; model: string | null; power: string | null | undefined }) =>
      `${r.provider} records ${r.matches} vehicle${r.matches === "1" ? "" : "s"} with VIN prefix ${r.prefix}, all consistent with a ${r.years ?? ""} ${r.make} ${r.model} (${r.power?.toLowerCase()}). The register publishes only the first 11 VIN characters, so this confirms the make, model and power type the prefix belongs to, not this individual vehicle`.replace("  ", " "),
    conflict: (problems: string[]) => `${problems.join("; ")}. This needs checking against the plate on the vehicle. It is not, by itself, proof of fraud: a single misread character causes it too.`,
    conflictNext: "Read the VIN from the vehicle plate and windscreen, and compare it character by character with the documents.",
    notes: (notes: string[]) => ` Note: ${notes.join("; ")}.`,
    decodedAs: (provider: string, vehicle: string, electrification: string | null | undefined) => `${provider} decodes the VIN as ${vehicle}${electrification ? ` (${electrification})` : ""}, matching the case record`,
    verified: (parts: string[]) => `What was verified: ${parts.join(". ")}. Every VIN on file is well-formed. This does not confirm registration of this vehicle, its ownership or its history.`,
    offline: (vins: number) => `${plural(vins, "VIN")} checked: the format is valid, and the maker and model-year codes match the case record.`,
    /** A lookup's own message, from the outside service, as it was received. */
    serviceMessage: (message: string) => ` ${message}`,
    decodeNotFound: (provider: string, message: string) =>
      ` The ${provider} could not identify this VIN: ${message} Its coverage is best for vehicles sold in North America, so this is common for other markets, but the VIN is not confirmed by a reference source.`,
    decodeIncomplete: (provider: string, message: string) => ` The ${provider} lookup did not complete: ${message}`,
    notFoundNext: "Compare the VIN on the vehicle plate with the documents character by character, or check it with a registry for the vehicle's market.",
    incompleteNext: "Run the VIN decode again.",
    caseOnly: " No document shows a VIN and no VIN lookup has been run, so nothing confirms it yet.",
    caseOnlyNext: "Upload the registration document, or look the VIN up.",
    noLookup: " No VIN lookup has been run yet.",
    noLookupNext: "Look the VIN up in a VIN database.",
  },

  // ------------------------------------------------------------ rule 8: registration number
  registration: {
    title: "Registration number",
    checked: "Whether every document that shows a registration (plate) number shows the same one.",
    why: "Registries are searched by plate as well as VIN. A different plate on one document suggests it belongs to another vehicle or was changed.",
    none: "No document shows a readable registration number.",
    plateOn: (plate: string, doc: string) => `${plate} on ${doc}`,
    conflict: (plates: string[]) => `Documents show different registration numbers: ${plates.join("; ")}.`,
    conflictNext: "Check the plate on the vehicle and ask the seller to explain the different number.",
    consistent: (documents: number, plate: string) => `${plural(documents, "document")} show the same registration number (${plate}). This shows the documents agree; it does not confirm the registration.`,
    single: (doc: string, plate: string) => `Only ${doc} shows a registration number (${plate}); nothing to compare it with.`,
  },

  // ------------------------------------------------------------ evidence summaries
  batteryHealth: {
    title: "Battery health evidence",
    checked: "Whether a battery test report for this vehicle is available, and what it reports.",
    why: "Battery condition is a major part of a used EV's value and could affect the purchase decision.",
    reported: (soh: number, provider: string | null) => `${soh}% state of health, as reported by ${provider ?? "an unnamed provider"}`,
    none: "Battery health is not established: no battery test report was provided.",
    noneNext: "Arrange an independent battery test before making an offer.",
    unreadable: "A battery report was provided but no state-of-health figure could be read from it.",
    unreadableNext: "Check the report manually or arrange an independent battery test.",
    failed: (reported: string[], check: "vin" | "age") => `Report states ${reported.join("; ")}, but the report failed the ${check === "vin" ? "VIN" : "age"} check, so it cannot be relied on for this vehicle.`,
    unlinked: (reported: string[]) => `Report states ${reported.join("; ")}, but it could not be linked to this vehicle's VIN.`,
    unlinkedNext: "Ask the provider for a report that names the VIN.",
    consistent: (reported: string[]) =>
      `Report states ${reported.join("; ")}. It names this vehicle's VIN and is recent. VoltProof shows the figure exactly as reported. It did not test the battery and has not confirmed the report with its issuer.`,
  },
  currentOdometer: {
    title: "Current odometer",
    checked: "Whether dealership staff recorded the current odometer reading themselves (for example a dashboard photo taken at inspection).",
    why: "A reading captured by the dealership does not depend on the seller's paperwork.",
    none: "No dealer-captured odometer reading is on file.",
    noneNext: "Photograph the dashboard odometer during inspection and upload it as dealer-captured.",
    verified: (date: string, reading: string) =>
      `What was verified: dealership staff photographed the dashboard${date ? ` on ${date}` : ""} and it shows ${reading}. This verifies the reading on the instrument cluster on that day. It does not verify the vehicle's mileage history.`,
  },

  // ------------------------------------------------------------ reading, integrity and authenticity
  notRead: {
    title: "Document not read",
    checked: "Whether information could be extracted from this document.",
    notConfigured: "The document was stored and fingerprinted but not read, because AI extraction is not configured.",
    failed: (error: string | null) => `Extraction failed: ${error ?? "unknown error"}.`,
    why: "Facts in this document are not included in any check.",
    next: "Review the document manually, or retry extraction once AI is configured.",
  },
  unsupported: {
    title: "Extracted values need confirmation",
    checked: "Whether each extracted value is backed by a quote from the document and meets the confidence threshold.",
    result: (count: number, doc: string, fields: string[]) => `${plural(count, "value")} in ${doc} ${count === 1 ? "was" : "were"} excluded from the checks: ${fields.join(", ")}.`,
    why: "These values were not used, so related checks may be incomplete.",
    next: "Open the document, read the values yourself and record what you see in a note.",
  },
  integrity: {
    titleFields: (fields: string[]) => `Possible edit to the ${and(fields.map(fieldInline))}`,
    title: "Possible signs of document alteration",
    checked:
      "File checks (type, editing software, revision history), digital signatures, and checks on each value: text typed over other text, values in a font nothing else on the page uses, notes laid over values, and areas of a photo that look pasted in or retouched.",
    fields: (count: number, doc: string) => `${plural(count, "value")} in ${doc} show${count === 1 ? "s" : ""} possible signs of editing, so ${count === 1 ? "it is" : "they are"} not used by any check. `,
    indicators: (doc: string) => `Potential indicators were found in ${doc}. `,
    notProof: "These are not proof of tampering: some have harmless explanations, such as a re-saved scan or a corrected invoice.",
    why: "If a value was changed after the document was issued, any claim it seems to support is unproven.",
    next: "Ask for the original file directly from the issuer, or confirm the values with the issuer by phone or email.",
  },
  signature: {
    title: (filename: string) => `Digital signature · ${filename}`,
    checked: "Whether the PDF carries a cryptographic signature, whether the signed content is unchanged, and whether the signer's certificate is on VoltProof's trust list of known issuers.",
    why: "A valid signature from a known issuer proves the file is exactly what that issuer signed. A visible stamp or drawn signature does not.",
    broken: (signer: string | null) => `The signature${signer ? ` by ${signer}` : ""} does not match the document: the signed content was changed after signing.`,
    brokenNext: "Do not rely on this file. Get a fresh copy directly from the issuer.",
    verified: (trustedAs: string, date: string | null) =>
      `What was verified: the file is exactly what ${trustedAs} signed${date ? ` on ${date}` : ""}. The signing certificate is on the trust list. This verifies who issued the file and that it is unchanged, not that its contents are true.`,
    unconfirmed: (signer: string | null, reason: "added" | "untrusted") =>
      `The signed content is unchanged since ${signer ?? "the signer"} signed it, but ${reason === "added" ? "content was added after signing" : "the signing certificate is not on the trust list"}, so the issuer is not confirmed.`,
    untrustedNext: "Add the issuer's certificate to the trust list once you have confirmed it with them.",
    addedNext: "Ask the issuer for the signed original.",
    unchecked: "The signature could not be checked.",
    uncheckedNext: "Open the file in a PDF reader that validates signatures, or ask the issuer for the original.",
  },
  authenticity: {
    title: "Authenticity not verified",
    deniedTitle: "Issuer denied a document",
    confirmedTitle: "Authenticity confirmed with issuers",
    checked: "Whether each document has been confirmed with its issuer: by a valid digital signature from a certificate on the trust list, or by a person checking with the issuer or a registry.",
    why: "Consistent documents can still all be false. Only the issuer, or the issuer's signature, can confirm a document.",
    bySignature: (trustedAs: string) => `digital signature from ${trustedAs}`,
    byIssuer: (by: string, method: string, reference: string) => `confirmed with the issuer by ${by} (${method}${reference ? `, ref. ${reference}` : ""})`,
    denied: (docs: string[]) => `The issuer said it did not issue: ${docs.join("; ")}.`,
    deniedNext: "Treat the document as not genuine and ask the seller to explain.",
    confirmed: (how: string[]) => `Every document was confirmed with its issuer: ${how.join("; ")}.`,
    some: (confirmed: number, total: number, how: string[]) => `${plural(confirmed, "document")} of ${total} confirmed with the issuer (${how.join("; ")}). The others are not. `,
    noneConfirmed: "No document has been confirmed with its issuer. ",
    notProof: "Matching values, clean file checks and visible stamps or signatures do not prove a document is genuine.",
    next: "For high-value decisions, confirm the key documents with the issuing workshop, test provider or registry, and record it.",
  },

  // ------------------------------------------------------------ seller claims
  claim: {
    label: {
      soh: (percent: number | undefined) => `Battery health: ${percent}% claimed`,
      odometer: (reading: string) => `Mileage: ${reading} claimed`,
      damage: "Accident history: seller reports damage",
      noAccidents: "Accident history: seller says none",
      chargingWords: (text: string) => `Fast-charging history: “${text}”`,
      chargingMax: (percent: number | undefined) => `Fast-charging history: at most ${percent}% DC claimed`,
    },
    checked: (type: ClaimType, sourceText: string | null) => `Whether the documents on file support the seller's claim about ${claimTypeInline(type)}${sourceText ? ` (“${sourceText}”)` : ""}.`,
    why: {
      battery_soh: "The battery is most of what a used EV is worth, and the hardest part to check.",
      odometer: "Mileage drives value and wear. A true mileage higher than claimed changes what the car is worth and how a lender sees it.",
      accident_history: "Undisclosed accident damage affects safety, value and insurability.",
      fast_charging: "Frequent DC fast charging can speed up battery wear, so it bears on future battery health.",
    } satisfies Record<ClaimType, string>,
    /** A field's short name, for "The … on file.pdf shows signs of editing." */
    short: (name: string) =>
      ((
        {
          batterySohPercent: "battery health figure",
          vin: "VIN",
          batteryTestDate: "test date",
          odometer: "odometer reading",
          documentDate: "date",
          damageRepair: "repair record",
          serviceDetails: "service details",
          dcChargingSharePercent: "charging figure",
        } as Record<string, string>
      )[name] ?? name),
    tampered: {
      headline: (short: string, filename: string) => `The ${short} on ${filename} shows signs of editing.`,
      result: (message: string) => `${message} The value is not used, and the claim cannot rest on this document until the issuer confirms it.`,
      next: "Get the original directly from the issuer, or confirm the value with them, before relying on this claim.",
    },
    soh: {
      lowerHeadline: (soh: number, below: number) => `A battery report states ${soh}%, ${below} points below the claim.`,
      lowerResult: (source: string, soh: number, iso: string | null, claimed: number, tolerance: number) =>
        `${source} reported a state of health of ${soh}%${iso ? ` on ${iso}` : ""}. The seller claims ${claimed}%. The allowed difference is ${tolerance} points.`,
      lowerNext: "Ask the seller where the claimed figure comes from, and base the decision on the measured figure.",
      otherVinHeadline: (tail: string) => `The battery report offered names a different VIN (ending ${tail}).`,
      otherVinResult: (tail: string, caseTail: string, claimed: number) => `The only battery report provided is for VIN ending ${tail}, not this vehicle (ending ${caseTail}). It cannot support the ${claimed}% claim.`,
      otherVinNext: "Do not rely on this report. Arrange an independent battery test for this VIN.",
      verifiedHeadline: (days: number | null, soh: number) => `Matches a diagnostic readout from ${days} days before this review (${soh}%).`,
      verifiedResult: (source: string, soh: number, iso: string | null, maxDays: number, tolerance: number, claimed: number) =>
        `${source} reported ${soh}% on ${iso}, for this VIN. The report was obtained independently of the seller and is within the ${maxDays}-day limit, and the figure is within ${tolerance} points of the ${claimed}% claimed.`,
      signed: (trustedAs: string) => ` The report carries a valid digital signature from ${trustedAs}, so it is exactly what the provider issued.`,
      why: {
        noVin: "the report does not show this vehicle's VIN",
        seller: "the report came from the seller, not from an independent request",
        noDate: "the report has no usable test date",
        old: (days: number, maxDays: number) => `the test is ${days} days old, beyond the ${maxDays}-day limit`,
      },
      agreesHeadline: (soh: number, why: string) => `A battery report agrees (${soh}%), but ${why}.`,
      agreesResult: (source: string, soh: number, claimed: number, why: string) => `${source} reported ${soh}%, in line with the ${claimed}% claimed. It is not counted as verification because ${why}.`,
      agreesNext: "Order an independent battery test for this VIN to verify the figure.",
      noneHeadline: "No battery health report provided yet.",
      noneResult: (claimed: number) => `Nothing on file states this vehicle's battery state of health, so the ${claimed}% claim is not checked.`,
      noneNext: "Order an independent battery test for this VIN before making an offer.",
      noneMissing: (maxDays: number) => `A battery health report for this VIN from the last ${maxDays} days.`,
    },
    odometer: {
      aboveHeadline: (type: DocumentType, reading: string, iso: string) => `${m.labels.docType[type]} shows ${reading} on ${iso}, above the claim.`,
      aboveResult: (doc: string, reading: string, iso: string, more: string, claimed: string) =>
        `${doc} records ${reading} on ${iso}, which is ${more} more than the ${claimed} claimed. The car cannot have fewer kilometres now than it had then.`,
      aboveNext: "Read the odometer yourself and ask the seller to explain the difference.",
      dashboardHeadline: (reading: string, iso: string) => `The dashboard showed ${reading} on ${iso}, not the figure claimed.`,
      dashboardResult: (reading: string, iso: string, claimed: string, difference: string) => `Dealership staff recorded ${reading} on ${iso}. The seller claims ${claimed}, a difference of ${difference}.`,
      dashboardNext: "Correct the listing to the reading on the dashboard.",
      timelineHeadline: "The mileage records go down over time, so the claimed figure cannot be relied on.",
      verifiedHeadline: (iso: string) => `Matches the dashboard reading taken by dealership staff on ${iso}.`,
      verifiedResult: (iso: string, reading: string, tolerance: string, claimed: string) => `Dealership staff photographed the odometer on ${iso} showing ${reading}, within ${tolerance} of the ${claimed} claimed.`,
      inLineHeadline: (types: DocumentType[]) => `In line with ${types.length ? and(types.map(docTypeInline)) : "earlier"} records.`,
      inLineResult: (readings: number, latest: string, iso: string, claimed: string) =>
        `${readings} dated reading${readings === 1 ? "" : "s"}, the latest ${latest} on ${iso}, are at or below the ${claimed} claimed, and the timeline does not go backwards. No current reading by dealership staff yet, so this is not verification.`,
      inLineNext: "Photograph the dashboard odometer at inspection to verify the current reading.",
      noneHeadline: "No dated odometer records provided yet.",
      noneResult: (claimed: string) => `Nothing on file states the odometer, so the ${claimed} claim is not checked.`,
      noneNext: "Photograph the dashboard odometer and ask for dated service invoices.",
      noneMissing: "A dashboard photo taken at inspection, or dated service invoices showing the odometer.",
    },
    accident: {
      disclosedHeadline: (repair: string) => `Records show the repair the seller disclosed (${repair}).`,
      disclosedResult: (doc: string, repair: string) => `${doc} describes: “${repair}”. This agrees with the seller's disclosure.`,
      disclosedNext: "Check the quality of the repair at inspection.",
      noRecordHeadline: "The seller reports damage, but no repair record is on file.",
      noRecordResult: "No document describes the damage or its repair.",
      noRecordNext: "Ask the seller for the repair invoice or insurance claim.",
      noRecordMissing: "The repair invoice or insurance claim for the reported damage.",
      repairHeadline: (type: DocumentType, repairs: number) =>
        `${type === "insurance_or_repair_record" ? "An insurance record" : `A ${docTypeInline(type)}`} lists ${repairs === 1 ? "one damage repair" : `${repairs} damage repairs`}.`,
      repairResult: (doc: string, iso: string | null, repair: string) => `The seller says the car has had no accidents, but ${doc}${iso ? ` (${iso})` : ""} describes: “${repair}”.`,
      repairNext: "Ask the seller about the repair, get the repair invoice, and have the repaired area inspected.",
      cleanHeadline: (records: number, months: number) => `${records} records over ${months} months mention no damage repair.`,
      cleanResult: (records: number, first: string, last: string) =>
        `${records} dated service or repair records from ${first} to ${last} mention no collision, body or structural repair. Records only show work that was recorded, so this is not proof that no accident happened.`,
      cleanNext: "For a lending decision, ask for an insurance claims history for this VIN.",
      noneHeadline: "No insurance or repair history provided yet.",
      noneResult: (months: number) => `Fewer than ${months} months of service history are on file, and no insurance or repair record, so the claim is not checked.`,
      noneNext: "Ask the seller for an insurance claims history for this VIN.",
      noneMissing: "An insurance claims history or a repair history for this VIN.",
    },
    charging: {
      overHeadline: (share: number) => `A charging log shows ${share}% DC fast charging.`,
      overResult: (doc: string, share: number, max: number) => `${doc} states ${share}% DC fast charging. The claim allows about ${max}%.`,
      overNext: "Ask about charging habits and weigh the battery test result more heavily.",
      verifiedHeadline: (share: number) => `An independently obtained charging log shows ${share}% DC fast charging.`,
      verifiedResult: (doc: string, share: number, max: number) => `${doc} states ${share}% DC fast charging, in line with the claim (about ${max}% or less).`,
      sellerHeadline: (share: number) => `A seller-provided charging log agrees (${share}% DC).`,
      sellerResult: (doc: string, share: number) => `${doc} states ${share}% DC fast charging. It came from the seller, so it is not verification.`,
      sellerNext: "Request a charging export directly from the vehicle's app or the manufacturer.",
      noneHeadline: "No charging data provided yet.",
      noneResult: "Nothing on file states how the car was charged, so the claim is not checked.",
      noneNext: "Ask the seller for a charging history export from the vehicle's app.",
      noneMissing: "A charging history export from the vehicle's app or the manufacturer.",
    },
    /** "1 conflict to review before you pay. 2 claims backed by evidence, 1 still missing." */
    summary: (conflicts: number, backed: number, missing: number) => {
      const parts = [conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"} to review before you pay.` : "No conflicts found."];
      const tail: string[] = [];
      if (backed) tail.push(`${backed} claim${backed === 1 ? "" : "s"} backed by evidence`);
      if (missing) tail.push(`${missing} still missing`);
      if (tail.length) parts.push(tail.join(", ") + ".");
      return parts.join(" ");
    },
  },
};

export type RuleText = typeof en;
