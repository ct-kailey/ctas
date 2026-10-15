// ============================================================
// Theme axes — presets
// ============================================================

export type ModeValue = "light" | "dark";
export type PaletteValue = "mono" | "vivid" | "standard" | "calm" | "pastel";
export type ShapeValue = "soft" | "standard" | "crisp";
export type DensityValue = "compact" | "default" | "comfortable";
export type MotionValue = "bouncy" | "standard" | "calm" | "none";
export type IconFamily = "phosphor" | "solar" | "lucide";
export type IconWeight = "regular" | "fill";
export type VoiceValue = "formal" | "neutral" | "casual";
export type LangValue = "ko" | "en";
/**
 * Palette 프리셋. chroma·lightness·hue-shift를 세트로 스왑.
 * 단순 채도 필터가 아니라 팔레트 스타일 재해석:
 * - mono: 채도 0, 무채색 지배. 아이콘·secondary도 fg 톤.
 * - vivid/standard: 원본 hue 유지
 * - calm: hue를 warm 방향으로 살짝 이동 → 초록이 카키·파랑이 슬레이트가 됨
 * - pastel: hue를 cool 방향으로 살짝 이동 → 초록이 민트·오렌지가 피치가 됨
 */
export const palettePresets: {
  id: PaletteValue;
  label: string;
  desc: string;
  chroma: number;
  lightness: number;
  hueShift: number;
}[] = [
  { id: "mono",     label: "Mono",     desc: "채도 0 · 무채색 지배 · primary는 CTA/상태 지점에만", chroma: 0,    lightness: 0.52, hueShift:   0 },
  { id: "vivid",    label: "Vivid",    desc: "원본 hue · 진한 채도 · 강렬한 브랜드 톤",         chroma: 0.20, lightness: 0.58, hueShift:   0 },
  { id: "standard", label: "Standard", desc: "원본 hue · 중간 채도 · 기본",                     chroma: 0.14, lightness: 0.55, hueShift:   0 },
  { id: "calm",     label: "Calm",     desc: "warm shift · 낮은 채도 · 카키/슬레이트/테라코타",  chroma: 0.06, lightness: 0.48, hueShift:  18 },
  { id: "pastel",   label: "Pastel",   desc: "cool shift · 낮은 채도 · 매우 밝은 명도 · 민트/피치/베이비블루", chroma: 0.09, lightness: 0.82, hueShift: -12 },
];

/**
 * Shape 프리셋. radius + shadow + border를 세트로 스왑.
 * standard가 기본 · soft/crisp는 성격 표현이 필요한 프로젝트에서 선택.
 */
export const shapePresets: {
  id: ShapeValue;
  label: string;
  desc: string;
  useCase: string;
}[] = [
  {
    id: "soft",
    label: "Soft",
    desc: "말랑, 캐주얼",
    useCase: "스타트업 · 콘텐츠 · 교육 · 마케팅",
  },
  {
    id: "standard",
    label: "Standard",
    desc: "표준, 무난",
    useCase: "일반 웹 UI · 다목적",
  },
  {
    id: "crisp",
    label: "Crisp",
    desc: "딱딱, 전문",
    useCase: "관공서 · 금융 · 데이터 대시보드",
  },
];

/**
 * Density 프리셋. space-scale + control-height 세트로 스왑.
 * 정보 밀도가 승부 나는 대시보드/테이블 화면에서 결정적.
 */
export const densityPresets: {
  id: DensityValue;
  label: string;
  desc: string;
  useCase: string;
  scale: number;
}[] = [
  {
    id: "compact",
    label: "Compact",
    desc: "높은 밀도 (85%)",
    useCase: "관리 도구 · 데이터 테이블 · 엑셀 대체",
    scale: 0.85,
  },
  {
    id: "default",
    label: "Default",
    desc: "표준 밀도 (100%)",
    useCase: "일반 웹 UI",
    scale: 1,
  },
  {
    id: "comfortable",
    label: "Comfortable",
    desc: "낮은 밀도 (106%)",
    useCase: "태블릿 · 터치 · 콘텐츠 중심",
    scale: 1.06,
  },
];

/**
 * Motion 프리셋.
 * duration + ease + distance-scale을 세트로 스왑.
 * "none"은 접근성/설정 모두 대응 (prefers-reduced-motion도 자동으로 강제 매핑됨).
 */
export const motionPresets: {
  id: MotionValue;
  label: string;
  desc: string;
  useCase: string;
  duration: number; // base ms
}[] = [
  {
    id: "bouncy",
    label: "Bouncy",
    desc: "쫀득한 오버슛",
    useCase: "브랜드 · 온보딩 · 스타트업",
    duration: 192,
  },
  {
    id: "standard",
    label: "Standard",
    desc: "짧고 매끈 (Vercel 스타일)",
    useCase: "일반 웹 UI",
    duration: 160,
  },
  {
    id: "calm",
    label: "Calm",
    desc: "심심하고 차분",
    useCase: "관리 도구 · 대시보드 · 관공서",
    duration: 144,
  },
  {
    id: "none",
    label: "None",
    desc: "즉시 · 애니 없음",
    useCase: "접근성 · 저사양",
    duration: 0,
  },
];

/**
 * 모션 프리미티브 카탈로그.
 * 재사용 가능한 애니메이션 패턴. 컴포넌트가 골라 씀.
 * 각 프리미티브는 축 값에 따라 파라미터가 자동 스왑됨.
 */
export type MotionPrimitive = {
  id: string;
  label: string;
  role: string;
  usage: string;
  className: string; // 데모용 CSS class
};

/**
 * Icon 축.
 * - Family: 프로젝트당 하나 선택 (한 페이지 안에서 절대 섞지 말 것)
 * - Weight: regular / fill. Phosphor·Solar 두 family는 실제 반응, Lucide는 regular로 fallback.
 */
export const iconFamilies: {
  id: IconFamily;
  label: string;
  desc: string;
  homepage: string;
}[] = [
  {
    id: "phosphor",
    label: "Phosphor",
    desc: "regular/fill 매트릭 매칭",
    homepage: "https://phosphoricons.com",
  },
  {
    id: "solar",
    label: "Solar",
    desc: "6-스타일 팩 · Linear(regular)/Bold(fill) 매칭",
    homepage: "https://solaricons.com",
  },
  {
    id: "lucide",
    label: "Lucide",
    desc: "Feather 계승 · 얇은 stroke · 표준적",
    homepage: "https://lucide.dev",
  },
];

/**
 * Font 축 — Language.
 * data-lang이 --font-normal/point/code 슬롯의 스택을 통째로 스왑.
 * point/code 폰트는 각 언어 특성에 맞춰 매핑 (프로젝트 초기 설정으로 언제든 교체 가능).
 */
export const langPresets: {
  id: LangValue;
  label: string;
  sample: string;
  desc: string;
}[] = [
  { id: "ko", label: "한국어",   sample: "디자인 시스템",           desc: "Pretendard · Nanum Myeongjo" },
  { id: "en", label: "English",  sample: "Design System",            desc: "Inter · Playfair Display" },
];

/**
 * Voice 축 — 카피 톤. 토큰 없음(Layer 2 only).
 * data-voice 속성만 노출. AI가 카피 생성 시 참조.
 * Theme과 독립 — editorial·mechanical 어느 Theme에도 어떤 Voice든 결합 가능.
 */
export const voicePresets: {
  id: VoiceValue;
  label: string;
  desc: string;
  useCase: string;
  samples: { save: string; error: string };
}[] = [
  {
    id: "formal",
    label: "Formal",
    desc: "격식체 · 종결어미 “입니다”",
    useCase: "공공 · 금융 · 법무 · 엔터프라이즈",
    samples: { save: "저장되었습니다.", error: "요청을 처리할 수 없습니다." },
  },
  {
    id: "neutral",
    label: "Neutral",
    desc: "표준 존대 · “입니다 / 해요” 혼용",
    useCase: "일반 웹 UI · B2C 기본",
    samples: { save: "저장했어요.", error: "다시 시도해 주세요." },
  },
  {
    id: "casual",
    label: "Casual",
    desc: "친근체 · 말 놓기 톤 허용",
    useCase: "소셜 · 게임 · 내부 도구",
    samples: { save: "저장 완료!", error: "앗, 뭔가 잘못됐어요." },
  },
];

// ============================================================
// Presets — Theme이 묶는 6축(Mode/Shape/Density/Font/Icon/Motion) + 색/언어의 특정 조합에 이름 붙인 것 (1급 객체)
// ============================================================

export type ThemePreset = {
  mode: ModeValue;
  palette: PaletteValue;
  hue: number;
  /** 보조 hue — secondary variant에서만 활용. 미지정이면 primary hue로 폴백. */
  accentHue?: number;
  shape: ShapeValue;
  density: DensityValue;
  motion: MotionValue;
  iconFamily: IconFamily;
  lang: LangValue;
};

export const themePresets: {
  id: string;
  label: string;
  desc: string;
  values: ThemePreset;
}[] = [
  {
    id: "gov-formal",
    label: "Gov Formal",
    desc: "관공서 · 금융 · 신뢰",
    values: {
      mode: "light", palette: "mono", hue: 210,
      shape: "crisp", density: "compact", motion: "calm",
      iconFamily: "lucide",
      lang: "ko",
    },
  },
  {
    id: "startup-vivid",
    label: "Startup Vivid",
    desc: "스타트업 · 마케팅 · 활력",
    values: {
      mode: "light", palette: "vivid", hue: 25, accentHue: 210,
      shape: "soft", density: "default", motion: "bouncy",
      iconFamily: "phosphor",
      lang: "ko",
    },
  },
  {
    id: "admin-dense",
    label: "Admin Dense",
    desc: "관리 도구 · 데이터 대시보드",
    values: {
      mode: "dark", palette: "standard", hue: 260,
      shape: "crisp", density: "compact", motion: "calm",
      iconFamily: "lucide",
      lang: "ko",
    },
  },
];

export const motionPrimitives: MotionPrimitive[] = [
  {
    id: "fade",
    label: "Fade",
    role: "상태 전환 (opacity)",
    usage: "hover/focus, 요소 표시/숨김",
    className: "m-preview-fade",
  },
  {
    id: "slide-up",
    label: "Slide Up",
    role: "공간 이동 (translateY)",
    usage: "Toast, Drawer 하단→중앙",
    className: "m-preview-slide-up",
  },
  {
    id: "scale",
    label: "Scale",
    role: "강조 등장",
    usage: "Popover, Modal, Tooltip",
    className: "m-preview-scale",
  },
  {
    id: "pulse",
    label: "Pulse",
    role: "반복 강조",
    usage: "알림 배지, 대기 상태",
    className: "m-pulse",
  },
  {
    id: "spin",
    label: "Spin",
    role: "로딩 회전",
    usage: "Spinner, 로딩 인디케이터",
    className: "m-spin",
  },
  {
    id: "shimmer",
    label: "Shimmer",
    role: "Skeleton 반짝임",
    usage: "Skeleton, 로딩 placeholder",
    className: "m-shimmer",
  },
];

export const spacing: [string, number][] = [
  ["space-0", 0], ["space-0.5", 2], ["space-1", 4], ["space-1.5", 6],
  ["space-2", 8], ["space-2.5", 10], ["space-3", 12], ["space-4", 16],
  ["space-5", 20], ["space-6", 24], ["space-8", 32], ["space-10", 40],
  ["space-12", 48], ["space-16", 64], ["space-20", 80], ["space-24", 96],
];

export const spacingUse: Record<string, string> = {
  "space-0.5": "아이콘 미세 간격",
  "space-1": "텍스트-아이콘",
  "space-1.5": "컨트롤 gap, sm/md 아이콘측 패딩",
  "space-2": "버튼 sm 좌우, 작은 gap",
  "space-2.5": "버튼 md 좌우",
  "space-3": "폼 필드 내부, 버튼 lg 아이콘측",
  "space-4": "카드 내부, 기본 gap",
  "space-6": "섹션 내부 여백",
  "space-8": "섹션 간 간격",
  "space-12": "페이지 상단 여백",
  "space-16": "랜딩 섹션 간격",
};

// 섹션(카테고리) 단위 프롬프트 — 원칙, 스케일 선택 전략, 애매할 때, 금지, 관련
export const sectionPrompts: Record<string, string> = {
  spacing: `Spacing (여백/간격)

원칙
관계의 밀도를 시각화한다. 가까울수록 관련성이 강하고, 멀수록 문맥이 분리된다. 모든 값은 4px 배수(--space-* 토큰)만 사용.

스케일 선택 전략
- 컴포넌트 내부(버튼/입력의 텍스트-아이콘, chip 등): space-1 ~ space-3
- 관련 있는 요소 사이(카드 내부 블록, 폼 필드 간, 모달 헤더-본문): space-4 ~ space-6
- 문맥이 다른 섹션 사이(KPI 그룹 → 테이블 등): space-8 ~ space-12
- 페이지 최상단/히어로: space-16 이상

애매할 때
큰 값 쪽으로. 여백 부족보다 여백 과다가 회복 쉬움.

line-height 시각 보정 (매우 중요)
공간 계산은 항상 인접 요소의 line-height를 함께 본다. 텍스트 박스는 line-height만큼의 여백을 이미 상하로 내포하기 때문에, 물리적으로 대칭인 padding이 시각적으로 비대칭으로 보인다.

- 상하좌우 균일 padding의 함정: 모달/카드 상단에 텍스트(타이틀), 하단에 버튼(그래픽 요소)이 오는 경우 padding을 20/20/20/20으로 주면 위쪽이 넓어 보인다. line-height가 1.4 이상이면 특히 심함.
  → 보정: top을 한 단계 줄인다. 예: 상 16 / 좌우 20 / 하 20. 또는 상 space-4 / 하 space-5.
- 텍스트 ↔ 텍스트 사이 gap: 두 요소 모두 line-height를 품고 있으므로 gap은 보수적으로(한 단계 작게) 잡는다. 예: 라벨-값 관계는 space-1~2로 충분.
- 텍스트 ↔ 그래픽(아이콘/이미지/버튼) 사이 gap: 그래픽은 line-height 여백이 없으므로 표준 스케일 그대로 쓴다.
- 그래픽 ↔ 그래픽: 필요하면 한 단계 크게. 시각적 밀착감이 강함.

체크리스트: padding/gap을 정할 때 "이 위/아래(왼/오른) 요소가 텍스트인가 그래픽인가?" 를 먼저 판단한 뒤 스케일을 선택할 것.

금지
- 스케일 밖의 임의 px(13px, 18px, 22px 등) 사용 금지. 필요하면 디자인 재검토 신호. (단, line-height 보정으로 상/하 값을 다르게 두는 것은 각각이 토큰 값이면 허용)
- 인접 스케일을 나란히 반복(space-4 옆에 space-5) 금지 — 위계가 사라짐. 최소 2단계 차이. (line-height 보정은 예외)
- 컴포넌트 간 간격을 space-2 이하로 좁히기 금지 — 각각의 hitbox와 시각적 독립성이 무너짐.

관련
- Radius: 컴포넌트 크기(패딩)와 반경은 페어링됨. space-2 패딩엔 radius-md, space-4 패딩엔 radius-lg 근처.
- Typography: line-height는 spacing이 아닌 타이포 시스템으로 별도 관리. spacing으로 줄간격 조절 금지. 단, spacing 설계 시 인접 텍스트의 line-height 값을 반드시 참조.
- Breakpoint: 페이지 좌우 여백은 모바일 space-6, 데스크톱 space-8~12로 반응형 스왑.`,
};

export const spacingPrompt: Record<string, string> = {
  "space-2": `space-2 (8px)
사용처: 버튼/입력 내부의 텍스트-아이콘 간격, 작은 컴포넌트 내부의 요소 간 gap (예: Chip 내부 아이콘+텍스트, Badge 카운트).
쓰지 말 것: 컴포넌트 간의 간격 (→ 최소 space-4), 카드 내부 큰 블록 사이 (→ space-4~6).
이유: 내부 밀도를 유지하는 최소 단위. 이 값보다 작으면 hitbox가 무너지고, 크면 컴포넌트가 헐거워짐.`,

  "space-4": `space-4 (16px)
사용처: 카드 내부 기본 패딩, 폼 필드 간 세로 간격, 모달의 헤더-본문/본문-푸터 사이, 리스트 아이템 내부 좌우 패딩.
쓰지 말 것: 페이지 최상단 여백 (→ space-12+), 관련 없는 섹션 사이 (→ space-8+), 버튼 내부 (→ space-2~3).
이유: "관련 있는 요소들의 표준 간격". 이 값이 UI 전반의 기본 리듬을 만든다. 애매하면 이 값부터 시도.`,

  "space-6": `space-6 (24px)
사용처: 한 섹션 안에서 하위 블록들 사이 간격 (예: 카드 헤더-본문 큰 분리), 페이지 좌우 여백 (모바일), 사이드바와 본문 사이.
쓰지 말 것: 컴포넌트 내부 요소 사이 (→ space-3~4), 무관한 섹션 사이 (→ space-8+).
이유: "같은 문맥이지만 시각적으로 구분되어야 하는 블록"의 간격. space-4보다 명확한 위계를 만들지만 완전 분리는 아님.`,

  "space-8": `space-8 (32px)
사용처: 페이지 내 서로 다른 섹션(예: KPI 카드 그룹 → 테이블) 사이의 세로 간격, 페이지 좌우 여백 (데스크톱).
쓰지 말 것: 카드 내부 (→ space-4~6), 나열되는 아이템 간격 (→ space-2~4).
이유: "문맥이 바뀌는 지점"의 신호. 이 이상 벌어지면 사용자가 아래로 스크롤하며 별개 페이지처럼 느낀다.`,
};

export const radius: [string, number, string][] = [
  ["radius-none", 0, "표/시트 셀"],
  ["radius-xs", 6, "Chip, Badge"],
  ["radius-sm", 6, "Input, Button (기본)"],
  ["radius-md", 8, "Card"],
  ["radius-lg", 12, "Modal, Popover"],
  ["radius-xl", 16, "대형 카드"],
  ["radius-2xl", 20, "히어로 카드"],
  ["radius-3xl", 24, "랜딩 · 대형 오버레이"],
  ["radius-full", 9999, "Avatar, Pill"],
];

/** [Token, Size, LineHeight, Weight(400|500|600|700), 용도] */
export const type: [string, number, number, number, string][] = [
  ["text-xs", 13, 20, 400, "Caption, Helper"],
  ["text-sm", 14, 22, 400, "Body Small, Table"],
  ["text-base", 15.5, 26, 400, "Body (기본)"],
  ["text-lg", 18, 29, 400, "Lead"],
  ["text-xl", 20, 30, 400, "H4"],
  ["text-2xl", 24, 32, 400, "H3"],
  ["text-3xl", 30, 38, 400, "H2"],
  ["text-4xl", 36, 42, 400, "H1"],
  ["text-5xl", 48, 50, 400, "Display"],
  ["label-sm", 14, 22, 500, "Button sm"],
  ["label-md", 15, 22, 500, "Button md/lg, MenuItem"],
];

/** 그레이 위계 (진함 → 옅음). 판톤식 웨이트 카드로 렌더. */
/** Gray Scale — 이름은 role 기반(FG/Border/BG × 강도).
 *  실제 밝기는 Mode에 따라 반전되므로 "Black/White" 같은 절대 명칭은 쓰지 않음. */
export const grayScale: {
  token: string;
  cssVar: string;
  name: string;
  role: string;
  group: "fg" | "border" | "bg";
}[] = [
  { token: "fg-strong",    cssVar: "--fg-strong",     name: "FG Strong",   role: "헤딩·강조 텍스트",           group: "fg" },
  { token: "fg",           cssVar: "--fg",            name: "FG",          role: "본문 텍스트",                group: "fg" },
  { token: "fg-muted",     cssVar: "--fg-muted",      name: "FG Muted",    role: "설명·아이콘·부제",           group: "fg" },
  { token: "fg-subtle",    cssVar: "--fg-subtle",     name: "FG Subtle",   role: "힌트·placeholder",           group: "fg" },
  { token: "fg-disabled",  cssVar: "--fg-disabled",   name: "FG Disabled", role: "비활성 텍스트",              group: "fg" },
  { token: "border-strong",cssVar: "--border-strong", name: "Border Strong", role: "강조 테두리·hover",        group: "border" },
  { token: "border",       cssVar: "--border",        name: "Border",      role: "디바이더·인풋·모달 테두리",   group: "border" },
  { token: "bg-muted",     cssVar: "--bg-muted",      name: "BG Muted",    role: "카드 배경·hover 표면",       group: "bg" },
  { token: "bg-subtle",    cssVar: "--bg-subtle",     name: "BG Subtle",   role: "서브 배경",                  group: "bg" },
  { token: "bg",           cssVar: "--bg",            name: "BG",          role: "페이지 배경",                group: "bg" },
];

export const colors: [string, string, string][] = [
  ["primary", "var(--primary)", "브랜드 컬러 · 주 액션 · 링크 · focus ring · 차트 강조"],
  ["success", "var(--success)", "성공"],
  ["warning", "var(--warning)", "경고"],
  ["destructive", "var(--destructive)", "삭제, 위험"],
  ["info", "var(--info)", "정보"],
];

export const colorVarMap: Record<string, string> = {
  primary: "--primary",
  success: "--success",
  warning: "--warning",
  destructive: "--destructive",
  info: "--info",
};

export const shadows: [string, string, string][] = [
  ["shadow-xs", "var(--shadow-xs)", "미세 depth (Input focus 등)"],
  ["shadow-sm", "var(--shadow-sm)", "Card 기본"],
  ["shadow-md", "var(--shadow-md)", "Dropdown, Popover"],
  ["shadow-lg", "var(--shadow-lg)", "Modal"],
  ["shadow-xl", "var(--shadow-xl)",],
  ["shadow-inner", "var(--shadow-inner)", "눌린 상태"],
];

export const motion: [string, string, string, string][] = [
  ["duration-fast", "", "hover, tap", "fast"],
  ["duration-base", "", "기본 트랜지션", "base"],
  ["duration-slow", "", "오버레이 등장", "slow"],
  ["duration-slower", "", "페이지 전환", "slower"],
];

export const zIndex: [string, number, string][] = [
  ["z-base", 0, "기본"],
  ["z-docked", 10, "Sticky header"],
  ["z-dropdown", 1000, "Dropdown, Select"],
  ["z-sticky", 1100, "Sticky element"],
  ["z-overlay", 1300, "Dim overlay"],
  ["z-modal", 1400, "Modal, Drawer"],
  ["z-popover", 1500, "Popover, Hover Card"],
  ["z-toast", 1600, "Toast"],
  ["z-tooltip", 1700, "Tooltip (최상단)"],
];

export const breakpoints: [string, number][] = [
  ["sm", 640], ["md", 768], ["lg", 1024], ["xl", 1280], ["2xl", 1536],
];

/**
 * 구현된 컴포넌트 → 상세 페이지 경로 slug 매핑.
 * 여기에 등록된 컴포넌트만 링크 + "ready" 상태로 표시됨.
 * slug는 `/components/{slug}` 아래의 실제 라우트와 일치해야 함.
 */
export const componentSlugs: Record<string, string> = {
  Button: "general/button",
  "Split Button": "general/split-button",
  "Icon Button": "general/icon-button",
  "Menu Item": "general/menu-item",
  Badge: "general/badge",
  Avatar: "general/avatar",
  Tooltip: "general/tooltip",
  Shortcut: "general/shortcut",
  "Filter Button": "general/filter-button",
  Chip: "general/chip",
  Toolbar: "general/toolbar",
  Input: "input/input",
  Textarea: "input/textarea",
  Form: "input/input",
  Select: "input/select",
  Checkbox: "input/checkbox",
  "Radio Group": "input/radio",
  "Selectable Card": "input/selectable-card",
  "Choice Card": "input/choice-card",
  Switch: "input/switch",
  Slider: "input/slider",
  "Date Picker": "input/date-picker",
  "Time Picker": "input/time-picker",
  Tabs: "nav/tabs",
  Breadcrumb: "nav/breadcrumb",
  Sidebar: "nav/sidebar",
  "Sidebar Split": "nav/sidebar-split",
  Topbar: "nav/topbar",
  "Identity Button": "nav/identity-button",
  Pagination: "nav/pagination",
  "App Frame": "layout/app-frame",
  Stepper: "nav/stepper",
  "Context Menu": "overlay/context-menu",
  Callout: "feedback/callout",
  Modal: "feedback/modal",
  Drawer: "feedback/drawer",
  Toast: "feedback/toast",
  "Table Header": "data/table-header",
  "Table Row": "data/table-row",
  "Table Row Select": "data/table-row-select",
  "Table Row Edit": "data/table-row-edit",
  "Event Chip": "data/event-chip",
  "List Item": "data/list-item",
  "Metric Card": "data/metric-card",
  "Gallery Item": "data/gallery-item",
  "Empty State": "data/empty-state",
  "Progress Bar": "feedback/progress-bar",
  Spinner: "feedback/spinner",
  "File Icon": "data/file-icon",
  "Attachment Thumb": "chat/attachment-thumb",
  "Attachment Item": "data/attachment-item",
  "Quotation Bar": "chat/quotation-bar",
  "Chat Input": "chat/chat-input",
  "Bubble": "chat/bubble",
  "Message Actions": "chat/message-actions",
  "User Message": "chat/user-message",
  "AI Message": "chat/ai-message",
  "Code Block": "chat/code-block",
  "Message Quote": "chat/message-quote",
  "Message Sources": "chat/message-sources",
  "Message Table": "chat/message-table",
  "Message State": "chat/message-state",
  "Generated Image": "chat/generated-image",
};

/** 작업중 — 사이드바에서 "작업중" 뱃지로 표시되고,
 *  외부에서 import하면 pre-commit 훅(scripts/lint-wip.mjs)이 차단한다.
 *  문서 라우트(web/app/components/**)와 컴포넌트 자신의 폴더는 허용. */
export const componentsInProgress: Set<string> = new Set([]);

export const components: { id: string; title: string; items: string[] }[] = [
  {
    id: "general",
    title: "General",
    items: [
      "Button", "Split Button", "Icon Button", "Menu Item", "Toolbar", "Badge", "Avatar",
      "Tooltip", "Shortcut", "Filter Button", "Chip", "Separator", "Skeleton", "Aspect Ratio",
      "Code Block",
    ],
  },
  {
    id: "input",
    title: "Form / Input",
    items: [
      "Input", "Input OTP", "Textarea", "Select", "Combobox", "Multi-Select",
      "Checkbox", "Radio Group", "Selectable Card", "Choice Card", "Switch", "Slider",
      "Date Picker", "Time Picker",
      "File Upload",
    ],
  },
  {
    id: "data",
    title: "Data Display",
    items: [
      "Table Header", "Table Row", "Table Row Select", "Table Row Edit",
      "List Item", "Metric Card", "Gallery Item", "File Icon", "Attachment Item", "Event Chip",
      "Empty State", "Description List", "Timeline",
    ],
  },
  {
    id: "nav",
    title: "Navigation",
    items: [
      "App Frame", "Tabs", "Breadcrumb", "Sidebar", "Sidebar Split", "Topbar", "Identity Button", "Pagination",
      "Stepper",
    ],
  },
  {
    id: "feedback",
    title: "Feedback",
    items: [
      "Modal", "Alert Dialog", "Drawer", "Popover", "Hover Card",
      "Toast", "Callout", "Progress Bar", "Spinner",
    ],
  },
  {
    id: "overlay",
    title: "Overlay / Menu",
    items: [
      "Context Menu", "Collapsible", "Toggle Group",
    ],
  },
  {
    id: "chat-input",
    title: "AI Chat / 입력",
    items: [
      "Chat Input", "Quotation Bar",
    ],
  },
  {
    id: "chat-attachment",
    title: "AI Chat / 첨부",
    items: [
      "Attachment Thumb", "Generated Image",
    ],
  },
  {
    id: "chat-message",
    title: "AI Chat / 메시지",
    items: [
      "Bubble", "User Message", "AI Message", "Message State", "Message Actions",
    ],
  },
  {
    id: "chat-content",
    title: "AI Chat / 메시지 콘텐츠",
    items: [
      "Message Quote", "Message Sources", "Message Table",
    ],
  },
  {
    id: "chat-shell",
    title: "AI Chat / 쉘",
    items: [
      "Chat Sidebar",
    ],
  },
];
