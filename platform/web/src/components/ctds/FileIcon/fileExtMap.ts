/**
 * 파일 확장자 → FileIcon 렌더 정보 매핑.
 *
 * 두 종류 — "브랜드"와 "제너릭".
 *   - 브랜드(ai/psd/xls/ppt/doc/pdf): 단일 색 + 2글자 라벨. Mode 축 무관하게 고정.
 *   - 제너릭(others/zip/mp3): L/D 두 색 pair + 아이콘. Mode 축에 자동 반응.
 *
 * 색은 레퍼런스 디자인(.refs/chat/file-icon-ref.png)에서 직접 추출한 hex.
 * CTDS 하드코딩 금지 원칙의 명시적 예외 — 파일 포맷 식별은 브랜드 자산 성격이라
 * 토큰으로 추상화하면 의미를 잃는다. [[feedback-no-hardcoded-values]]의 예외
 * 범주이며, lint baseline에 등록해 통과시킨다.
 */

export type FileIconKind = "brand" | "generic";

/** 브랜드형 — bg·fg 고정, 라벨은 2글자. */
export interface BrandSpec {
  kind: "brand";
  bg: string;
  fg: string;
  label: string;
}

/** 제너릭형 — L/D pair, phosphor 아이콘. */
export interface GenericSpec {
  kind: "generic";
  light: { bg: string; fg: string };
  dark: { bg: string; fg: string };
  icon: "file" | "file-zip" | "music-note";
}

export type FileIconSpec = BrandSpec | GenericSpec;

/** 제너릭 키들 (ext → group) */
const GENERIC_GROUP: Record<string, "zip" | "mp3" | "others"> = {
  zip: "zip",
  rar: "zip",
  "7z": "zip",
  tar: "zip",
  gz: "zip",

  mp3: "mp3",
  wav: "mp3",
  flac: "mp3",
  m4a: "mp3",
  aac: "mp3",
  ogg: "mp3",
};

/** 그룹별 제너릭 스펙 */
const GENERIC_SPEC: Record<"zip" | "mp3" | "others", GenericSpec> = {
  others: {
    kind: "generic",
    light: { bg: "#EDEAB0", fg: "#B2AA54" },
    dark: { bg: "#363229", fg: "#A19B5A" },
    icon: "file",
  },
  zip: {
    kind: "generic",
    light: { bg: "#EDEAB0", fg: "#B2AA54" },
    dark: { bg: "#363229", fg: "#A19B59" },
    icon: "file-zip",
  },
  mp3: {
    kind: "generic",
    light: { bg: "#BEFDA8", fg: "#4B9C2D" },
    dark: { bg: "#254924", fg: "#BDFCA8" },
    icon: "music-note",
  },
};

/** 브랜드 파일 — 확장자별 단일 스펙 */
const BRAND_SPEC: Record<string, BrandSpec> = {
  ai: { kind: "brand", bg: "#2E0402", fg: "#F09E38", label: "Ai" },
  psd: { kind: "brand", bg: "#081D34", fg: "#57A5F8", label: "Ps" },
  xls: { kind: "brand", bg: "#3B804C", fg: "#FFFFFF", label: "X" },
  xlsx: { kind: "brand", bg: "#3B804C", fg: "#FFFFFF", label: "X" },
  ppt: { kind: "brand", bg: "#B84C2C", fg: "#FFFFFF", label: "P" },
  pptx: { kind: "brand", bg: "#B84C2C", fg: "#FFFFFF", label: "P" },
  doc: { kind: "brand", bg: "#3044C7", fg: "#FFFFFF", label: "W" },
  docx: { kind: "brand", bg: "#3044C7", fg: "#FFFFFF", label: "W" },
  pdf: { kind: "brand", bg: "#EA336C", fg: "#FFFFFF", label: "Pd" },
};

/**
 * 확장자 정규화 — 선행 점·대문자 모두 허용.
 * 공백·null 안전.
 */
export function normalizeExt(ext: string | null | undefined): string {
  if (!ext) return "";
  return ext.trim().replace(/^\./, "").toLowerCase();
}

/** 파일명(또는 확장자)에서 FileIcon 스펙 조회. */
export function resolveFileIcon(input: string): FileIconSpec {
  const ext = normalizeExt(
    input.includes(".") ? input.split(".").pop() ?? "" : input
  );

  if (ext in BRAND_SPEC) return BRAND_SPEC[ext];

  const group = GENERIC_GROUP[ext] ?? "others";
  return GENERIC_SPEC[group];
}

/** 데모·테스트에서 전체 리스트 돌 때 쓰려고 export. */
export const KNOWN_BRAND_EXTS = Object.keys(BRAND_SPEC);
export const KNOWN_GENERIC_GROUPS = Object.keys(GENERIC_SPEC) as (
  | "others"
  | "zip"
  | "mp3"
)[];
