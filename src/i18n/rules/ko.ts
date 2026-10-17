// 한국어: the sentences the rules and the claim assessor write (same shape as en.ts).
// Values from documents (file names, quotes, dates, VINs) are inserted as they are, so sentences
// avoid particles whose form depends on the value before them (이/가, 을/를, 은/는).
import { ko as m } from "../messages/ko";
import type { ClaimType, DocumentType, Odometer } from "../../lib/types";
import type { RuleText } from "./en";

const n = (x: number) => x.toLocaleString("ko-KR");
const pct = (x: number | undefined) => (x === undefined ? "?" : n(x));
const and = (items: string[]) => new Intl.ListFormat("ko", { type: "conjunction" }).format(items);
const field = (name: string) => (m.labels.field as Record<string, string>)[name] ?? name;
const docType = (t: DocumentType) => m.labels.docType[t];
/** "48,200km" or "30,000마일". Both read naturally before "로". */
const odo = (o: Odometer) => `${n(o.reading)}${o.unit === "mi" ? "마일" : "km"}`;
/** The quoting particle after a reading: "48,200km라고", "30,000마일이라고". */
const rago = (reading: string) => `${reading}${reading.endsWith("마일") ? "이라고" : "라고"}`;
/** "48,200km라는", "30,000마일이라는". */
const raneun = (reading: string) => `${reading}${reading.endsWith("마일") ? "이라는" : "라는"}`;

/** Reasons VoltProof writes when it sets a read value aside; anything else is shown as written. */
const REASONS: [RegExp, (...m: string[]) => string][] = [
  [/^no supporting quote from the document$/, () => "서류에서 뒷받침하는 인용문이 없음"],
  [/^not supported by a quote$/, () => "인용문으로 뒷받침되지 않음"],
  [/^confidence ([\d.]+) is below the ([\d.]+) threshold$/, (_, a, b) => `신뢰도 ${a}, 기준값 ${b} 미만`],
  [/^state of health outside 0–100%$/, () => "배터리 상태 값이 0–100% 범위를 벗어남"],
  [/^fast-charging share outside 0–100%$/, () => "급속 충전 비율이 0–100% 범위를 벗어남"],
  [/^negative odometer reading$/, () => "주행거리계 값이 음수임"],
  [/^the quoted text was not found in the document$/, () => "인용한 텍스트를 서류에서 찾지 못함"],
  [/^possible edit found by a forensic check$/, () => "포렌식 검사에서 편집 가능성 발견"],
  [/^a second, independent reader \(PaddleOCR\) read “([\s\S]*)”$/, (_, x) => `독립된 두 번째 판독(PaddleOCR) 결과: “${x}”`],
];

const OUTCOME: Record<string, string> = { not_found: "찾을 수 없음", error: "오류", not_configured: "미설정" };

export const ko: RuleText = {
  // ------------------------------------------------------------ shared wording
  odo,
  km: (x: number) => `${n(Math.round(x))}km`,
  and,
  docType,
  docTypeInline: docType,
  docLabel: (type: DocumentType | null, filename: string) => (type ? `${docType(type)} · ${filename}` : filename),
  field,
  fieldInline: field,
  claimTypeInline: (t: ClaimType) => m.labels.claimType[t],
  reason: (raw: string) => {
    for (const [re, f] of REASONS) {
      const x = re.exec(raw);
      if (x) return f(...x);
    }
    return raw;
  },
  outcome: (code: string) => OUTCOME[code] ?? code,
  registerOutcome: (code: string) => OUTCOME[code] ?? code.replace("_", " "),
  verificationMethod: (code: string) => (m.labels.verificationMethod as Record<string, string>)[code] ?? code.replace(/_/g, " "),
  documentIssue: {
    signature: "디지털 서명이 내용과 더 이상 일치하지 않음",
    forensic: "포렌식 검사에서 편집 가능성이 발견됨",
    fileChecks: "파일 검사에서 변조 가능성 징후가 발견됨",
    denied: "발행처가 이 서류를 발행하지 않았다고 답함",
  },

  // ------------------------------------------------------------ evidence table
  ev: {
    caseRecord: "케이스 기록(평가 담당자 입력)",
    vin: "VIN",
    makeModel: "제조사 / 모델",
    notUsed: (reason: string) => `사용 안 함: ${reason}`,
    unsupported: "인용문으로 뒷받침되지 않음",
    dated: (iso: string) => `날짜 ${iso}`,
    datedMiles: (iso: string, km: number) => `날짜 ${iso} (≈ ${n(Math.round(km))}km)`,
    noTimelineDate: "타임라인에 넣지 않음: 서류에 사용할 수 있는 날짜가 없습니다.",
    noDate: "사용 안 함: 서류에 사용할 수 있는 날짜가 없음",
    invalidDate: "잘못된 날짜",
    futureDate: "미래 날짜",
    beforeModelYear: "연식보다 이른 날짜",
    daysBefore: (days: number) => `검토일 ${n(days)}일 전`,
    noDamage: "손상 수리 언급 없음",
    possibleEdit: "포렌식 검사에서 편집 가능성 발견",
    captured: (by: string) => `${by} 업로드, 딜러 직원이 직접 촬영한 것으로 표시됨`,
    file: "파일",
    forensicCheck: "포렌식 검사",
    fileCheck: "파일 검사",
    signature: "디지털 서명",
    unknownSigner: "알 수 없는 서명자",
    issuerVerification: "발행처 확인",
    notPerformed: "확인 안 함",
    issuerDenied: "발행처가 발행 사실을 부인함",
    vinDecode: "VIN 디코딩",
    decoded: "디코딩됨",
    lookedUp: (date: string, by: string) => `${date}에 ${by} 조회`,
    registerRecords: "VIN 앞자리 등록 기록",
    registerValue: (matches: string | null, models: string | null) => `${matches} × ${models}`,
    registerNote: (message: string, date: string, by: string) => `${message} ${date}에 ${by} 조회`,
  },

  // ------------------------------------------------------------ rule 1: VIN consistency
  vinConsistency: {
    title: "VIN 일치 여부",
    checked: "VIN이 적힌 모든 서류가 케이스 기록과 같은 차량을 가리키는지.",
    why: "다른 차량의 서류로는 이 차량에 대한 주장을 뒷받침할 수 없습니다. 불일치는 오타나 파일 혼동 때문일 수도 있습니다.",
    none: "읽을 수 있는 VIN이 적힌 서류가 없습니다.",
    noneNext: "VIN 표시판을 촬영하고 자동차등록증을 업로드하세요.",
    mismatch: (doc: string, tail: string) => `${doc}: VIN 끝자리 ${tail}`,
    conflict: (mismatches: string[], against: "case" | "document", tail: string) =>
      `${mismatches.join("; ")}. 그러나 ${against === "case" ? "케이스 기록" : "첫 번째 서류"}의 VIN 끝자리는 ${tail}입니다.`,
    conflictNext: "차량에서 VIN을 직접 확인하고, 서류의 VIN이 다른 이유를 판매자에게 물어보세요.",
    malformedNote: (count: number) => ` 참고: VIN ${n(count)}개가 표준 17자리 형식이 아닙니다.`,
    single: (doc: string) => `VIN이 적힌 출처가 하나뿐이라(${doc}) 비교할 대상이 없습니다.`,
    singleNext: "차량 표시판의 VIN을 케이스 기록에 입력하세요.",
    consistent: (documents: number, withCase: boolean, tail: string) =>
      `서류 ${n(documents)}건${withCase ? "과 케이스 기록" : ""}의 VIN이 같습니다(끝자리 ${tail}). 서류끼리 일치한다는 뜻이며, 서류가 진본임을 입증하지는 않습니다.`,
  },

  // ------------------------------------------------------------ rule 2: make and model
  vehicle: {
    title: "제조사·모델 일치 여부",
    checked: "각 서류의 제조사와 모델이 케이스 기록의 차량과 같은지.",
    why: "제조사나 모델이 다르면 서류가 다른 차량의 것이거나 잘못 작성되었을 수 있습니다.",
    makeProblem: (doc: string, value: string, expected: string) => `${doc}의 제조사가 케이스 기록("${expected}")과 다름: "${value}"`,
    modelProblem: (doc: string, value: string, expected: string) => `${doc}의 모델이 케이스 기록("${expected}")과 다름: "${value}"`,
    trimNote: (value: string, expected: string) => `"${value}"은(는) "${expected}"의 세부 트림으로 간주함`,
    conflict: (problems: string[]) => `${problems.join("; ")}.`,
    conflictNext: "차량의 제조사와 모델을 확인하고, 서류에 대해 판매자에게 설명을 요청하세요.",
    none: "읽을 수 있는 제조사나 모델이 적힌 서류가 없습니다.",
    noneNext: "자동차등록증을 업로드하세요.",
    consistent: (notes: string[]) => `서류에 적힌 제조사와 모델이 모두 케이스 기록과 일치합니다.${notes.length ? ` ${notes.join("; ")}.` : ""}`,
  },

  // ------------------------------------------------------------ rule 3: mileage timeline
  mileage: {
    title: "주행거리 타임라인",
    checked: "마일을 킬로미터로 환산하고 서류 날짜순으로 정렬했을 때 주행거리계 값이 시간이 지나며 늘어나는지.",
    why: "시간이 지나며 값이 줄어들면 주행거리 이력을 설명할 수 없습니다. 주행거리는 중고차의 가치와 상태에 큰 영향을 줍니다.",
    one: "날짜가 있는 주행거리계 기록이 하나뿐이라 타임라인을 확인할 수 없습니다.",
    none: "날짜가 있는 주행거리계 기록이 없습니다.",
    noneNext: "주행거리계 값이 적힌 날짜 있는 정비 명세서를 판매자에게 요청하세요.",
    drop: (d: { from: string; fromDate: string; fromDoc: string; to: string; toDate: string; toDoc: string; dropKm: number }) =>
      `${d.fromDate} ${d.from}(${d.fromDoc}) → ${d.toDate} ${d.to}(${d.toDoc}), 약 ${n(Math.round(d.dropKm))}km 감소`,
    conflict: (drops: string[]) =>
      `주행거리계 값이 시간이 지나며 줄어듭니다: ${drops.join("; ")}. 조사가 필요합니다. 이것만으로 조작의 증거가 되지는 않습니다. 계기판 교체, 명세서 입력 오류, 주행거리 조작 등이 원인일 수 있습니다.`,
    conflictNext: "판매자에게 값의 차이를 설명하고 계기판 수리·교체 기록을 제출해 달라고 요청하세요. 명세서를 발행한 정비소에 정비 이력을 확인하세요.",
    consistent: (readings: number, first: string, last: string) =>
      `${first}부터 ${last}까지 날짜가 있는 기록 ${n(readings)}건의 값이 시간순으로 늘어납니다. 서류끼리 일치한다는 뜻이며, 값이 정확하다는 증거는 아닙니다.`,
  },

  // ------------------------------------------------------------ rule 4: document dates
  dates: {
    title: "서류 날짜",
    checked: "각 서류 날짜가 실제 존재하는 날짜인지, 검토일보다 늦지 않은지, 차량 연식보다 이르지 않은지.",
    why: "주행거리 타임라인과 배터리 보고서의 경과 기간은 날짜가 정확해야 판단할 수 있습니다. 불가능하거나 미래인 날짜는 오류나 변조된 서류를 의미할 수 있습니다.",
    invalid: (doc: string, fieldName: string, problem: "format" | "calendar", value: string) =>
      `${doc}: ${field(fieldName)} "${value}"은(는) ${problem === "format" ? "YYYY-MM-DD 형식이 아님" : "실제 존재하지 않는 날짜임"}`,
    future: (doc: string, iso: string, reviewDate: string) => `${doc}의 날짜(${iso})가 이 검토를 시작한 날(${reviewDate})보다 늦음`,
    beforeModelYear: (doc: string, iso: string, year: number) => `${doc}의 날짜(${iso})가 차량 연식(${year}년)보다 이름`,
    missingNote: (docs: string[]) => ` 날짜가 없는 서류: ${docs.join("; ")}.`,
    conflict: (problems: string[]) => `${problems.join("; ")}.`,
    conflictNext: "원본 서류의 날짜를 확인하고 발행처나 판매자에게 확인을 요청하세요.",
    none: "사용할 수 있는 서류 날짜가 없습니다.",
    noneNext: "날짜가 있는 서류를 판매자에게 요청하세요.",
    consistent: (dates: number) => `날짜 ${n(dates)}건을 확인했으며 모두 예상 범위 안의 실제 날짜입니다.`,
    undatedNext: "결정에 중요하다면 날짜가 없는 서류의 날짜 있는 버전을 요청하세요.",
  },

  // ------------------------------------------------------------ rules 5 and 6: battery report VIN and age
  noBatteryReport: "배터리 보고서가 제출되지 않았습니다.",
  arrangeTest: "독립적인 배터리 검사를 의뢰하세요.",
  batteryVin: {
    title: "배터리 보고서 VIN",
    checked: "배터리 보고서에 케이스 기록과 같은 VIN이 적혀 있는지.",
    why: "다른 차량의 배터리 보고서로는 이 차량의 배터리에 대해 알 수 없습니다.",
    mismatch: (doc: string, tail: string, caseTail: string) => `${doc}의 VIN 끝자리 ${tail}, 케이스 VIN 끝자리 ${caseTail}`,
    conflict: (mismatches: string[]) => `${mismatches.join("; ")}.`,
    conflictNext: "이 보고서를 신뢰하지 마세요. 어떤 차량을 검사했는지 업체에 확인하거나 새로 독립 검사를 의뢰하세요.",
    noCaseVin: "케이스 기록에 비교할 VIN이 없습니다.",
    noCaseVinNext: "차량 표시판의 VIN을 입력하세요.",
    unreadable: "배터리 보고서에 읽을 수 있는 VIN이 없어 이 차량과 연결할 수 없습니다.",
    unreadableNext: "VIN이 적힌 보고서를 검사 업체에 요청하세요.",
    consistent: (tail: string, unreadable: number) =>
      `배터리 보고서에 케이스 VIN(끝자리 ${tail})이 적혀 있습니다.${unreadable ? ` 다른 보고서 ${n(unreadable)}건에는 읽을 수 있는 VIN이 없었습니다.` : ""} 서류상으로 보고서를 이 차량과 연결할 뿐, 발행처에 보고서를 확인한 것은 아닙니다.`,
  },
  batteryAge: {
    title: "배터리 보고서 경과 기간",
    checked: (maxDays: number, reviewDate: string) => `배터리 검사가 이 검토(${reviewDate}) 전 ${n(maxDays)}일 이내에 이루어졌는지.`,
    why: "배터리 상태는 시간과 사용에 따라 변합니다. 오래된 보고서는 지금의 배터리를 반영하지 못할 수 있습니다.",
    noDate: "배터리 보고서에 사용할 수 있는 검사일이 없습니다.",
    noDateNext: "업체에 검사일을 확인하거나 새로 검사를 의뢰하세요.",
    conflict: (iso: string, days: number, maxDays: number) => `가장 최근 배터리 검사(${iso})는 이 검토 ${n(days)}일 전으로, 기준인 ${n(maxDays)}일을 넘었습니다.`,
    conflictNext: "새로 독립적인 배터리 검사를 의뢰하세요.",
    consistent: (iso: string, days: number, maxDays: number) =>
      `보고서에 적힌 배터리 검사일(${iso})은 이 검토 ${n(days)}일 전으로, 기준인 ${n(maxDays)}일 이내입니다. 이 날짜는 보고서에서 읽은 것이며 업체에 확인하지는 않았습니다.`,
  },

  // ------------------------------------------------------------ rule 7: VIN structure and decode
  vinStructure: {
    title: "VIN 구조 및 디코딩",
    checked: "각 VIN이 올바른 형식(17자리, I/O/Q 없음)인지, 체크 디지트를 쓰는 경우 올바른지, 케이스 기록과 같은 제조사와 연식을 나타내는지, 그리고 참조 디코더를 조회했다면 그 결과는 무엇인지.",
    why: "이 검사에 실패한 VIN은 잘못 입력되었거나, 잘못 읽혔거나, 지어낸 것입니다. 올바른 VIN이라고 해서 서류가 진본이라는 증거는 아닙니다. 위조범은 실제 VIN을 베낍니다.",
    caseRecord: "케이스 기록",
    none: "확인할 VIN이 없습니다.",
    noneNext: "차량 표시판의 VIN을 입력하세요.",
    malformed: (where: string, vin: string) => `${where}: "${vin}"은(는) 올바른 17자리 VIN이 아님`,
    checkDigit: (where: string, tail: string, found: string, expected: string) =>
      `${where}: 끝자리 ${tail}인 VIN의 체크 디지트가 맞지 않음(9번째 자리: "${found}", 나머지 문자로 계산한 값: "${expected}")`,
    checkDigitNote: (message: string) => `${message}. 북미 외 일부 제조사는 체크 디지트를 쓰지 않으므로 문제로 표시하지 않고 참고로만 남김`,
    maker: (where: string, prefix: string, maker: string, make: string) => `${where}: VIN 앞자리 ${prefix}의 제조사는 ${maker}(케이스 기록: ${make})`,
    modelYear: (where: string, code: string, encoded: number | undefined, year: number) => `${where}: 10번째 자리("${code}")가 나타내는 연식은 ${encoded}년(케이스 기록: ${year}년)`,
    decodeMake: (provider: string, decoded: string, make: string) => `${provider} 디코딩 결과 제조사는 ${decoded}(케이스 기록: ${make})`,
    decodeYear: (provider: string, decoded: string, year: number) => `${provider} 디코딩 결과 연식은 ${decoded}년(케이스 기록: ${year}년)`,
    registerMake: (provider: string, prefix: string | null, makes: string | null, make: string) => `${provider}에 기록된 VIN 앞자리 ${prefix} 차량의 제조사는 ${makes}(케이스 기록: ${make})`,
    registerModel: (provider: string, prefix: string | null, models: string | null, model: string) => `${provider}에 기록된 VIN 앞자리 ${prefix} 차량의 모델은 ${models}(케이스 기록: ${model})`,
    registerPower: (provider: string, prefix: string | null, powers: string) => `${provider}에 기록된 VIN 앞자리 ${prefix} 차량의 동력원은 전기가 아닌 ${powers}`,
    registerVerified: (r: { provider: string; matches: string | null; prefix: string | null; years: string | null; make: string | null; model: string | null; power: string | null | undefined }) =>
      `${r.provider}에 VIN 앞자리 ${r.prefix} 차량 ${r.matches}대가 기록되어 있으며, 모두 ${[r.years, r.make, r.model].filter(Boolean).join(" ")}(${r.power?.toLowerCase() ?? "—"})에 해당함. 등록부는 VIN의 앞 11자리만 공개하므로, 이 앞자리에 해당하는 제조사·모델·동력원을 확인할 뿐 이 차량 자체를 확인하지는 않음`,
    conflict: (problems: string[]) => `${problems.join("; ")}. 차량의 표시판과 대조해야 합니다. 이것만으로 사기의 증거가 되지는 않습니다. 한 글자만 잘못 읽어도 이렇게 될 수 있습니다.`,
    conflictNext: "차량 표시판과 앞유리에서 VIN을 읽고 서류와 한 글자씩 비교하세요.",
    notes: (notes: string[]) => ` 참고: ${notes.join("; ")}.`,
    decodedAs: (provider: string, vehicle: string, electrification: string | null | undefined) =>
      `${provider} 디코딩 결과: ${vehicle}${electrification ? ` (${electrification})` : ""}, 케이스 기록과 일치`,
    verified: (parts: string[]) => `검증된 내용: ${parts.join(". ")}. 기록된 모든 VIN의 형식이 올바릅니다. 이 차량의 등록, 소유권, 이력을 확인한 것은 아닙니다.`,
    offline: (vins: number) => `VIN ${n(vins)}개 확인: 형식이 올바르고 제조사 코드와 연식 코드가 케이스 기록과 일치합니다.`,
    serviceMessage: (message: string) => ` ${message}`,
    decodeNotFound: (provider: string, message: string) =>
      ` ${provider}에서 이 VIN을 식별하지 못했습니다: ${message} 이 데이터베이스는 북미에서 판매된 차량에 가장 잘 맞으므로 다른 시장에서는 흔한 일이지만, 참조 출처로 VIN이 확인되지는 않았습니다.`,
    decodeIncomplete: (provider: string, message: string) => ` ${provider} 조회가 완료되지 않았습니다: ${message}`,
    notFoundNext: "차량 표시판의 VIN을 서류와 한 글자씩 비교하거나, 해당 차량이 판매된 시장의 등록 기관에서 확인하세요.",
    incompleteNext: "VIN 디코딩을 다시 실행하세요.",
    caseOnly: " VIN이 적힌 서류도 없고 VIN 조회도 하지 않아 아직 확인된 것이 없습니다.",
    caseOnlyNext: "자동차등록증을 업로드하거나 VIN을 조회하세요.",
    noLookup: " 아직 VIN 조회를 하지 않았습니다.",
    noLookupNext: "VIN 데이터베이스에서 VIN을 조회하세요.",
  },

  // ------------------------------------------------------------ rule 8: registration number
  registration: {
    title: "차량 번호",
    checked: "차량 번호(번호판)가 적힌 모든 서류의 번호가 같은지.",
    why: "등록 기관은 VIN뿐 아니라 번호판으로도 조회합니다. 한 서류의 번호판이 다르면 다른 차량의 서류이거나 번호가 바뀌었을 수 있습니다.",
    none: "읽을 수 있는 차량 번호가 적힌 서류가 없습니다.",
    plateOn: (plate: string, doc: string) => `${doc}: ${plate}`,
    conflict: (plates: string[]) => `서류마다 차량 번호가 다릅니다: ${plates.join("; ")}.`,
    conflictNext: "차량의 번호판을 확인하고, 번호가 다른 이유를 판매자에게 물어보세요.",
    consistent: (documents: number, plate: string) => `서류 ${n(documents)}건의 차량 번호가 같습니다(${plate}). 서류끼리 일치한다는 뜻이며, 등록을 확인한 것은 아닙니다.`,
    single: (doc: string, plate: string) => `차량 번호(${plate})가 적힌 서류는 ${doc}뿐이라 비교할 대상이 없습니다.`,
  },

  // ------------------------------------------------------------ evidence summaries
  batteryHealth: {
    title: "배터리 상태 증빙",
    checked: "이 차량의 배터리 검사 보고서가 있는지, 그리고 무엇을 보고하는지.",
    why: "배터리 상태는 중고 전기차 가치의 큰 부분이며 구매 결정에 영향을 줄 수 있습니다.",
    reported: (soh: number, provider: string | null) => `배터리 상태 ${n(soh)}%(보고: ${provider ?? "업체명 없음"})`,
    none: "배터리 상태가 확인되지 않았습니다. 배터리 검사 보고서가 제출되지 않았습니다.",
    noneNext: "가격을 제안하기 전에 독립적인 배터리 검사를 의뢰하세요.",
    unreadable: "배터리 보고서는 제출되었지만 배터리 상태(SOH) 수치를 읽을 수 없었습니다.",
    unreadableNext: "보고서를 직접 확인하거나 독립적인 배터리 검사를 의뢰하세요.",
    failed: (reported: string[], check: "vin" | "age") =>
      `보고서 내용: ${reported.join("; ")}. 그러나 보고서가 ${check === "vin" ? "VIN" : "경과 기간"} 검사에 실패해 이 차량에 대해 신뢰할 수 없습니다.`,
    unlinked: (reported: string[]) => `보고서 내용: ${reported.join("; ")}. 그러나 이 차량의 VIN과 연결할 수 없었습니다.`,
    unlinkedNext: "VIN이 적힌 보고서를 업체에 요청하세요.",
    consistent: (reported: string[]) =>
      `보고서 내용: ${reported.join("; ")}. 이 차량의 VIN이 적혀 있고 최근 보고서입니다. VoltProof는 수치를 보고된 그대로 보여 줍니다. 배터리를 직접 검사하지 않았으며 발행처에 보고서를 확인하지도 않았습니다.`,
  },
  currentOdometer: {
    title: "현재 주행거리계",
    checked: "딜러 직원이 현재 주행거리계 값을 직접 기록했는지(예: 점검 때 찍은 계기판 사진).",
    why: "딜러가 직접 확보한 값은 판매자의 서류에 의존하지 않습니다.",
    none: "딜러가 직접 기록한 주행거리계 값이 없습니다.",
    noneNext: "점검 때 계기판의 주행거리계를 촬영해 '딜러 직원이 직접 촬영'으로 업로드하세요.",
    verified: (date: string, reading: string) =>
      `검증된 내용: 딜러 직원이${date ? ` ${date}에` : ""} 계기판을 촬영했으며, 표시된 값은 ${reading}입니다. 그날 계기판에 표시된 값을 검증한 것이며, 차량의 주행거리 이력을 검증한 것은 아닙니다.`,
  },

  // ------------------------------------------------------------ reading, integrity and authenticity
  notRead: {
    title: "판독되지 않은 서류",
    checked: "이 서류에서 정보를 추출할 수 있었는지.",
    notConfigured: "서류를 저장하고 지문을 남겼지만, AI 추출이 설정되어 있지 않아 판독하지 않았습니다.",
    failed: (error: string | null) => `추출 실패: ${error ?? "알 수 없는 오류"}.`,
    why: "이 서류의 내용은 어떤 검사에도 반영되지 않습니다.",
    next: "서류를 직접 검토하거나, AI를 설정한 뒤 다시 추출하세요.",
  },
  unsupported: {
    title: "추출된 값 확인 필요",
    checked: "추출된 각 값이 서류의 인용문으로 뒷받침되고 신뢰도 기준을 충족하는지.",
    result: (count: number, doc: string, fields: string[]) => `${doc}의 값 ${n(count)}개가 검사에서 제외되었습니다: ${fields.join(", ")}.`,
    why: "이 값들은 사용되지 않았으므로 관련 검사가 불완전할 수 있습니다.",
    next: "서류를 열어 값을 직접 읽고, 확인한 내용을 메모로 남기세요.",
  },
  integrity: {
    titleFields: (fields: string[]) => `${and(fields.map(field))} 편집 가능성`,
    title: "서류 변조 가능성 징후",
    checked:
      "파일 검사(형식, 편집 소프트웨어, 수정 이력), 디지털 서명, 그리고 각 값에 대한 검사: 다른 텍스트 위에 덧입힌 텍스트, 페이지에서 그 값에만 쓰인 글꼴, 값 위에 겹쳐진 주석, 붙여 넣거나 보정한 것처럼 보이는 사진 영역.",
    fields: (count: number, doc: string) => `${doc}의 값 ${n(count)}개에서 편집 가능성 징후가 발견되어 어떤 검사에도 사용하지 않습니다. `,
    indicators: (doc: string) => `${doc}에서 잠재적 징후가 발견되었습니다. `,
    notProof: "이는 조작의 증거가 아닙니다. 스캔본을 다시 저장했거나 명세서를 정정한 경우처럼 문제없는 이유일 수도 있습니다.",
    why: "서류 발행 후 값이 바뀌었다면, 그 값이 뒷받침하는 듯한 주장은 입증되지 않은 것입니다.",
    next: "발행처에서 원본 파일을 직접 받거나, 전화나 이메일로 발행처에 값을 확인하세요.",
  },
  signature: {
    title: (filename: string) => `디지털 서명 · ${filename}`,
    checked: "PDF에 암호화 서명이 있는지, 서명된 내용이 바뀌지 않았는지, 서명자의 인증서가 VoltProof의 신뢰 목록(알려진 발행처)에 있는지.",
    why: "알려진 발행처의 유효한 서명은 파일이 그 발행처가 서명한 그대로임을 입증합니다. 눈에 보이는 도장이나 손 서명은 그렇지 않습니다.",
    broken: (signer: string | null) => `${signer ? `${signer}의 ` : ""}서명이 서류와 일치하지 않습니다. 서명 후 내용이 변경되었습니다.`,
    brokenNext: "이 파일을 신뢰하지 마세요. 발행처에서 새 사본을 직접 받으세요.",
    verified: (trustedAs: string, date: string | null) =>
      `검증된 내용: 이 파일은 서명자(${trustedAs})가${date ? ` ${date}에` : ""} 서명한 그대로입니다. 서명 인증서가 신뢰 목록에 있습니다. 누가 발행했는지와 파일이 바뀌지 않았음을 검증한 것이며, 내용이 사실임을 검증한 것은 아닙니다.`,
    unconfirmed: (signer: string | null, reason: "added" | "untrusted") =>
      `서명된 내용은 서명자${signer ? `(${signer})` : ""}가 서명한 뒤 바뀌지 않았지만, ${reason === "added" ? "서명 후 내용이 추가되었으므로" : "서명 인증서가 신뢰 목록에 없으므로"} 발행처는 확인되지 않았습니다.`,
    untrustedNext: "발행처에 직접 확인한 뒤 발행처 인증서를 신뢰 목록에 추가하세요.",
    addedNext: "서명된 원본을 발행처에 요청하세요.",
    unchecked: "서명을 확인할 수 없었습니다.",
    uncheckedNext: "서명을 검증하는 PDF 리더로 파일을 열거나, 발행처에 원본을 요청하세요.",
  },
  authenticity: {
    title: "진위 미확인",
    deniedTitle: "발행처가 서류 발행을 부인함",
    confirmedTitle: "발행처를 통해 진위 확인됨",
    checked: "각 서류가 발행처를 통해 확인되었는지: 신뢰 목록에 있는 인증서의 유효한 디지털 서명, 또는 담당자가 발행처나 등록 기관에 직접 확인한 기록.",
    why: "서로 일치하는 서류라도 모두 가짜일 수 있습니다. 서류는 발행처나 발행처의 서명으로만 확인할 수 있습니다.",
    bySignature: (trustedAs: string) => `${trustedAs}의 디지털 서명`,
    byIssuer: (by: string, method: string, reference: string) => `${by} 님이 발행처에 확인함(${method}${reference ? `, 참조 번호 ${reference}` : ""})`,
    denied: (docs: string[]) => `발행처가 발행하지 않았다고 답한 서류: ${docs.join("; ")}.`,
    deniedNext: "해당 서류를 진본이 아닌 것으로 보고 판매자에게 설명을 요청하세요.",
    confirmed: (how: string[]) => `모든 서류가 발행처를 통해 확인되었습니다: ${how.join("; ")}.`,
    some: (confirmed: number, total: number, how: string[]) => `서류 ${n(total)}건 중 ${n(confirmed)}건이 발행처를 통해 확인되었습니다(${how.join("; ")}). 나머지는 확인되지 않았습니다. `,
    noneConfirmed: "발행처를 통해 확인된 서류가 없습니다. ",
    notProof: "값이 일치하고, 파일 검사에 문제가 없고, 도장이나 서명이 보인다고 해서 서류가 진본이라는 증거는 아닙니다.",
    next: "중요한 결정이라면 주요 서류를 발행한 정비소, 검사 업체 또는 등록 기관에 확인하고 기록하세요.",
  },

  // ------------------------------------------------------------ seller claims
  claim: {
    label: {
      soh: (percent: number | undefined) => `배터리 상태: ${pct(percent)}%라고 주장`,
      odometer: (reading: string) => `주행거리: ${rago(reading)} 주장`,
      damage: "사고 이력: 판매자가 손상을 알림",
      noAccidents: "사고 이력: 판매자는 없다고 함",
      chargingWords: (text: string) => `급속 충전 이력: “${text}”`,
      chargingMax: (percent: number | undefined) => `급속 충전 이력: DC 최대 ${pct(percent)}%라고 주장`,
    },
    checked: (type: ClaimType, sourceText: string | null) => `제출된 서류가 ${m.labels.claimType[type]}에 관한 판매자의 주장${sourceText ? `(“${sourceText}”)` : ""}을 뒷받침하는지.`,
    why: {
      battery_soh: "배터리는 중고 전기차 가치의 대부분을 차지하며 확인하기도 가장 어렵습니다.",
      odometer: "주행거리는 가치와 마모를 좌우합니다. 실제 주행거리가 주장보다 많으면 차량 가치와 금융사의 판단이 달라집니다.",
      accident_history: "알리지 않은 사고 손상은 안전, 가치, 보험 가입에 영향을 줍니다.",
      fast_charging: "DC 급속 충전을 자주 하면 배터리 마모가 빨라질 수 있어 향후 배터리 상태와 관련이 있습니다.",
    },
    short: (name: string) =>
      ((
        {
          batterySohPercent: "배터리 상태 수치",
          vin: "VIN",
          batteryTestDate: "검사일",
          odometer: "주행거리계 값",
          documentDate: "날짜",
          damageRepair: "수리 기록",
          serviceDetails: "정비 내용",
          dcChargingSharePercent: "충전 수치",
        } as Record<string, string>
      )[name] ?? name),
    tampered: {
      headline: (short: string, filename: string) => `${filename}의 ${short}에서 편집 징후가 보입니다.`,
      result: (message: string) => `포렌식 검사 결과(영어 원문): ${message} 이 값은 사용하지 않으며, 발행처가 확인하기 전까지는 이 서류를 근거로 주장을 판단할 수 없습니다.`,
      next: "이 주장을 믿기 전에 발행처에서 원본을 직접 받거나 발행처에 값을 확인하세요.",
    },
    soh: {
      lowerHeadline: (soh: number, below: number) => `배터리 보고서 수치는 ${n(soh)}%로, 주장보다 ${n(below)}%p 낮습니다.`,
      lowerResult: (source: string, soh: number, iso: string | null, claimed: number, tolerance: number) =>
        `${source}의 ${iso ? `${iso} ` : ""}보고에 따르면 배터리 상태는 ${n(soh)}%입니다. 판매자는 ${n(claimed)}%라고 주장합니다. 허용 오차는 ${n(tolerance)}%p입니다.`,
      lowerNext: "주장한 수치의 출처를 판매자에게 묻고, 측정된 수치를 기준으로 결정하세요.",
      otherVinHeadline: (tail: string) => `제출된 배터리 보고서에 다른 VIN(끝자리 ${tail})이 적혀 있습니다.`,
      otherVinResult: (tail: string, caseTail: string, claimed: number) =>
        `제출된 유일한 배터리 보고서는 이 차량(끝자리 ${caseTail})이 아니라 끝자리 ${tail}인 VIN의 보고서입니다. ${n(claimed)}%라는 주장을 뒷받침할 수 없습니다.`,
      otherVinNext: "이 보고서를 신뢰하지 마세요. 이 VIN으로 독립적인 배터리 검사를 의뢰하세요.",
      verifiedHeadline: (days: number | null, soh: number) => `이 검토 ${n(days ?? 0)}일 전 진단 결과(${n(soh)}%)와 일치합니다.`,
      verifiedResult: (source: string, soh: number, iso: string | null, maxDays: number, tolerance: number, claimed: number) =>
        `${source}의 ${iso} 보고에 따르면 이 VIN의 배터리 상태는 ${n(soh)}%입니다. 판매자와 무관하게 확보한 보고서이고 ${n(maxDays)}일 기준 이내이며, 수치가 주장한 ${n(claimed)}%와 ${n(tolerance)}%p 이내로 일치합니다.`,
      signed: (trustedAs: string) => ` 보고서에 ${trustedAs}의 유효한 디지털 서명이 있어 업체가 발행한 그대로임이 확인됩니다.`,
      why: {
        noVin: "보고서에 이 차량의 VIN이 없음",
        seller: "보고서가 독립적으로 의뢰한 것이 아니라 판매자에게서 받은 것임",
        noDate: "보고서에 사용할 수 있는 검사일이 없음",
        old: (days: number, maxDays: number) => `검사가 ${n(days)}일 전에 이루어져 ${n(maxDays)}일 기준을 넘음`,
      },
      agreesHeadline: (soh: number, why: string) => `배터리 보고서 수치(${n(soh)}%)는 일치하지만 검증으로 보지 않습니다: ${why}.`,
      agreesResult: (source: string, soh: number, claimed: number, why: string) =>
        `${source}의 보고 수치 ${n(soh)}%는 주장한 ${n(claimed)}%와 일치합니다. 다음 이유로 검증으로 보지 않습니다: ${why}.`,
      agreesNext: "수치를 검증하려면 이 VIN으로 독립적인 배터리 검사를 의뢰하세요.",
      noneHeadline: "아직 배터리 상태 보고서가 없습니다.",
      noneResult: (claimed: number) => `이 차량의 배터리 상태가 적힌 서류가 없어 ${n(claimed)}%라는 주장은 확인하지 않았습니다.`,
      noneNext: "가격을 제안하기 전에 이 VIN으로 독립적인 배터리 검사를 의뢰하세요.",
      noneMissing: (maxDays: number) => `최근 ${n(maxDays)}일 이내에 발행된 이 VIN의 배터리 상태 보고서.`,
    },
    odometer: {
      aboveHeadline: (type: DocumentType, reading: string, iso: string) => `${docType(type)}의 ${iso} 기록이 ${reading}로, 주장보다 많습니다.`,
      aboveResult: (doc: string, reading: string, iso: string, more: string, claimed: string) =>
        `${doc}의 ${iso} 기록은 ${reading}로, 주장한 수치(${claimed})보다 ${more} 많습니다. 지금 주행거리가 그때보다 적을 수는 없습니다.`,
      aboveNext: "주행거리계를 직접 확인하고 차이에 대해 판매자에게 설명을 요청하세요.",
      dashboardHeadline: (reading: string, iso: string) => `${iso}에 계기판에 표시된 값은 ${reading}로, 주장한 수치와 다릅니다.`,
      dashboardResult: (reading: string, iso: string, claimed: string, difference: string) => `딜러 직원의 ${iso} 기록은 ${reading}입니다. 판매자 주장은 ${claimed}이며 차이는 ${difference}입니다.`,
      dashboardNext: "매물 정보를 계기판 값으로 정정하세요.",
      timelineHeadline: "주행거리 기록이 시간이 지나며 줄어들어 주장한 수치를 신뢰할 수 없습니다.",
      verifiedHeadline: (iso: string) => `${iso}에 딜러 직원이 확인한 계기판 값과 일치합니다.`,
      verifiedResult: (iso: string, reading: string, tolerance: string, claimed: string) =>
        `딜러 직원이 ${iso}에 촬영한 주행거리계 값은 ${reading}로, 주장한 수치(${claimed})와 ${tolerance} 이내로 일치합니다.`,
      inLineHeadline: (types: DocumentType[]) => `${types.length ? and(types.map(docType)) : "이전"} 기록과 일치합니다.`,
      inLineResult: (readings: number, latest: string, iso: string, claimed: string) =>
        `날짜가 있는 기록 ${n(readings)}건(최근 기록: ${iso}, ${latest})이 모두 주장한 수치(${claimed}) 이하이며 타임라인도 거꾸로 가지 않습니다. 아직 딜러 직원이 확인한 현재 값이 없으므로 검증은 아닙니다.`,
      inLineNext: "현재 값을 검증하려면 점검 때 계기판 주행거리계를 촬영하세요.",
      noneHeadline: "아직 날짜가 있는 주행거리 기록이 없습니다.",
      noneResult: (claimed: string) => `주행거리계 값이 적힌 서류가 없어 ${raneun(claimed)} 주장은 확인하지 않았습니다.`,
      noneNext: "계기판 주행거리계를 촬영하고 날짜가 있는 정비 명세서를 요청하세요.",
      noneMissing: "점검 때 찍은 계기판 사진, 또는 주행거리계 값이 적힌 날짜 있는 정비 명세서.",
    },
    accident: {
      disclosedHeadline: (repair: string) => `판매자가 알린 수리가 기록에 있습니다(${repair}).`,
      disclosedResult: (doc: string, repair: string) => `${doc}의 기재 내용: “${repair}”. 판매자가 알린 내용과 일치합니다.`,
      disclosedNext: "점검 때 수리 품질을 확인하세요.",
      noRecordHeadline: "판매자는 손상을 알렸지만 수리 기록이 없습니다.",
      noRecordResult: "손상이나 수리를 설명하는 서류가 없습니다.",
      noRecordNext: "판매자에게 수리 명세서나 보험 청구 기록을 요청하세요.",
      noRecordMissing: "알린 손상에 대한 수리 명세서나 보험 청구 기록.",
      repairHeadline: (type: DocumentType, repairs: number) => `${type === "insurance_or_repair_record" ? "보험 기록" : docType(type)}에 손상 수리 ${n(repairs)}건이 기록되어 있습니다.`,
      repairResult: (doc: string, iso: string | null, repair: string) => `판매자는 사고가 없었다고 하지만, ${doc}${iso ? `(${iso})` : ""}의 기재 내용은 다음과 같습니다: “${repair}”.`,
      repairNext: "판매자에게 수리에 대해 묻고, 수리 명세서를 받고, 수리 부위를 점검하세요.",
      cleanHeadline: (records: number, months: number) => `${n(months)}개월에 걸친 기록 ${n(records)}건에 손상 수리 언급이 없습니다.`,
      cleanResult: (records: number, first: string, last: string) =>
        `${first}부터 ${last}까지 날짜가 있는 정비·수리 기록 ${n(records)}건에 충돌, 차체, 구조 수리 언급이 없습니다. 기록에는 기록된 작업만 나타나므로 사고가 없었다는 증거는 아닙니다.`,
      cleanNext: "금융 결정이라면 이 VIN의 보험 청구 이력을 요청하세요.",
      noneHeadline: "아직 보험·수리 이력이 없습니다.",
      noneResult: (months: number) => `정비 이력이 ${n(months)}개월 미만이고 보험·수리 기록도 없어 이 주장은 확인하지 않았습니다.`,
      noneNext: "판매자에게 이 VIN의 보험 청구 이력을 요청하세요.",
      noneMissing: "이 VIN의 보험 청구 이력 또는 수리 이력.",
    },
    charging: {
      overHeadline: (share: number) => `충전 기록상 DC 급속 충전 비율이 ${n(share)}%입니다.`,
      overResult: (doc: string, share: number, max: number) => `${doc}에 따르면 DC 급속 충전 비율은 ${n(share)}%입니다. 주장에서 허용하는 비율은 약 ${n(max)}%입니다.`,
      overNext: "충전 습관을 묻고 배터리 검사 결과에 더 큰 비중을 두세요.",
      verifiedHeadline: (share: number) => `독립적으로 확보한 충전 기록상 DC 급속 충전 비율은 ${n(share)}%입니다.`,
      verifiedResult: (doc: string, share: number, max: number) => `${doc}에 따르면 DC 급속 충전 비율은 ${n(share)}%로, 주장(약 ${n(max)}% 이하)과 일치합니다.`,
      sellerHeadline: (share: number) => `판매자가 제공한 충전 기록과 일치합니다(DC ${n(share)}%).`,
      sellerResult: (doc: string, share: number) => `${doc}에 따르면 DC 급속 충전 비율은 ${n(share)}%입니다. 판매자에게서 받은 기록이므로 검증은 아닙니다.`,
      sellerNext: "차량 앱이나 제조사에서 충전 기록을 직접 내려받아 달라고 요청하세요.",
      noneHeadline: "아직 충전 데이터가 없습니다.",
      noneResult: "차량을 어떻게 충전했는지 적힌 서류가 없어 이 주장은 확인하지 않았습니다.",
      noneNext: "판매자에게 차량 앱의 충전 이력 내보내기를 요청하세요.",
      noneMissing: "차량 앱이나 제조사에서 내보낸 충전 이력.",
    },
    summary: (conflicts: number, backed: number, missing: number) => {
      const parts = [conflicts ? `대금을 치르기 전에 충돌 ${n(conflicts)}건을 검토하세요.` : "충돌이 없습니다."];
      if (backed && missing) parts.push(`주장 ${n(backed)}건은 증빙으로 뒷받침되고, ${n(missing)}건은 아직 증빙이 없습니다.`);
      else if (backed) parts.push(`주장 ${n(backed)}건은 증빙으로 뒷받침됩니다.`);
      else if (missing) parts.push(`주장 ${n(missing)}건은 아직 증빙이 없습니다.`);
      return parts.join(" ");
    },
  },
};
