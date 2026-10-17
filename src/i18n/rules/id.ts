// Bahasa Indonesia: the sentences the rules and the claim assessor write (same shape as en.ts).
// Values from documents (file names, quotes, dates, VINs) are inserted as they are.
import { id as m } from "../messages/id";
import type { ClaimType, DocumentType, Odometer } from "../../lib/types";
import type { RuleText } from "./en";

const n = (x: number) => x.toLocaleString("id-ID");
const pct = (x: number | undefined) => (x === undefined ? "?" : n(x));
const and = (items: string[]) => new Intl.ListFormat("id", { type: "conjunction" }).format(items);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const field = (name: string) => (m.labels.field as Record<string, string>)[name] ?? name;
const fieldInline = (name: string) => field(name).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase());
const docType = (t: DocumentType) => m.labels.docType[t];
const docTypeInline = (t: DocumentType) => m.labels.docType[t].toLowerCase();
const claimTypeInline = (t: ClaimType) => m.labels.claimType[t].toLowerCase();
const odo = (o: Odometer) => `${n(o.reading)} ${o.unit === "mi" ? "mil" : "km"}`;

/** Reasons VoltProof writes when it sets a read value aside; anything else is shown as written. */
const REASONS: [RegExp, (...m: string[]) => string][] = [
  [/^no supporting quote from the document$/, () => "tidak ada kutipan pendukung dari dokumen"],
  [/^not supported by a quote$/, () => "tidak didukung kutipan"],
  [/^confidence ([\d.]+) is below the ([\d.]+) threshold$/, (_, a, b) => `keyakinan ${a} di bawah ambang ${b}`],
  [/^state of health outside 0–100%$/, () => "kesehatan baterai di luar 0–100%"],
  [/^fast-charging share outside 0–100%$/, () => "porsi pengisian cepat di luar 0–100%"],
  [/^negative odometer reading$/, () => "angka odometer negatif"],
  [/^the quoted text was not found in the document$/, () => "teks yang dikutip tidak ditemukan dalam dokumen"],
  [/^possible edit found by a forensic check$/, () => "pemeriksaan forensik menemukan kemungkinan penyuntingan"],
  [/^a second, independent reader \(PaddleOCR\) read “([\s\S]*)”$/, (_, x) => `pembaca kedua yang independen (PaddleOCR) membaca “${x}”`],
];

const OUTCOME: Record<string, string> = { not_found: "tidak ditemukan", error: "galat", not_configured: "belum dikonfigurasi" };

export const id: RuleText = {
  // ------------------------------------------------------------ shared wording
  odo,
  km: (x: number) => `${n(Math.round(x))} km`,
  and,
  docType,
  docTypeInline,
  docLabel: (type: DocumentType | null, filename: string) => (type ? `${docType(type)} · ${filename}` : filename),
  field,
  fieldInline,
  claimTypeInline,
  reason: (raw: string) => {
    for (const [re, f] of REASONS) {
      const x = re.exec(raw);
      if (x) return f(...x);
    }
    return raw;
  },
  outcome: (code: string) => OUTCOME[code] ?? code,
  registerOutcome: (code: string) => OUTCOME[code] ?? code.replace("_", " "),
  verificationMethod: (code: string) => (m.labels.verificationMethod as Record<string, string>)[code]?.toLowerCase() ?? code.replace(/_/g, " "),
  documentIssue: {
    signature: "tanda tangan digitalnya tidak lagi cocok dengan isinya",
    forensic: "pemeriksaan forensik menemukan kemungkinan penyuntingan",
    fileChecks: "pemeriksaan file menemukan kemungkinan tanda perubahan",
    denied: "penerbit menyatakan tidak menerbitkan dokumen ini",
  },

  // ------------------------------------------------------------ evidence table
  ev: {
    caseRecord: "Catatan kasus (diisi penilai)",
    vin: "VIN",
    makeModel: "Merek / model",
    notUsed: (reason: string) => `Tidak digunakan: ${reason}`,
    unsupported: "tidak didukung kutipan",
    dated: (iso: string) => `Bertanggal ${iso}`,
    datedMiles: (iso: string, km: number) => `Bertanggal ${iso} (≈ ${n(Math.round(km))} km)`,
    noTimelineDate: "Tidak dimasukkan ke linimasa: dokumen tidak memiliki tanggal yang dapat dipakai.",
    noDate: "Tidak digunakan: dokumen tidak memiliki tanggal yang dapat dipakai",
    invalidDate: "Tanggal tidak valid",
    futureDate: "Tanggal di masa depan",
    beforeModelYear: "Lebih awal dari tahun model",
    daysBefore: (days: number) => `${n(days)} hari sebelum tanggal tinjauan`,
    noDamage: "Tidak menyebut perbaikan kerusakan",
    possibleEdit: "Pemeriksaan forensik menemukan kemungkinan penyuntingan",
    captured: (by: string) => `Diunggah oleh ${by}, ditandai sebagai diambil oleh staf diler`,
    file: "File",
    forensicCheck: "Pemeriksaan forensik",
    fileCheck: "Pemeriksaan file",
    signature: "Tanda tangan digital",
    unknownSigner: "Penanda tangan tidak diketahui",
    issuerVerification: "Verifikasi penerbit",
    notPerformed: "Belum dilakukan",
    issuerDenied: "Penerbit menyangkal menerbitkannya",
    vinDecode: "Dekode VIN",
    decoded: "berhasil didekode",
    lookedUp: (date: string, by: string) => `Dicari pada ${date} oleh ${by}`,
    registerRecords: "Catatan registri untuk awalan VIN",
    registerValue: (matches: string | null, models: string | null) => `${matches} × ${models}`,
    registerNote: (message: string, date: string, by: string) => `${message} Dicari pada ${date} oleh ${by}`,
  },

  // ------------------------------------------------------------ rule 1: VIN consistency
  vinConsistency: {
    title: "Konsistensi VIN",
    checked: "Apakah setiap dokumen yang mencantumkan VIN mengidentifikasi kendaraan yang sama dengan catatan kasus.",
    why: "Dokumen untuk kendaraan lain tidak dapat mendukung klaim tentang kendaraan ini. Ketidakcocokan juga bisa berasal dari salah ketik atau file yang tertukar.",
    none: "Tidak ada dokumen yang memuat VIN yang dapat dibaca.",
    noneNext: "Foto pelat VIN dan unggah dokumen registrasi kendaraan.",
    mismatch: (doc: string, tail: string) => `${doc} menunjukkan VIN berakhiran ${tail}`,
    conflict: (mismatches: string[], against: "case" | "document", tail: string) =>
      `${mismatches.join("; ")}, tetapi ${against === "case" ? "catatan kasus" : "dokumen pertama"} mencantumkan VIN berakhiran ${tail}.`,
    conflictNext: "Periksa VIN langsung pada kendaraan dan minta penjual menjelaskan mengapa dokumen menunjukkan VIN yang berbeda.",
    malformedNote: (count: number) => ` Catatan: ${n(count)} VIN tidak memiliki format standar 17 karakter.`,
    single: (doc: string) => `Hanya satu sumber (${doc}) yang menunjukkan VIN; tidak ada pembanding.`,
    singleNext: "Masukkan VIN dari pelat kendaraan ke catatan kasus.",
    consistent: (documents: number, withCase: boolean, tail: string) =>
      `${n(documents)} dokumen${withCase ? " dan catatan kasus" : ""} menunjukkan VIN yang sama (berakhiran ${tail}). Ini menunjukkan dokumen-dokumennya cocok; bukan bukti bahwa dokumen tersebut asli.`,
  },

  // ------------------------------------------------------------ rule 2: make and model
  vehicle: {
    title: "Konsistensi merek dan model",
    checked: "Apakah merek dan model pada setiap dokumen cocok dengan kendaraan di catatan kasus.",
    why: "Merek atau model yang berbeda menandakan dokumen itu milik kendaraan lain atau diisi dengan keliru.",
    makeProblem: (doc: string, value: string, expected: string) => `${doc} menyebut mereknya "${value}", bukan "${expected}"`,
    modelProblem: (doc: string, value: string, expected: string) => `${doc} menyebut modelnya "${value}", bukan "${expected}"`,
    trimNote: (value: string, expected: string) => `"${value}" dianggap sebagai varian (trim) dari "${expected}"`,
    conflict: (problems: string[]) => `${problems.join("; ")}.`,
    conflictNext: "Pastikan merek dan model pada kendaraan, lalu minta penjual menjelaskan dokumennya.",
    none: "Tidak ada dokumen yang mencantumkan merek atau model yang dapat dibaca.",
    noneNext: "Unggah dokumen registrasi kendaraan.",
    consistent: (notes: string[]) => `Setiap merek dan model yang tercantum cocok dengan catatan kasus.${notes.length ? ` ${notes.join("; ")}.` : ""}`,
  },

  // ------------------------------------------------------------ rule 3: mileage timeline
  mileage: {
    title: "Linimasa jarak tempuh",
    checked: "Apakah angka odometer bertambah seiring waktu, setelah mil dikonversi ke kilometer dan diurutkan menurut tanggal dokumen.",
    why: "Angka yang turun seiring waktu membuat riwayat jarak tempuh belum terjelaskan. Jarak tempuh sangat memengaruhi nilai dan kondisi kendaraan bekas.",
    one: "Hanya ada satu angka odometer bertanggal, jadi linimasa tidak dapat diperiksa.",
    none: "Tidak ada angka odometer bertanggal.",
    noneNext: "Minta penjual memberikan faktur servis bertanggal yang mencantumkan odometer.",
    drop: (d: { from: string; fromDate: string; fromDoc: string; to: string; toDate: string; toDoc: string; dropKm: number }) =>
      `${d.from} pada ${d.fromDate} (${d.fromDoc}) diikuti ${d.to} pada ${d.toDate} (${d.toDoc}), turun sekitar ${n(Math.round(d.dropKm))} km`,
    conflict: (drops: string[]) =>
      `Angka odometer menurun seiring waktu: ${drops.join("; ")}. Ini perlu diselidiki. Ini sendiri bukan bukti manipulasi. Kemungkinan penyebabnya antara lain penggantian panel instrumen, salah input pada faktur, atau odometer yang diputar mundur.`,
    conflictNext: "Minta penjual menjelaskan angka-angka tersebut dan memberikan catatan perbaikan atau penggantian panel instrumen. Periksa riwayat servis ke bengkel yang menerbitkan faktur.",
    consistent: (readings: number, first: string, last: string) =>
      `${n(readings)} angka bertanggal dari ${first} hingga ${last} terus bertambah. Ini menunjukkan dokumen-dokumennya cocok; bukan bukti bahwa angkanya akurat.`,
  },

  // ------------------------------------------------------------ rule 4: document dates
  dates: {
    title: "Tanggal dokumen",
    checked: "Apakah setiap tanggal dokumen merupakan tanggal kalender yang nyata, tidak lebih lambat dari tanggal tinjauan, dan tidak lebih awal dari tahun model kendaraan.",
    why: "Linimasa jarak tempuh dan usia laporan baterai bergantung pada tanggal yang benar. Tanggal yang mustahil atau di masa depan menandakan kesalahan atau dokumen yang diubah.",
    invalid: (doc: string, fieldName: string, problem: "format" | "calendar", value: string) =>
      `${doc}: ${fieldInline(fieldName)} "${value}" ${problem === "format" ? "tidak berformat YYYY-MM-DD" : "bukan tanggal kalender yang nyata"}`,
    future: (doc: string, iso: string, reviewDate: string) => `${doc} bertanggal ${iso}, setelah tinjauan ini dibuka (${reviewDate})`,
    beforeModelYear: (doc: string, iso: string, year: number) => `${doc} bertanggal ${iso}, sebelum tahun model ${year} kendaraan`,
    missingNote: (docs: string[]) => ` Tidak ada tanggal pada: ${docs.join("; ")}.`,
    conflict: (problems: string[]) => `${problems.join("; ")}.`,
    conflictNext: "Periksa tanggal pada dokumen asli dan minta penerbit atau penjual mengonfirmasinya.",
    none: "Tidak ditemukan tanggal dokumen yang dapat dipakai.",
    noneNext: "Minta penjual memberikan dokumen yang bertanggal.",
    consistent: (dates: number) => `${n(dates)} tanggal diperiksa; semuanya tanggal nyata dalam rentang yang wajar.`,
    undatedNext: "Minta versi bertanggal dari dokumen yang tidak bertanggal jika penting untuk keputusan.",
  },

  // ------------------------------------------------------------ rules 5 and 6: battery report VIN and age
  noBatteryReport: "Tidak ada laporan baterai yang diberikan.",
  arrangeTest: "Atur uji baterai independen.",
  batteryVin: {
    title: "VIN laporan baterai",
    checked: "Apakah laporan baterai mencantumkan VIN yang sama dengan catatan kasus.",
    why: "Laporan baterai untuk kendaraan lain tidak mengatakan apa pun tentang baterai kendaraan ini.",
    mismatch: (doc: string, tail: string, caseTail: string) => `${doc} mencantumkan VIN berakhiran ${tail}; VIN kasus berakhiran ${caseTail}`,
    conflict: (mismatches: string[]) => `${mismatches.join("; ")}.`,
    conflictNext: "Jangan mengandalkan laporan ini. Minta penyedia memastikan kendaraan mana yang diuji, atau atur uji independen baru.",
    noCaseVin: "Catatan kasus tidak memiliki VIN sebagai pembanding.",
    noCaseVinNext: "Masukkan VIN dari pelat kendaraan.",
    unreadable: "Laporan baterai tidak menunjukkan VIN yang dapat dibaca, jadi tidak dapat dikaitkan dengan kendaraan ini.",
    unreadableNext: "Minta penyedia uji laporan yang mencantumkan VIN.",
    consistent: (tail: string, unreadable: number) =>
      `Laporan baterai mencantumkan VIN kasus (berakhiran ${tail}).${unreadable ? ` ${n(unreadable)} laporan lain tidak memiliki VIN yang dapat dibaca.` : ""} Ini mengaitkan laporan dengan kendaraan di atas kertas; bukan konfirmasi laporan kepada penerbitnya.`,
  },
  batteryAge: {
    title: "Usia laporan baterai",
    checked: (maxDays: number, reviewDate: string) => `Apakah uji baterai dilakukan dalam ${n(maxDays)} hari sebelum tinjauan ini (${reviewDate}).`,
    why: "Kondisi baterai berubah seiring waktu dan pemakaian. Laporan lama mungkin tidak menggambarkan baterai saat ini.",
    noDate: "Laporan baterai tidak memiliki tanggal uji yang dapat dipakai.",
    noDateNext: "Tanyakan tanggal uji kepada penyedia, atau atur uji baru.",
    conflict: (iso: string, days: number, maxDays: number) => `Uji baterai terbaru (${iso}) dilakukan ${n(days)} hari sebelum tinjauan ini, melebihi batas ${n(maxDays)} hari.`,
    conflictNext: "Atur uji baterai independen yang baru.",
    consistent: (iso: string, days: number, maxDays: number) =>
      `Tanggal uji baterai yang tercantum di laporan (${iso}) adalah ${n(days)} hari sebelum tinjauan ini, masih dalam batas ${n(maxDays)} hari. Tanggal ini dibaca dari laporan, belum dikonfirmasi kepada penyedia.`,
  },

  // ------------------------------------------------------------ rule 7: VIN structure and decode
  vinStructure: {
    title: "Struktur dan dekode VIN",
    checked:
      "Apakah setiap VIN berformat benar (17 karakter, tanpa I/O/Q), memiliki digit pemeriksa yang valid bila digunakan, dan mengodekan produsen serta tahun model yang sama dengan catatan kasus; dan, jika dekoder referensi digunakan, apa hasilnya.",
    why: "VIN yang gagal dalam pemeriksaan ini salah ketik, salah baca, atau dikarang. VIN yang valid bukan bukti bahwa dokumennya asli: pemalsu menyalin VIN asli.",
    caseRecord: "catatan kasus",
    none: "Tidak ada VIN yang dapat diperiksa.",
    noneNext: "Masukkan VIN dari pelat kendaraan.",
    malformed: (where: string, vin: string) => `${where}: "${vin}" bukan VIN 17 karakter yang berformat benar`,
    checkDigit: (where: string, tail: string, found: string, expected: string) =>
      `${where}: VIN berakhiran ${tail} gagal dalam pemeriksaan digit pemeriksa (posisi 9 adalah "${found}", sedangkan karakter VIN lainnya mengharuskan "${expected}")`,
    checkDigitNote: (message: string) => `${message}. Sebagian produsen di luar Amerika Utara tidak memakai digit pemeriksa, jadi ini hanya dicatat, tidak ditandai`,
    maker: (where: string, prefix: string, maker: string, make: string) => `${where}: VIN berawalan ${prefix} terdaftar untuk ${maker}, bukan ${make}`,
    modelYear: (where: string, code: string, encoded: number | undefined, year: number) => `${where}: posisi 10 ("${code}") mengodekan tahun model ${encoded}, bukan ${year}`,
    decodeMake: (provider: string, decoded: string, make: string) => `${provider} mendekode VIN ini sebagai ${decoded}, bukan ${make}`,
    decodeYear: (provider: string, decoded: string, year: number) => `${provider} mendekode tahun model ${decoded}, bukan ${year}`,
    registerMake: (provider: string, prefix: string | null, makes: string | null, make: string) => `${provider} mencatat kendaraan dengan awalan VIN ${prefix} sebagai ${makes}, bukan ${make}`,
    registerModel: (provider: string, prefix: string | null, models: string | null, model: string) => `${provider} mencatat awalan VIN ${prefix} sebagai ${models}, bukan ${model}`,
    registerPower: (provider: string, prefix: string | null, powers: string) => `${provider} mencatat awalan VIN ${prefix} dengan tenaga penggerak ${powers}, bukan listrik`,
    registerVerified: (r: { provider: string; matches: string | null; prefix: string | null; years: string | null; make: string | null; model: string | null; power: string | null | undefined }) =>
      `${r.provider} mencatat ${r.matches} kendaraan dengan awalan VIN ${r.prefix}, semuanya konsisten dengan ${[r.make, r.model, r.years].filter(Boolean).join(" ")} (${r.power?.toLowerCase() ?? "—"}). Registri hanya memublikasikan 11 karakter pertama VIN, jadi ini memastikan merek, model, dan jenis tenaga dari awalan tersebut, bukan kendaraan individual ini`,
    conflict: (problems: string[]) =>
      `${problems.join("; ")}. Ini perlu dicocokkan dengan pelat pada kendaraan. Ini sendiri bukan bukti penipuan: satu karakter yang salah baca pun bisa menyebabkannya.`,
    conflictNext: "Baca VIN dari pelat kendaraan dan kaca depan, lalu bandingkan karakter demi karakter dengan dokumen.",
    notes: (notes: string[]) => ` Catatan: ${notes.join("; ")}.`,
    decodedAs: (provider: string, vehicle: string, electrification: string | null | undefined) =>
      `${provider} mendekode VIN ini sebagai ${vehicle}${electrification ? ` (${electrification})` : ""}, cocok dengan catatan kasus`,
    verified: (parts: string[]) => `Yang diverifikasi: ${parts.join(". ")}. Setiap VIN yang tercatat berformat benar. Ini tidak mengonfirmasi registrasi kendaraan ini, kepemilikannya, maupun riwayatnya.`,
    offline: (vins: number) => `${n(vins)} VIN diperiksa: formatnya valid, serta kode produsen dan tahun model cocok dengan catatan kasus.`,
    serviceMessage: (message: string) => ` ${message}`,
    decodeNotFound: (provider: string, message: string) =>
      ` ${provider} tidak dapat mengenali VIN ini: ${message} Cakupannya paling baik untuk kendaraan yang dijual di Amerika Utara, jadi hal ini umum untuk pasar lain, tetapi VIN-nya belum dikonfirmasi oleh sumber referensi.`,
    decodeIncomplete: (provider: string, message: string) => ` Pencarian di ${provider} tidak selesai: ${message}`,
    notFoundNext: "Bandingkan VIN pada pelat kendaraan dengan dokumen karakter demi karakter, atau periksa ke registri di pasar kendaraan tersebut.",
    incompleteNext: "Jalankan dekode VIN lagi.",
    caseOnly: " Tidak ada dokumen yang menunjukkan VIN dan belum ada pencarian VIN, jadi belum ada yang mengonfirmasinya.",
    caseOnlyNext: "Unggah dokumen registrasi kendaraan, atau cari VIN-nya.",
    noLookup: " Belum ada pencarian VIN.",
    noLookupNext: "Cari VIN di basis data VIN.",
  },

  // ------------------------------------------------------------ rule 8: registration number
  registration: {
    title: "Nomor polisi",
    checked: "Apakah setiap dokumen yang mencantumkan nomor polisi (pelat) menunjukkan nomor yang sama.",
    why: "Registri dicari berdasarkan pelat maupun VIN. Pelat yang berbeda pada satu dokumen menandakan dokumen itu milik kendaraan lain atau nomornya telah diganti.",
    none: "Tidak ada dokumen yang memuat nomor polisi yang dapat dibaca.",
    plateOn: (plate: string, doc: string) => `${plate} pada ${doc}`,
    conflict: (plates: string[]) => `Dokumen menunjukkan nomor polisi yang berbeda: ${plates.join("; ")}.`,
    conflictNext: "Periksa pelat pada kendaraan dan minta penjual menjelaskan nomor yang berbeda itu.",
    consistent: (documents: number, plate: string) => `${n(documents)} dokumen menunjukkan nomor polisi yang sama (${plate}). Ini menunjukkan dokumen-dokumennya cocok; bukan konfirmasi registrasi.`,
    single: (doc: string, plate: string) => `Hanya ${doc} yang menunjukkan nomor polisi (${plate}); tidak ada pembanding.`,
  },

  // ------------------------------------------------------------ evidence summaries
  batteryHealth: {
    title: "Bukti kesehatan baterai",
    checked: "Apakah tersedia laporan uji baterai untuk kendaraan ini, dan apa isinya.",
    why: "Kondisi baterai merupakan bagian besar dari nilai mobil listrik bekas dan dapat memengaruhi keputusan pembelian.",
    reported: (soh: number, provider: string | null) => `kesehatan baterai ${n(soh)}%, sebagaimana dilaporkan oleh ${provider ?? "penyedia yang tidak disebutkan"}`,
    none: "Kesehatan baterai belum terbukti: tidak ada laporan uji baterai yang diberikan.",
    noneNext: "Atur uji baterai independen sebelum mengajukan penawaran.",
    unreadable: "Laporan baterai sudah diberikan, tetapi angka kesehatan baterai (SOH) tidak dapat dibaca darinya.",
    unreadableNext: "Periksa laporannya secara manual atau atur uji baterai independen.",
    failed: (reported: string[], check: "vin" | "age") =>
      `Laporan menyatakan ${reported.join("; ")}, tetapi laporan gagal dalam pemeriksaan ${check === "vin" ? "VIN" : "usia"}, jadi tidak dapat diandalkan untuk kendaraan ini.`,
    unlinked: (reported: string[]) => `Laporan menyatakan ${reported.join("; ")}, tetapi tidak dapat dikaitkan dengan VIN kendaraan ini.`,
    unlinkedNext: "Minta penyedia laporan yang mencantumkan VIN.",
    consistent: (reported: string[]) =>
      `Laporan menyatakan ${reported.join("; ")}. Laporan mencantumkan VIN kendaraan ini dan masih baru. VoltProof menampilkan angka tersebut persis seperti yang dilaporkan. VoltProof tidak menguji baterai dan belum mengonfirmasi laporan kepada penerbitnya.`,
  },
  currentOdometer: {
    title: "Odometer saat ini",
    checked: "Apakah staf diler mencatat sendiri angka odometer saat ini (misalnya foto dasbor yang diambil saat inspeksi).",
    why: "Angka yang diambil oleh diler tidak bergantung pada dokumen dari penjual.",
    none: "Belum ada angka odometer yang diambil diler.",
    noneNext: "Foto odometer di dasbor saat inspeksi dan unggah sebagai diambil oleh staf diler.",
    verified: (date: string, reading: string) =>
      `Yang diverifikasi: staf diler memotret dasbor${date ? ` pada ${date}` : ""} dan angkanya ${reading}. Ini memverifikasi angka pada panel instrumen hari itu. Ini tidak memverifikasi riwayat jarak tempuh kendaraan.`,
  },

  // ------------------------------------------------------------ reading, integrity and authenticity
  notRead: {
    title: "Dokumen tidak dibaca",
    checked: "Apakah informasi dapat diekstrak dari dokumen ini.",
    notConfigured: "Dokumen disimpan dan diberi sidik jari, tetapi tidak dibaca karena ekstraksi AI belum dikonfigurasi.",
    failed: (error: string | null) => `Ekstraksi gagal: ${error ?? "galat tidak diketahui"}.`,
    why: "Fakta dalam dokumen ini tidak disertakan dalam pemeriksaan mana pun.",
    next: "Tinjau dokumen secara manual, atau coba ekstraksi lagi setelah AI dikonfigurasi.",
  },
  unsupported: {
    title: "Nilai yang diekstrak perlu dikonfirmasi",
    checked: "Apakah setiap nilai yang diekstrak didukung kutipan dari dokumen dan memenuhi ambang keyakinan.",
    result: (count: number, doc: string, fields: string[]) => `${n(count)} nilai di ${doc} dikecualikan dari pemeriksaan: ${fields.join(", ")}.`,
    why: "Nilai-nilai ini tidak digunakan, jadi pemeriksaan terkait mungkin tidak lengkap.",
    next: "Buka dokumennya, baca sendiri nilainya, lalu tuliskan apa yang Anda lihat dalam catatan.",
  },
  integrity: {
    titleFields: (fields: string[]) => `Kemungkinan penyuntingan pada ${and(fields.map(fieldInline))}`,
    title: "Kemungkinan tanda dokumen diubah",
    checked:
      "Pemeriksaan file (jenis, perangkat lunak penyunting, riwayat revisi), tanda tangan digital, dan pemeriksaan pada setiap nilai: teks yang diketik di atas teks lain, nilai dengan fon yang tidak dipakai di bagian lain halaman, catatan yang ditumpuk di atas nilai, dan area foto yang tampak ditempel atau diretus.",
    fields: (count: number, doc: string) => `${n(count)} nilai di ${doc} menunjukkan kemungkinan tanda penyuntingan, jadi tidak digunakan oleh pemeriksaan mana pun. `,
    indicators: (doc: string) => `Ditemukan indikator potensial di ${doc}. `,
    notProof: "Ini bukan bukti manipulasi: sebagian punya penjelasan yang wajar, seperti pindaian yang disimpan ulang atau faktur yang dikoreksi.",
    why: "Jika suatu nilai diubah setelah dokumen diterbitkan, klaim apa pun yang tampak didukungnya belum terbukti.",
    next: "Minta file asli langsung dari penerbit, atau konfirmasi nilainya kepada penerbit lewat telepon atau email.",
  },
  signature: {
    title: (filename: string) => `Tanda tangan digital · ${filename}`,
    checked: "Apakah PDF memiliki tanda tangan kriptografis, apakah konten yang ditandatangani tidak berubah, dan apakah sertifikat penanda tangan ada di daftar tepercaya penerbit yang dikenal VoltProof.",
    why: "Tanda tangan valid dari penerbit yang dikenal membuktikan file itu persis seperti yang ditandatangani penerbit. Stempel atau tanda tangan yang terlihat di halaman tidak membuktikannya.",
    broken: (signer: string | null) => `Tanda tangan${signer ? ` oleh ${signer}` : ""} tidak cocok dengan dokumen: konten yang ditandatangani diubah setelah penandatanganan.`,
    brokenNext: "Jangan mengandalkan file ini. Dapatkan salinan baru langsung dari penerbit.",
    verified: (trustedAs: string, date: string | null) =>
      `Yang diverifikasi: file ini persis seperti yang ditandatangani ${trustedAs}${date ? ` pada ${date}` : ""}. Sertifikat penanda tangan ada di daftar tepercaya. Ini memverifikasi siapa yang menerbitkan file dan bahwa file tidak berubah, bukan bahwa isinya benar.`,
    unconfirmed: (signer: string | null, reason: "added" | "untrusted") =>
      `Konten yang ditandatangani tidak berubah sejak ditandatangani ${signer ?? "penanda tangan"}, tetapi ${reason === "added" ? "ada konten yang ditambahkan setelah penandatanganan" : "sertifikat penanda tangan tidak ada di daftar tepercaya"}, jadi penerbitnya belum terkonfirmasi.`,
    untrustedNext: "Tambahkan sertifikat penerbit ke daftar tepercaya setelah Anda mengonfirmasinya kepada mereka.",
    addedNext: "Minta dokumen asli yang ditandatangani kepada penerbit.",
    unchecked: "Tanda tangan tidak dapat diperiksa.",
    uncheckedNext: "Buka file di pembaca PDF yang memvalidasi tanda tangan, atau minta dokumen asli kepada penerbit.",
  },
  authenticity: {
    title: "Keaslian belum diverifikasi",
    deniedTitle: "Penerbit menyangkal sebuah dokumen",
    confirmedTitle: "Keaslian dikonfirmasi kepada penerbit",
    checked:
      "Apakah setiap dokumen sudah dikonfirmasi kepada penerbitnya: melalui tanda tangan digital valid dari sertifikat di daftar tepercaya, atau oleh seseorang yang mengecek ke penerbit atau registri.",
    why: "Dokumen yang saling konsisten tetap bisa semuanya palsu. Hanya penerbit, atau tanda tangan penerbit, yang dapat mengonfirmasi sebuah dokumen.",
    bySignature: (trustedAs: string) => `tanda tangan digital dari ${trustedAs}`,
    byIssuer: (by: string, method: string, reference: string) => `dikonfirmasi kepada penerbit oleh ${by} (${method}${reference ? `, ref. ${reference}` : ""})`,
    denied: (docs: string[]) => `Penerbit menyatakan tidak menerbitkan: ${docs.join("; ")}.`,
    deniedNext: "Anggap dokumen tersebut tidak asli dan minta penjual menjelaskannya.",
    confirmed: (how: string[]) => `Setiap dokumen sudah dikonfirmasi kepada penerbitnya: ${how.join("; ")}.`,
    some: (confirmed: number, total: number, how: string[]) => `${n(confirmed)} dari ${n(total)} dokumen sudah dikonfirmasi kepada penerbit (${how.join("; ")}). Sisanya belum. `,
    noneConfirmed: "Belum ada dokumen yang dikonfirmasi kepada penerbitnya. ",
    notProof: "Nilai yang cocok, pemeriksaan file yang bersih, serta stempel atau tanda tangan yang terlihat tidak membuktikan bahwa dokumen itu asli.",
    next: "Untuk keputusan bernilai tinggi, konfirmasi dokumen utama kepada bengkel penerbit, penyedia uji, atau registri, lalu catat.",
  },

  // ------------------------------------------------------------ seller claims
  claim: {
    label: {
      soh: (percent: number | undefined) => `Kesehatan baterai: diklaim ${pct(percent)}%`,
      odometer: (reading: string) => `Jarak tempuh: diklaim ${reading}`,
      damage: "Riwayat kecelakaan: penjual melaporkan kerusakan",
      noAccidents: "Riwayat kecelakaan: menurut penjual tidak ada",
      chargingWords: (text: string) => `Riwayat pengisian cepat: “${text}”`,
      chargingMax: (percent: number | undefined) => `Riwayat pengisian cepat: diklaim maksimal ${pct(percent)}% DC`,
    },
    checked: (type: ClaimType, sourceText: string | null) => `Apakah dokumen yang ada mendukung klaim penjual tentang ${claimTypeInline(type)}${sourceText ? ` (“${sourceText}”)` : ""}.`,
    why: {
      battery_soh: "Baterai adalah bagian terbesar dari nilai mobil listrik bekas, dan bagian yang paling sulit diperiksa.",
      odometer: "Jarak tempuh menentukan nilai dan keausan. Jarak tempuh sebenarnya yang lebih tinggi dari klaim mengubah nilai mobil dan penilaian pemberi pembiayaan.",
      accident_history: "Kerusakan akibat kecelakaan yang tidak diungkapkan memengaruhi keselamatan, nilai, dan kelayakan asuransi.",
      fast_charging: "Pengisian cepat DC yang sering dapat mempercepat keausan baterai, sehingga berpengaruh pada kesehatan baterai di masa depan.",
    },
    short: (name: string) =>
      ((
        {
          batterySohPercent: "angka kesehatan baterai",
          vin: "VIN",
          batteryTestDate: "tanggal uji",
          odometer: "angka odometer",
          documentDate: "tanggal",
          damageRepair: "catatan perbaikan",
          serviceDetails: "rincian servis",
          dcChargingSharePercent: "angka pengisian daya",
        } as Record<string, string>
      )[name] ?? name),
    tampered: {
      headline: (short: string, filename: string) => `${cap(short)} pada ${filename} menunjukkan tanda penyuntingan.`,
      result: (message: string) => `Pemeriksaan forensik mencatat (dalam bahasa Inggris): ${message} Nilai ini tidak digunakan, dan klaim tidak dapat bergantung pada dokumen ini sampai penerbit mengonfirmasinya.`,
      next: "Dapatkan dokumen asli langsung dari penerbit, atau konfirmasi nilainya kepada mereka, sebelum mengandalkan klaim ini.",
    },
    soh: {
      lowerHeadline: (soh: number, below: number) => `Laporan baterai menyatakan ${n(soh)}%, ${n(below)} poin di bawah klaim.`,
      lowerResult: (source: string, soh: number, iso: string | null, claimed: number, tolerance: number) =>
        `${source} melaporkan kesehatan baterai ${n(soh)}%${iso ? ` pada ${iso}` : ""}. Penjual mengklaim ${n(claimed)}%. Selisih yang diperbolehkan adalah ${n(tolerance)} poin.`,
      lowerNext: "Tanyakan kepada penjual dari mana angka yang diklaim berasal, dan dasarkan keputusan pada angka hasil pengukuran.",
      otherVinHeadline: (tail: string) => `Laporan baterai yang diberikan mencantumkan VIN lain (berakhiran ${tail}).`,
      otherVinResult: (tail: string, caseTail: string, claimed: number) =>
        `Satu-satunya laporan baterai yang diberikan adalah untuk VIN berakhiran ${tail}, bukan kendaraan ini (berakhiran ${caseTail}). Laporan ini tidak dapat mendukung klaim ${n(claimed)}%.`,
      otherVinNext: "Jangan mengandalkan laporan ini. Atur uji baterai independen untuk VIN ini.",
      verifiedHeadline: (days: number | null, soh: number) => `Cocok dengan hasil diagnostik dari ${n(days ?? 0)} hari sebelum tinjauan ini (${n(soh)}%).`,
      verifiedResult: (source: string, soh: number, iso: string | null, maxDays: number, tolerance: number, claimed: number) =>
        `${source} melaporkan ${n(soh)}% pada ${iso}, untuk VIN ini. Laporan diperoleh secara independen dari penjual dan masih dalam batas ${n(maxDays)} hari, dan angkanya berada dalam ${n(tolerance)} poin dari klaim ${n(claimed)}%.`,
      signed: (trustedAs: string) => ` Laporan ini memiliki tanda tangan digital yang valid dari ${trustedAs}, jadi isinya persis seperti yang diterbitkan penyedia.`,
      why: {
        noVin: "laporan tidak menunjukkan VIN kendaraan ini",
        seller: "laporan berasal dari penjual, bukan dari permintaan independen",
        noDate: "laporan tidak memiliki tanggal uji yang dapat dipakai",
        old: (days: number, maxDays: number) => `uji dilakukan ${n(days)} hari lalu, melebihi batas ${n(maxDays)} hari`,
      },
      agreesHeadline: (soh: number, why: string) => `Laporan baterai sesuai (${n(soh)}%), tetapi ${why}.`,
      agreesResult: (source: string, soh: number, claimed: number, why: string) => `${source} melaporkan ${n(soh)}%, sejalan dengan klaim ${n(claimed)}%. Ini tidak dihitung sebagai verifikasi karena ${why}.`,
      agreesNext: "Pesan uji baterai independen untuk VIN ini guna memverifikasi angkanya.",
      noneHeadline: "Belum ada laporan kesehatan baterai.",
      noneResult: (claimed: number) => `Tidak ada dokumen yang menyebutkan kesehatan baterai kendaraan ini, jadi klaim ${n(claimed)}% belum diperiksa.`,
      noneNext: "Pesan uji baterai independen untuk VIN ini sebelum mengajukan penawaran.",
      noneMissing: (maxDays: number) => `Laporan kesehatan baterai untuk VIN ini dari ${n(maxDays)} hari terakhir.`,
    },
    odometer: {
      aboveHeadline: (type: DocumentType, reading: string, iso: string) => `${docType(type)} menunjukkan ${reading} pada ${iso}, di atas klaim.`,
      aboveResult: (doc: string, reading: string, iso: string, more: string, claimed: string) =>
        `${doc} mencatat ${reading} pada ${iso}, ${more} lebih banyak dari klaim ${claimed}. Jarak tempuh mobil tidak mungkin lebih sedikit sekarang dibandingkan saat itu.`,
      aboveNext: "Baca sendiri odometernya dan minta penjual menjelaskan selisihnya.",
      dashboardHeadline: (reading: string, iso: string) => `Dasbor menunjukkan ${reading} pada ${iso}, bukan angka yang diklaim.`,
      dashboardResult: (reading: string, iso: string, claimed: string, difference: string) => `Staf diler mencatat ${reading} pada ${iso}. Penjual mengklaim ${claimed}, selisih ${difference}.`,
      dashboardNext: "Koreksi iklan sesuai angka di dasbor.",
      timelineHeadline: "Catatan jarak tempuh menurun seiring waktu, jadi angka yang diklaim tidak dapat diandalkan.",
      verifiedHeadline: (iso: string) => `Cocok dengan angka dasbor yang diambil staf diler pada ${iso}.`,
      verifiedResult: (iso: string, reading: string, tolerance: string, claimed: string) =>
        `Staf diler memotret odometer pada ${iso} yang menunjukkan ${reading}, dalam selisih ${tolerance} dari klaim ${claimed}.`,
      inLineHeadline: (types: DocumentType[]) => `Sejalan dengan catatan ${types.length ? and(types.map(docTypeInline)) : "sebelumnya"}.`,
      inLineResult: (readings: number, latest: string, iso: string, claimed: string) =>
        `${n(readings)} angka bertanggal, yang terbaru ${latest} pada ${iso}, sama dengan atau di bawah klaim ${claimed}, dan linimasanya tidak mundur. Belum ada angka terkini dari staf diler, jadi ini bukan verifikasi.`,
      inLineNext: "Foto odometer di dasbor saat inspeksi untuk memverifikasi angka terkini.",
      noneHeadline: "Belum ada catatan odometer bertanggal.",
      noneResult: (claimed: string) => `Tidak ada dokumen yang menyebutkan odometer, jadi klaim ${claimed} belum diperiksa.`,
      noneNext: "Foto odometer di dasbor dan minta faktur servis bertanggal.",
      noneMissing: "Foto dasbor yang diambil saat inspeksi, atau faktur servis bertanggal yang mencantumkan odometer.",
    },
    accident: {
      disclosedHeadline: (repair: string) => `Catatan menunjukkan perbaikan yang diungkapkan penjual (${repair}).`,
      disclosedResult: (doc: string, repair: string) => `${doc} menyebutkan: “${repair}”. Ini sesuai dengan pengungkapan penjual.`,
      disclosedNext: "Periksa kualitas perbaikan saat inspeksi.",
      noRecordHeadline: "Penjual melaporkan kerusakan, tetapi belum ada catatan perbaikan.",
      noRecordResult: "Tidak ada dokumen yang menjelaskan kerusakan atau perbaikannya.",
      noRecordNext: "Minta faktur perbaikan atau klaim asuransi kepada penjual.",
      noRecordMissing: "Faktur perbaikan atau klaim asuransi untuk kerusakan yang dilaporkan.",
      repairHeadline: (type: DocumentType, repairs: number) =>
        `${type === "insurance_or_repair_record" ? "Catatan asuransi" : docType(type)} mencantumkan ${repairs === 1 ? "satu perbaikan kerusakan" : `${n(repairs)} perbaikan kerusakan`}.`,
      repairResult: (doc: string, iso: string | null, repair: string) =>
        `Penjual mengatakan mobil ini tidak pernah mengalami kecelakaan, tetapi ${doc}${iso ? ` (${iso})` : ""} menyebutkan: “${repair}”.`,
      repairNext: "Tanyakan perbaikan itu kepada penjual, minta faktur perbaikannya, dan periksakan area yang diperbaiki.",
      cleanHeadline: (records: number, months: number) => `${n(records)} catatan selama ${n(months)} bulan tidak menyebut perbaikan kerusakan.`,
      cleanResult: (records: number, first: string, last: string) =>
        `${n(records)} catatan servis atau perbaikan bertanggal dari ${first} hingga ${last} tidak menyebut perbaikan tabrakan, bodi, atau struktur. Catatan hanya menunjukkan pekerjaan yang tercatat, jadi ini bukan bukti bahwa tidak pernah terjadi kecelakaan.`,
      cleanNext: "Untuk keputusan pembiayaan, minta riwayat klaim asuransi untuk VIN ini.",
      noneHeadline: "Belum ada riwayat asuransi atau perbaikan.",
      noneResult: (months: number) => `Riwayat servis yang ada kurang dari ${n(months)} bulan, dan tidak ada catatan asuransi atau perbaikan, jadi klaim ini belum diperiksa.`,
      noneNext: "Minta riwayat klaim asuransi untuk VIN ini kepada penjual.",
      noneMissing: "Riwayat klaim asuransi atau riwayat perbaikan untuk VIN ini.",
    },
    charging: {
      overHeadline: (share: number) => `Log pengisian daya menunjukkan ${n(share)}% pengisian cepat DC.`,
      overResult: (doc: string, share: number, max: number) => `${doc} menyatakan ${n(share)}% pengisian cepat DC. Klaimnya memperbolehkan sekitar ${n(max)}%.`,
      overNext: "Tanyakan kebiasaan pengisian daya dan beri bobot lebih pada hasil uji baterai.",
      verifiedHeadline: (share: number) => `Log pengisian daya yang diperoleh secara independen menunjukkan ${n(share)}% pengisian cepat DC.`,
      verifiedResult: (doc: string, share: number, max: number) => `${doc} menyatakan ${n(share)}% pengisian cepat DC, sejalan dengan klaim (sekitar ${n(max)}% atau kurang).`,
      sellerHeadline: (share: number) => `Log pengisian daya dari penjual sesuai (${n(share)}% DC).`,
      sellerResult: (doc: string, share: number) => `${doc} menyatakan ${n(share)}% pengisian cepat DC. Log ini berasal dari penjual, jadi bukan verifikasi.`,
      sellerNext: "Minta ekspor data pengisian daya langsung dari aplikasi kendaraan atau dari pabrikan.",
      noneHeadline: "Belum ada data pengisian daya.",
      noneResult: "Tidak ada dokumen yang menyebutkan cara mobil diisi dayanya, jadi klaim ini belum diperiksa.",
      noneNext: "Minta penjual mengekspor riwayat pengisian daya dari aplikasi kendaraan.",
      noneMissing: "Ekspor riwayat pengisian daya dari aplikasi kendaraan atau dari pabrikan.",
    },
    summary: (conflicts: number, backed: number, missing: number) => {
      const parts = [conflicts ? `${n(conflicts)} konflik perlu ditinjau sebelum Anda membayar.` : "Tidak ditemukan konflik."];
      if (backed && missing) parts.push(`${n(backed)} klaim didukung bukti, ${n(missing)} masih belum ada buktinya.`);
      else if (backed) parts.push(`${n(backed)} klaim didukung bukti.`);
      else if (missing) parts.push(`${n(missing)} klaim masih belum ada buktinya.`);
      return parts.join(" ");
    },
  },
};
