/**
 * Lottie 로더 매니페스트.
 *
 * `name`: Spinner variant로 쓰는 식별자 (`lottie-<name>` 또는 매니페스트의 name 그대로)
 * `path`: /public 밑 상대 경로
 * `colorBind`:
 *   true  — 단색 로티. 런타임에 모든 색을 currentColor로 치환해 Palette/Hue 축을 추종.
 *   false — 다색 로티. 원본 색 유지 (브랜드 톤 또는 작가 의도).
 *
 * 모든 Spinner 로티는 정사각형 bounds로 강제 렌더(SVG preserveAspectRatio=xMidYMid slice).
 * 원본 캔버스 비율이 1:1이 아니어도 bounds는 항상 1:1. 비정사각 로티는 가장자리가
 * 잘릴 수 있으므로 중요한 디테일이 중앙에 모여있는 로티만 등록.
 */

export type LottieName =
  | "rabbit"
  | "infiniti"
  | "dots"
  | "spinner"
  | "clock"
  | "cosmos"
  | "image-gen"
  | "loading-square";

export type LottieManifestEntry = {
  name: LottieName;
  path: string;
  colorBind: boolean;
  /** 원본 캔버스가 bounds를 다 채우지 못할 때(여백이 커 보일 때) scale-up 보정.
   *  1 = 원본 그대로. 비정사각 캔버스가 cover로 잘린 뒤 추가 확대도 가능.
   *  overflow:hidden이 켜져있어 bounds 밖은 잘림. */
  visualScale?: number;
  /** 캔버스 안에서 그림이 중앙에서 벗어나 있을 때 translate 보정. 단위는 bounds 비율(0~1 권장). */
  offsetX?: number;
  offsetY?: number;
  /** 한줄 설명 — showcase · 자동완성용 */
  description: string;
};

export const LOTTIE_MANIFEST: Record<LottieName, LottieManifestEntry> = {
  rabbit: {
    name: "rabbit",
    path: "/lottie/rabbit.json",
    colorBind: true,
    visualScale: 1.4,
    description: "뛰어가는 토끼. 긴 작업·AI 생성 대기",
  },
  infiniti: {
    name: "infiniti",
    path: "/lottie/infiniti.json",
    colorBind: true,
    visualScale: 3.2,
    description: "무한 루프 선. 네트워크·동기화",
  },
  dots: {
    name: "dots",
    path: "/lottie/dots.json",
    colorBind: true,
    visualScale: 0.95,
    offsetY: 0.025,
    description: "그라데이션 dot 흐름. 포인트 로더",
  },
  spinner: {
    name: "spinner",
    path: "/lottie/spinner.json",
    colorBind: true,
    visualScale: 2,
    description: "표준 라인 스피너",
  },
  clock: {
    name: "clock",
    path: "/lottie/clock.json",
    colorBind: true,
    visualScale: 3.8,
    description: "회전 시계 바늘. 처리 대기·타임아웃",
  },
  cosmos: {
    name: "cosmos",
    path: "/lottie/cosmos.json",
    colorBind: true,
    visualScale: 1.2,
    description: "그라데이션 궤도. 몽환적·온보딩",
  },
  "image-gen": {
    name: "image-gen",
    path: "/lottie/image-gen.json",
    colorBind: true,
    visualScale: 1.1,
    description: "이미지 생성 대기. AI 이미지",
  },
  "loading-square": {
    name: "loading-square",
    path: "/lottie/loading-square.json",
    colorBind: true,
    visualScale: 3.5,
    description: "회전하는 사각형. 미니멀 처리 대기",
  },
};

export const LOTTIE_NAMES = Object.keys(LOTTIE_MANIFEST) as LottieName[];
