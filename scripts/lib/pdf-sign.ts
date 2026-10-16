// Signs PDFs for the synthetic samples and tests (adbe.pkcs7.detached, CMS via pkijs).
// Demo certificates are self-signed and exist only to exercise the verifier.
import { createHash, webcrypto } from "node:crypto";
import * as asn1js from "asn1js";
import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString } from "pdf-lib";
import * as pkijs from "pkijs";

const crypto = webcrypto as unknown as Crypto;
pkijs.setEngine("node", new pkijs.CryptoEngine({ name: "node", crypto }));

export interface DemoSigner {
  name: string;
  cert: pkijs.Certificate;
  privateKey: CryptoKey;
  sha256: string;
}

export async function createDemoSigner(commonName: string, organization: string): Promise<DemoSigner> {
  const alg = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  const keys = (await crypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: Math.floor(Math.random() * 1e9) });
  for (const target of [cert.issuer, cert.subject]) {
    target.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: commonName }) }));
    target.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: "2.5.4.10", value: new asn1js.Utf8String({ value: organization }) }));
  }
  cert.notBefore.value = new Date("2026-01-01T00:00:00Z");
  cert.notAfter.value = new Date("2028-01-01T00:00:00Z");
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, "SHA-256");
  const sha256 = createHash("sha256").update(Buffer.from(cert.toSchema().toBER(false))).digest("hex");
  return { name: commonName, cert, privateKey: keys.privateKey, sha256 };
}

const SIG_BYTES = 8192;
const PLACEHOLDER_RANGE = [0, 1111111111, 2222222222, 3333333333];

/** Adds a signature field to the PDF and signs every byte except the signature itself. */
export async function signPdf(pdfBytes: Uint8Array, signer: DemoSigner, signedAt: Date, reason = "Issued report"): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const ctx = doc.context;
  const page = doc.getPage(0);
  const sig = ctx.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: "adbe.pkcs7.detached",
    ByteRange: PDFArray.withContext(ctx),
    Contents: PDFHexString.of("0".repeat(SIG_BYTES * 2)),
    Reason: PDFString.of(reason),
    Name: PDFString.of(signer.name),
    M: PDFString.fromDate(signedAt),
  });
  const range = sig.get(PDFName.of("ByteRange")) as PDFArray;
  for (const n of PLACEHOLDER_RANGE) range.push(PDFNumber.of(n));
  const sigRef = ctx.register(sig);
  const widget = ctx.register(ctx.obj({ Type: "Annot", Subtype: "Widget", FT: "Sig", Rect: [0, 0, 0, 0], V: sigRef, T: PDFString.of("Signature1"), F: 4, P: page.ref }));
  page.node.set(PDFName.of("Annots"), ctx.obj([widget]));
  doc.catalog.set(PDFName.of("AcroForm"), ctx.obj({ SigFlags: 3, Fields: [widget] }));
  const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));

  const text = bytes.toString("latin1");
  const contentsAt = text.indexOf(`<${"0".repeat(SIG_BYTES * 2)}>`);
  const rangeText = `[ ${PLACEHOLDER_RANGE.join(" ")} ]`;
  const rangeAt = text.indexOf(rangeText);
  if (contentsAt < 0 || rangeAt < 0) throw new Error("signature placeholder not found");
  const end = contentsAt + SIG_BYTES * 2 + 2;
  const actual = `[0 ${contentsAt} ${end} ${bytes.length - end}]`.padEnd(rangeText.length, " ");
  bytes.write(actual, rangeAt, "latin1");

  const data = Buffer.concat([bytes.subarray(0, contentsAt), bytes.subarray(end)]);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const signed = new pkijs.SignedData({
    version: 1,
    encapContentInfo: new pkijs.EncapsulatedContentInfo({ eContentType: "1.2.840.113549.1.7.1" }),
    signerInfos: [new pkijs.SignerInfo({ version: 1, sid: new pkijs.IssuerAndSerialNumber({ issuer: signer.cert.issuer, serialNumber: signer.cert.serialNumber }) })],
    certificates: [signer.cert],
  });
  signed.signerInfos[0].signedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new pkijs.Attribute({ type: "1.2.840.113549.1.9.3", values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })] }),
      new pkijs.Attribute({ type: "1.2.840.113549.1.9.5", values: [new asn1js.UTCTime({ valueDate: signedAt })] }),
      new pkijs.Attribute({ type: "1.2.840.113549.1.9.4", values: [new asn1js.OctetString({ valueHex: digest })] }),
    ],
  });
  await signed.sign(signer.privateKey, 0, "SHA-256");
  const cms = new pkijs.ContentInfo({ contentType: "1.2.840.113549.1.7.2", content: signed.toSchema(true) });
  const der = Buffer.from(cms.toSchema().toBER(false));
  if (der.length > SIG_BYTES) throw new Error("signature too large for placeholder");
  bytes.write(der.toString("hex").padEnd(SIG_BYTES * 2, "0"), contentsAt + 1, "latin1");
  return bytes;
}
