import type {
  DensityValue,
  IconFamily,
  MotionValue,
  PaletteValue,
  ShapeValue,
  ThemePreset,
} from "../_data";

export type ThemeId = "none" | "pure" | "spare" | "expressive";
export type VibeId = "balanced" | "playful" | "serious";
export type DensityChoiceId = DensityValue;
export type LayoutId =
  | "sidebar-only"
  | "topbar-sidebar"
  | "dual-sidebar"
  | "topbar-over-sidebar"
  | "topbar-tabs";

// ── 디자인 스타일(테마) ─────────────────────────────────
// 테마를 고르면 뒤의 축(vibe/density 등) 디폴트가 묶여서 결정됩니다.
// 사용자는 뒤 단계에서 override 가능. "none"은 축을 하나씩 직접 고르는 흐름.
// 테마 정의 원본: prompts/themes/<slug>.md (pure / spare / expressive)

export type ThemeBadgeStatus = "success" | "warning" | "destructive" | "info";

export type ThemeChoice = {
  id: ThemeId;
  title: string;
  /** 영어 접두. 뱃지로 title 앞에 노출. "none"은 뱃지 없음. */
  badge?: string;
  /** Badge status — soft variant에서 색이 결정됨. */
  badgeStatus?: ThemeBadgeStatus;
  hint: string;
  examples: string;
};

export const THEME_CHOICES: ThemeChoice[] = [
  {
    id: "none",
    title: "직접 원하는 스타일로 만들기",
    hint: "분위기 · 컬러 · 밀도 · 레이아웃을 단계별로 직접 설정합니다. CTDS 기본값에서 시작.",
    examples: "자체 디자인 가이드가 있거나, 축을 세밀하게 조정하고 싶은 경우",
  },
  {
    id: "spare",
    title: "차분하고 정돈된",
    badge: "Spare",
    badgeStatus: "info",
    hint: "정해둔 격자 안에서만 움직여요. 매일 열어도 피로하지 않게, 꼭 필요한 것만 담아요.",
    examples: "Vercel · Supabase · Raycast · Linear 같은 앱 · 대시보드 · 설정 · 문서",
  },
  {
    id: "pure",
    title: "덜어냄으로 세련된",
    badge: "Pure",
    badgeStatus: "success",
    hint: "선 · 카드 · 그림자처럼 가두는 장치를 빼요. 톤 차이와 여백만으로 자연스럽게 흐르게.",
    examples: "Stripe · Framer · Linear 랜딩. 첫인상이 중요한 소개 페이지",
  },
  {
    id: "expressive",
    title: "밝고 통통 튀는",
    badge: "Expressive",
    badgeStatus: "warning",
    hint: "파스텔 색으로 분류하고, 카드가 살짝 떠 있어요. 매일 열고 싶은 생기 있는 UI.",
    examples: "Notion Calendar · Superhuman · Arc 같은 스케줄 · 메일 · 메시지 앱",
  },
];

export type VibeChoice = {
  id: VibeId;
  title: string;
  hint: string;
  examples: string;
  values: {
    shape: ShapeValue;
    motion: MotionValue;
    /** 선택된 vibe의 "serious" variant가 palette=mono를 승계하는 데 쓰임. */
    palette?: PaletteValue;
  };
};

export const VIBE_CHOICES: VibeChoice[] = [
  {
    id: "balanced",
    title: "무난한 표준",
    hint: "SaaS 기본. 코너·모션 모두 중간값. 튀지도 심심하지도 않게.",
    examples: "일반 SaaS, 사내 도구, 이커머스 관리",
    values: { shape: "standard", motion: "standard" },
  },
  {
    id: "playful",
    title: "활력 있고 통통 튀는",
    hint: "코너는 둥글고, 모션은 쫀득하게, 색은 보조색까지. 브랜드가 기억되어야 하는 화면.",
    examples: "스타트업 프로덕트, 마케팅 사이트, 온보딩·튜토리얼",
    values: { shape: "soft", motion: "bouncy" },
  },
  {
    id: "serious",
    title: "격식있는 프로 도구",
    hint: "모노톤. 색은 최소 지점에만. 코너는 각지고 모션은 조용히.",
    examples: "관리자 대시보드, 분석 도구, 인프라 콘솔, 공공기관, 금융",
    values: { shape: "crisp", motion: "calm", palette: "mono" },
  },
];

// ── 컬러 & 톤 ─────────────────────────────────────────

export type PaletteChoice = {
  id: PaletteValue;
  title: string;
  hint: string;
  examples: string;
};

export const PALETTE_CHOICES: PaletteChoice[] = [
  {
    id: "vivid",
    title: "선명하게",
    hint: "진하고 또렷한 색",
    examples: "스타트업, 마케팅, 캠페인 페이지",
  },
  {
    id: "standard",
    title: "표준",
    hint: "무난한 기본 채도",
    examples: "일반 웹앱, 관리 도구",
  },
  {
    id: "calm",
    title: "차분하게",
    hint: "탁한 웜 톤",
    examples: "공공기관, 금융, 신중한 브랜드",
  },
  {
    id: "pastel",
    title: "밝고 파스텔",
    hint: "연하고 밝은 톤",
    examples: "교육, 콘텐츠, 웰니스, 어린이 프로덕트",
  },
];

export type HuePreset = {
  id: string;
  label: string;
  hue: number;
  desc: string;
};

export const HUE_PRESET_CHOICES: HuePreset[] = [
  { id: "ocean", label: "Ocean", hue: 210, desc: "신뢰 · 금융/공공" },
  { id: "forest", label: "Forest", hue: 145, desc: "안정 · 헬스케어" },
  { id: "sunset", label: "Sunset", hue: 25, desc: "활력 · 스타트업" },
  { id: "lavender", label: "Lavender", hue: 280, desc: "창의 · 교육" },
  { id: "crimson", label: "Crimson", hue: 355, desc: "강조 · 프로모션" },
  { id: "slate", label: "Slate", hue: 220, desc: "무채색 · 관리 도구" },
];

export type DensityChoice = {
  id: DensityChoiceId;
  title: string;
  hint: string;
  examples: string;
};

export const DENSITY_CHOICES: DensityChoice[] = [
  {
    id: "compact",
    title: "데이터가 많음",
    hint: "한 화면에 최대한 많은 행·열이 보여야 함. 클릭 대상이 작아도 괜찮음.",
    examples: "관리자 테이블, 엑셀 대체 도구, 데이터 그리드",
  },
  {
    id: "default",
    title: "표준 밀도",
    hint: "일반 웹앱 기본값. 정보와 여백이 균형 있게.",
    examples: "일반 SaaS, 대부분의 페이지",
  },
  {
    id: "comfortable",
    title: "여유롭게",
    hint: "터치 대상이 넉넉해야 하거나, 콘텐츠에 집중하게 하고 싶을 때.",
    examples: "태블릿·모바일 앱, 콘텐츠 리더, 랜딩 페이지",
  },
];

export type LayoutChoice = {
  id: LayoutId;
  title: string;
  hint: string;
  examples: string;
  sidebar: "left" | "right" | "dual" | "none";
  topbar: boolean;
  /**
   * 탑바가 사이드바와 어떻게 걸치는지. AppFrame의 layout prop과 1:1.
   * - "sidebar-first": 사이드바가 세로 전체, 탑바는 콘텐츠 영역 위에만. Linear/Slack/Figma.
   * - "topbar-first": 탑바가 가로 전체, 사이드바는 그 아래로. GitHub/Vercel/Jira.
   * topbar=false일 때는 의미 없음.
   */
  appFrameLayout?: "sidebar-first" | "topbar-first";
  /** 탑바 아래에 탭 바가 있는지. GitHub repo 네비처럼 섹션 전환이 탭으로. */
  tabs?: boolean;
};

export const LAYOUT_CHOICES: LayoutChoice[] = [
  {
    id: "topbar-sidebar",
    title: "사이드바가 세로 전체, 탑바는 오른쪽에만",
    hint: "사이드바가 항상 보이는 작업 공간. 섹션 트리가 깊고 자주 오간다.",
    examples: "Notion, Linear, Slack, Figma",
    sidebar: "left",
    topbar: true,
    appFrameLayout: "sidebar-first",
  },
  {
    id: "topbar-over-sidebar",
    title: "탑바가 가로 전체, 그 아래 사이드바",
    hint: "로고·검색·계정이 전역에 자리. 사이드바는 현재 섹션 안쪽 네비.",
    examples: "GitHub, Vercel, Jira, Jenkins",
    sidebar: "left",
    topbar: true,
    appFrameLayout: "topbar-first",
  },
  {
    id: "sidebar-only",
    title: "사이드바만, 탑바 없음",
    hint: "왼쪽에 최소 네비. 상단 바 없이 콘텐츠에 몰입.",
    examples: "Linear (이슈 뷰), Vercel Dashboard, Slack",
    sidebar: "left",
    topbar: false,
  },
  {
    id: "dual-sidebar",
    title: "양쪽 사이드바 + 탑바",
    hint: "왼쪽 트리, 오른쪽 속성 패널. 도구 자체가 UI의 주인공인 편집기.",
    examples: "Figma, Framer, VS Code, Blender",
    sidebar: "dual",
    topbar: true,
    appFrameLayout: "sidebar-first",
  },
  {
    id: "topbar-tabs",
    title: "탑바 아래 탭으로 섹션 전환",
    hint: "사이드바 없이 상단 탑바 + 탭 한 줄. 섹션 수가 적고 깊이가 얕을 때.",
    examples: "GitHub repo, Stripe Dashboard, Vercel 프로젝트",
    sidebar: "none",
    topbar: true,
    appFrameLayout: "topbar-first",
    tabs: true,
  },
];

/**
 * 각 테마가 묶는 축 preset. prompts/themes/<slug>.md 의 Preset 표 그대로.
 * Theme이 안 담는 축(palette/hue)은 중립 기본값.
 * applyPreset에 넘기면 6개 축이 한 번에 스왑됨.
 */
export const THEME_PRESETS: Record<Exclude<ThemeId, "none">, ThemePreset> = {
  spare: {
    mode: "light",
    palette: "standard",
    hue: 210,
    shape: "crisp",
    density: "default",
    motion: "calm",
    iconFamily: "phosphor" as IconFamily,
    lang: "ko",
  },
  pure: {
    mode: "light",
    palette: "standard",
    hue: 210,
    shape: "soft",
    density: "comfortable",
    motion: "calm",
    iconFamily: "phosphor" as IconFamily,
    lang: "ko",
  },
  expressive: {
    mode: "light",
    palette: "pastel",
    hue: 280,
    shape: "soft",
    density: "default",
    motion: "bouncy",
    iconFamily: "phosphor" as IconFamily,
    lang: "ko",
  },
};

/**
 * 테마가 vibe 축(shape/motion/icon/accent 묶음)을 커버하므로, 테마 선택 시
 * vibe step을 건너뛰고 요약에만 노출. 각 테마의 축 조합과 가장 가까운 vibe 매핑.
 */
export const THEME_VIBE_FALLBACK: Record<Exclude<ThemeId, "none">, VibeId> = {
  spare: "serious",     // crisp · calm · regular — serious와 가장 가까움
  pure: "serious",      // soft · calm — motion/weight 공유, shape만 다름
  expressive: "playful", // soft · bouncy · colorful — playful과 거의 일치
};
