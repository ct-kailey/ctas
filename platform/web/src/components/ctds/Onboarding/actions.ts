"use server";

/**
 * 온보딩 완료 시 플젝 파일에 선택을 영구 반영하는 server action.
 *
 * CTDS는 "사용자가 자기 플젝에 복사해서 쓰는" 모델. `npx ctds init`으로 설치하면
 * 이 서버 액션이 사용자 플젝의 /ctds 라우트에 심어지고, "적용" 버튼이 눌리면
 * 사용자 플젝 루트에 두 파일이 쓰인다:
 *
 *   1) ctds.config.json  — 축 값 JSON. 머신 리더블 소스.
 *                           ThemeController가 import해서 SSR 초기값으로 사용.
 *                           AI 에이전트(Claude Code 등)도 이걸 읽어서 축 참조.
 *   2) DESIGN.md         — 축 값 + 테마 산문 요약. 사람·AI 모두 읽는 설명.
 *
 * layout.tsx 자동 패치는 하지 않음 — 사용자 플젝마다 구조가 달라 정규식 치환이
 * 깨지기 쉬움. ThemeController가 ctds.config.json을 initialConfig prop으로
 * 받으면 됨.
 *
 * 로컬 dev 환경에서만 돌아간다는 가정. 프로덕션 서버리스에서는 FS 쓰기 거부.
 */

import { writeFile, access, readFile } from "node:fs/promises";
import { join, dirname, parse } from "node:path";
import type {
  DensityValue,
  IconFamily,
  LangValue,
  MotionValue,
  PaletteValue,
  ShapeValue,
  VoiceValue,
} from "../_data";

export type AppliedConfig = {
  theme: "none" | "pure" | "spare" | "expressive";
  mode: "light" | "dark";
  palette: PaletteValue;
  hue: number;
  accentHue?: number | null;
  shape: ShapeValue;
  density: DensityValue;
  motion: MotionValue;
  iconFamily: IconFamily;
  voice: VoiceValue;
  lang: LangValue;
  focusRing: "on" | "off";
  /** 참고용 메타. */
  appliedAt: string;
};

export type ApplyResult =
  | { ok: true; files: string[] }
  | { ok: false; error: string; files: string[] };

const TARGET_FILES = ["ctds.config.json", "DESIGN.md"] as const;

/**
 * 사용자 플젝 루트 결정. Next.js dev server의 process.cwd()가 꼭 플젝 루트가 아님:
 * - 모노레포에서 `web/`에 Next.js 있으면 cwd가 web/이 됨 (CTDS 레포 자체가 그런 경우)
 * - pnpm/yarn workspaces에서도 비슷
 * - 사용자가 자기 플젝 루트에 CTDS를 설치해 /ctds를 심은 경우 cwd=플젝루트가 맞음
 *
 * 로직:
 * 1) cwd에서 시작해 위로 올라가며 모든 package.json 수집
 * 2) 가장 바깥쪽 package.json 디렉토리를 "진짜 프로젝트 루트"로 선택
 *    - 보통 사용자 플젝: 바로 cwd에 package.json 하나뿐 → cwd 선택 (OK)
 *    - 모노레포/workspaces: 바깥에 workspace root package.json 발견 → 그걸 선택
 *    - CTDS 자기 레포: web/package.json과 루트 package.json 둘 다 → 루트 선택
 * 3) 아무것도 못 찾으면 cwd 폴백
 */
async function findProjectRoot(startDir: string): Promise<string> {
  const { root: fsRoot } = parse(startDir);
  const pkgDirs: string[] = [];
  let dir = startDir;
  while (true) {
    const pkgPath = join(dir, "package.json");
    try {
      await readFile(pkgPath, "utf8");
      pkgDirs.push(dir);
    } catch {
      // package.json 없거나 파싱 실패 — 그냥 넘어감
    }
    if (dir === fsRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // pkgDirs는 cwd → 상위 순이라 마지막이 가장 바깥.
  return pkgDirs.length > 0 ? pkgDirs[pkgDirs.length - 1] : startDir;
}

const PROJECT_ROOT = () => findProjectRoot(process.cwd());

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 적용 전에 호출해서 기존에 어떤 파일이 있는지 확인. 다이얼로그에서 "덮어쓸래?" 묻는 용. */
export async function checkExistingFiles(): Promise<{ existing: string[] }> {
  const root = await PROJECT_ROOT();
  const existing: string[] = [];
  for (const f of TARGET_FILES) {
    if (await fileExists(join(root, f))) existing.push(f);
  }
  return { existing };
}

/** 두 아티팩트를 쓴다. 하나라도 실패하면 그 지점에서 중단하고 어디까지 썼는지 리턴.
 *  overwrite=false(기본값)에서 기존 파일 있으면 거부. 호출자가 명시적으로 덮어쓰기 승인하면 true. */
export async function applyOnboarding(
  config: AppliedConfig,
  options: { overwrite?: boolean } = {}
): Promise<ApplyResult> {
  // 프로덕션 서버리스에서 /ctds가 실수로 노출됐을 때 FS 쓰기 거부.
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      error:
        "/ctds 는 로컬 개발 환경 전용이에요. 프로덕션 빌드에선 파일을 쓸 수 없습니다. 로컬에서 `npm run dev` 로 돌려주세요.",
      files: [],
    };
  }

  if (!options.overwrite) {
    const { existing } = await checkExistingFiles();
    if (existing.length > 0) {
      return {
        ok: false,
        error: `이미 존재: ${existing.join(", ")}. 덮어쓰려면 확인 후 다시 적용해주세요.`,
        files: [],
      };
    }
  }

  const root = await PROJECT_ROOT();
  const written: string[] = [];
  try {
    const configPath = join(root, "ctds.config.json");
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    written.push("ctds.config.json");

    const designPath = join(root, "DESIGN.md");
    await writeFile(designPath, renderDesignMd(config), "utf8");
    written.push("DESIGN.md");

    return { ok: true, files: written };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      files: written,
    };
  }
}

/** DESIGN.md 생성. 테마가 "none"이면 커스텀 조합 설명, 그 외엔 테마 프롬프트 기반. */
function renderDesignMd(c: AppliedConfig): string {
  const date = c.appliedAt.slice(0, 10);
  const themeLine =
    c.theme === "none"
      ? "**직접 조합** — 테마 preset 없이 사용자가 각 축을 직접 선택했습니다."
      : `**${c.theme}** 테마 기반. 자세한 원칙·Do/Don't는 [prompts/themes/${c.theme}.md](prompts/themes/${c.theme}.md) 참조.`;

  const hex =
    c.accentHue != null
      ? `· 보조 hue=${c.accentHue}°`
      : "";

  return `# 디자인 결정

> 생성일: ${date} · 온보딩 적용 결과
> 머신 리더블 소스는 [ctds.config.json](ctds.config.json)에.

${themeLine}

## 축 값

| Axis | Value | 설명 |
|---|---|---|
| Mode | \`${c.mode}\` | ${c.mode === "light" ? "밝은 배경" : "어두운 배경"} |
| Palette | \`${c.palette}\` | ${paletteDesc(c.palette)} |
| Hue | \`${c.hue}°\` ${hex} | 브랜드 색상 축 |
| Shape | \`${c.shape}\` | ${shapeDesc(c.shape)} |
| Density | \`${c.density}\` | ${densityDesc(c.density)} |
| Motion | \`${c.motion}\` | ${motionDesc(c.motion)} |
| Icon Family | \`${c.iconFamily}\` | 아이콘 세트 |
| Voice | \`${c.voice}\` | ${voiceDesc(c.voice)} |
| Lang | \`${c.lang}\` | UI 언어 |
| Focus Ring | \`${c.focusRing}\` | 포커스 링 ${c.focusRing === "on" ? "표시" : "숨김"} |

## AI 에이전트에게

이 프로젝트는 위 축 값으로 고정됐습니다. 컴포넌트·페이지를 생성할 때:

- **하드코딩 금지** — 색/간격/radius/shadow/motion은 전부 CTDS 토큰 경유.
- 축 값은 [ctds.config.json](ctds.config.json)이 소스 오브 트루스.
  런타임엔 \`ThemeController\`가 관리하며, 사용자가 축을 바꿀 때마다 \`<html data-*>\` 속성이 갱신됩니다.
- 토큰·축의 상세 규칙은 [prompts/](prompts/) 하위 문서들을 참조하세요.
${
  c.theme === "none"
    ? ""
    : `- 이 프로젝트의 "성격"은 [prompts/themes/${c.theme}.md](prompts/themes/${c.theme}.md)의 Do/Don't·Signature·Negative에 정의돼 있습니다.`
}

## 변경 이력

- ${date}: 온보딩 적용
`;
}

function paletteDesc(v: PaletteValue): string {
  return {
    mono: "채도 0 · 무채색 지배 · primary는 소수 지점만",
    vivid: "원본 hue · 진한 채도",
    standard: "원본 hue · 중간 채도 (기본)",
    calm: "warm shift · 낮은 채도",
    pastel: "cool shift · 매우 밝은 명도",
  }[v];
}
function shapeDesc(v: ShapeValue): string {
  return { soft: "말랑, 캐주얼", standard: "표준", crisp: "딱딱, 전문" }[v];
}
function densityDesc(v: DensityValue): string {
  return {
    compact: "높은 밀도 (85%)",
    default: "표준 (100%)",
    comfortable: "낮은 밀도 (106%)",
  }[v];
}
function motionDesc(v: MotionValue): string {
  return {
    bouncy: "쫀득한 오버슛",
    standard: "짧고 매끈",
    calm: "차분",
    none: "애니 없음",
  }[v];
}
function voiceDesc(v: VoiceValue): string {
  return {
    formal: "격식체 (입니다)",
    neutral: "표준 존대",
    casual: "친근체",
  }[v];
}

