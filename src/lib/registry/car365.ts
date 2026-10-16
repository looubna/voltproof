// Korea: MLIT 자동차종합정보 API (data.go.kr dataset 15071233, operated with
// 자동차365 / car365.go.kr). Free. Returns basic vehicle information,
// specifications, history and performance-inspection data, looked up by
// registration number (차량번호) and owner name, and only for items the owner
// has consented to share with third parties. Development keys are approved
// automatically; production use needs review and approval.
//
// Not wired up yet: it needs a service key, the owner's consent and the
// registration number, and its request specification is in the usage guide
// (자동차종합정보개방서비스_이용가이드) attached to the dataset page. Until then
// this adapter reports "not_configured" so the UI can say exactly what is missing.

export const CAR365_NAME = "Korea MLIT vehicle information (자동차365)";
export const CAR365_INFO_URL = "https://www.data.go.kr/data/15071233/openapi.do";

export function car365Status(serviceKey: string | undefined) {
  return serviceKey
    ? { configured: true as const, message: "Service key present. Lookups need the registration number, the owner's name and the owner's consent." }
    : {
        configured: false as const,
        message:
          "Not connected. Apply for a free service key on data.go.kr (자동차종합정보 API), set KR_CAR365_SERVICE_KEY, and collect the owner's consent and registration number at intake.",
      };
}
