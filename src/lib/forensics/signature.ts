// Cryptographic PDF signatures (PAdES / adbe.pkcs7.detached).
//
// A valid signature proves two things: the signed bytes have not changed since
// signing, and whoever held the signing key signed them. It only says *who*
// that was if the certificate is one we already trust, so signers are checked
// against a trust list of known issuer certificates. A visible stamp or a
// drawn signature on the page proves neither.
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import type { PdfSignatureCheck } from "../types";

pkijs.setEngine("node", new pkijs.CryptoEngine({ name: "node", crypto: webcrypto as unknown as Crypto }));

export interface TrustedSigner {
  name: string;
  /** SHA-256 of the DER certificate, lowercase hex. */
  sha256: string;
  note?: string;
}

let trustCache: TrustedSigner[] | null = null;

/** Trust list: TRUSTED_SIGNERS_FILE, or trust/trusted-signers.json in the app directory. */
export function trustedSigners(): TrustedSigner[] {
  if (trustCache) return trustCache;
  const file = process.env.TRUSTED_SIGNERS_FILE || path.join(process.cwd(), "trust", "trusted-signers.json");
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { signers?: TrustedSigner[] };
    trustCache = (parsed.signers ?? []).map((s) => ({ ...s, sha256: s.sha256.toLowerCase() }));
  } catch {
    trustCache = [];
  }
  return trustCache;
}

export function resetTrustCacheForTests() {
  trustCache = null;
}

const OID_CN = "2.5.4.3";
const OID_O = "2.5.4.10";
const OID_SIGNING_TIME = "1.2.840.113549.1.9.5";

function rdn(cert: pkijs.Certificate, oid: string): string | null {
  const t = cert.subject.typesAndValues.find((x) => x.type === oid);
  return t ? String(t.value.valueBlock.value) : null;
}

/** Finds every signature dictionary's /ByteRange in the file. */
export function findByteRanges(buf: Buffer): [number, number, number, number][] {
  const text = buf.toString("latin1");
  const out: [number, number, number, number][] = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g;
  for (let m; (m = re.exec(text)); ) out.push([Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);
  return out;
}

async function checkOne(buf: Buffer, [a, b, c, d]: [number, number, number, number]): Promise<PdfSignatureCheck> {
  const result: PdfSignatureCheck = { signer: null, organization: null, signedAt: null, integrity: "unverifiable", coversWholeFile: false, trustedAs: null, certificateSha256: null, detail: "" };
  if (a !== 0 || b <= 0 || c <= b || c + d > buf.length) {
    result.detail = "The signature's byte range does not fit this file, so the signed content cannot be located.";
    return result;
  }
  // Bytes after the signed range (beyond a trailing newline) were appended later.
  result.coversWholeFile = buf.length - (c + d) <= 2;
  // The gap must be exactly the <hex> signature. If it is not, the file was rewritten after signing.
  if (buf[b] !== 0x3c || buf[c - 1] !== 0x3e) {
    result.integrity = "invalid";
    result.detail = "The signature's byte range no longer lines up with the file: the document was rewritten after it was signed.";
    return result;
  }
  const hex = buf.subarray(b, c).toString("latin1").replace(/[<>\s]/g, "").replace(/(00)+$/, "");
  try {
    const der = Buffer.from(hex.length % 2 ? hex + "0" : hex, "hex");
    const asn = asn1js.fromBER(new Uint8Array(der).buffer);
    if (asn.offset === -1) throw new Error("not DER");
    const content = new pkijs.ContentInfo({ schema: asn.result });
    const signed = new pkijs.SignedData({ schema: content.content });
    const data = Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]);
    const verdict = await signed.verify({ signer: 0, data: new Uint8Array(data).buffer, checkChain: false, extendedMode: true });
    const cert = verdict.signerCertificate;
    if (cert) {
      result.signer = rdn(cert, OID_CN);
      result.organization = rdn(cert, OID_O);
      result.certificateSha256 = createHash("sha256").update(Buffer.from(cert.toSchema().toBER(false))).digest("hex");
    }
    const attr = signed.signerInfos[0]?.signedAttrs?.attributes.find((x) => x.type === OID_SIGNING_TIME);
    const time = attr?.values[0] as asn1js.UTCTime | asn1js.GeneralizedTime | undefined;
    if (time && "toDate" in time) result.signedAt = time.toDate().toISOString();
    result.integrity = verdict.signatureVerified ? "valid" : "invalid";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // pkijs reports a digest mismatch as an error object rather than a boolean.
    if (/digest|signature/i.test(msg) && !/not DER|Object's schema/i.test(msg)) result.integrity = "invalid";
    result.detail = result.integrity === "invalid" ? "" : `The signature could not be checked (${msg.slice(0, 120)}).`;
  }

  const certs = new Set([result.certificateSha256].filter(Boolean));
  const trusted = trustedSigners().find((t) => certs.has(t.sha256));
  result.trustedAs = trusted?.name ?? null;

  if (result.integrity === "valid") {
    result.detail = `The signed content is unchanged since ${result.signer ?? "the signer"} signed it${result.signedAt ? ` on ${result.signedAt.slice(0, 10)}` : ""}.`;
    result.detail += result.coversWholeFile ? "" : " Content was added to the file after signing, which the signature does not cover.";
    result.detail += trusted ? ` The signing certificate is on the trust list as “${trusted.name}”.` : " The signing certificate is not on the trust list, so who signed cannot be confirmed.";
  } else if (result.integrity === "invalid") {
    result.detail = "The signature does not match the document: the signed content was changed after signing.";
  }
  return result;
}

export async function checkPdfSignatures(buf: Buffer): Promise<PdfSignatureCheck[]> {
  const ranges = findByteRanges(buf);
  const out: PdfSignatureCheck[] = [];
  for (const r of ranges.slice(0, 5)) out.push(await checkOne(buf, r));
  return out;
}
