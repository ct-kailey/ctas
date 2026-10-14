"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "../Badge";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { FilterButton } from "../FilterButton";
import { Input } from "../Input";
import { SelectableCard } from "../SelectableCard";
import { Slider } from "../Slider";
import { Stepper } from "../Stepper";
import { hexToOklch, isValidHex } from "../_color";
import { palettePresets, type PaletteValue } from "../_data";
import { useTheme } from "../ThemeController";
import { OnboardingAxisPanel } from "./OnboardingAxisPanel";
import { applyOnboarding, checkExistingFiles } from "./actions";
import { PresetsGallery } from "./PresetsGallery";
import { LayoutBuilder } from "./LayoutBuilder";
import { DocsIndex } from "./DocsIndex";
import {
  DENSITY_CHOICES,
  LAYOUT_CHOICES,
  PALETTE_CHOICES,
  THEME_CHOICES,
  THEME_PRESETS,
  THEME_VIBE_FALLBACK,
  VIBE_CHOICES,
  type DensityChoiceId,
  type LayoutId,
  type ThemeId,
  type VibeId,
} from "./wizardData";
import styles from "./Onboarding.module.css";
import "./palette.css";

type StepKey = "theme" | "vibe" | "color" | "density" | "layout" | "summary";

type Answers = {
  theme: ThemeId | null;
  vibe: VibeId | null;
  palette: PaletteValue | null;
  hue: number | null;
  hueSource: "preset" | "hex" | null;
  brandHex: string;
  mode: "light" | "dark";
  density: DensityChoiceId | null;
  layout: LayoutId | null;
};

const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: "theme", title: "디자인 스타일", hint: "시작 번들. 축 디폴트 + DESIGN.md가 함께 적용." },
  { key: "vibe", title: "프로덕트 분위기", hint: "코너 · 모션 · 강조색이 세트로 결정." },
  { key: "density", title: "정보 밀도", hint: "한 화면에 얼마나 빽빽하게 담을지." },
  { key: "color", title: "컬러 & 톤", hint: "팔레트 선택 + 브랜드 색." },
  { key: "layout", title: "레이아웃", hint: "사이드바 · 탑바 조합." },
  { key: "summary", title: "요약 & 적용", hint: "선택을 확인하고 프로젝트에 반영." },
];

export function OnboardingPage() {
  const {
    theme,
    setTheme,
    palette: currentPalette,
    hue: currentHue,
    accentHue: currentAccentHue,
    shape: currentShape,
    density: currentDensity,
    motionMode: currentMotion,
    iconFamily: currentIconFamily,
    setShape,
    setMotionMode,
    setPalette,
    setHue,
    setDensity,
    applyPreset,
    voice,
  } = useTheme();
  const [mode, setMode] = useState<"wizard" | "free">("wizard");
  const [stepIdx, setStepIdx] = useState(0);
  /** 적용 확인 다이얼로그 상태. 적용 진행 중/완료/실패까지 담는다.
   *  confirm 단계에서 existing(이미 있는 파일 목록)이 비어있지 않으면 "덮어쓸래?" 플로우. */
  const [applyState, setApplyState] = useState<
    | { phase: "idle" }
    | { phase: "confirm"; existing: string[] }
    | { phase: "applying" }
    | { phase: "done"; files: string[] }
    | { phase: "error"; message: string; files: string[] }
  >({ phase: "idle" });
  const [answers, setAnswers] = useState<Answers>({
    theme: "none",
    vibe: "balanced",
    palette: "standard",
    hue: 210,
    hueSource: "preset",
    brandHex: "",
    mode: "light",
    density: "default",
    layout: "topbar-sidebar",
  });

  const applyTheme = (t: ThemeId) => {
    setAnswers((a) => ({ ...a, theme: t }));
    // "none" 은 이후 축을 사용자가 직접 선택.
    // pure/spare/expressive는 prompts/themes/<slug>.md의 Preset을 자동 매핑하고
    // vibe/density도 테마가 커버하므로 answers에 미리 세팅 → vibe 단계 skip 가능.
    if (t === "none") return;
    const preset = THEME_PRESETS[t];
    const vibeFallback = THEME_VIBE_FALLBACK[t];
    applyPreset(preset);
    setAnswers((a) => ({
      ...a,
      theme: t,
      vibe: vibeFallback,
      density: preset.density,
      mode: preset.mode,
    }));
  };

  const applyMode = (m: "light" | "dark") => {
    setTheme(m);
    setAnswers((a) => ({ ...a, mode: m }));
  };

  const applyVibe = (v: VibeId) => {
    const c = VIBE_CHOICES.find((x) => x.id === v);
    if (!c) return;
    setShape(c.values.shape);
    setMotionMode(c.values.motion);
    // serious vibe는 palette=mono를 승계.
    if (c.values.palette) {
      setPalette(c.values.palette);
      setAnswers((a) => ({ ...a, vibe: v, palette: c.values.palette! }));
      return;
    }
    setAnswers((a) => ({ ...a, vibe: v }));
  };
  const applyPalette = (v: PaletteValue) => {
    setPalette(v);
    setAnswers((a) => ({ ...a, palette: v }));
  };
  const applyHue = (h: number) => {
    setHue(h);
    setAnswers((a) => ({ ...a, hue: h, hueSource: "preset", brandHex: "" }));
  };
  /**
   * hex 입력 시 그 색을 그대로 재현.
   * 축이 L/C는 palette preset에서, hue는 slider에서 오므로 L/C에 가장 가까운
   * preset을 매칭하고 base hue를 preset.hueShift만큼 역보정한다.
   * 결과 oklch(L_preset, C_preset, baseHue + hueShift)가 입력 hex와 가장 근접.
   */
  const applyBrandHex = (hex: string) => {
    const trimmed = hex.trim();
    if (!trimmed) {
      // hex 비우기 — 수동 모드 복귀. 축은 그대로 두고 answers만 정리.
      setAnswers((a) => ({ ...a, brandHex: "", hueSource: "preset" }));
      return;
    }
    if (!isValidHex(trimmed)) {
      setAnswers((a) => ({ ...a, brandHex: trimmed }));
      return;
    }
    const oklch = hexToOklch(trimmed);
    if (!oklch) {
      setAnswers((a) => ({ ...a, brandHex: trimmed }));
      return;
    }
    // L/C 평면에서 가장 가까운 preset. chroma 가중치 ↑↑ (×3) — 사용자가 지정한 hex의
    // 채도가 preset 재현에서 톤 "느낌"을 가장 좌우. 가중치가 낮으면 인디고(#5865F2)
    // 같이 chroma가 꽤 있는 색이 standard(chroma 0.14)로 매핑되면서 밝고 흐린 하늘색이
    // 돼 사용자가 "형광 하늘색이 됐다"고 느낀다.
    const nearest = palettePresets.reduce((best, p) => {
      const d =
        (p.lightness - oklch.l) ** 2 + ((p.chroma - oklch.c) * 3) ** 2;
      const bestD =
        (best.lightness - oklch.l) ** 2 + ((best.chroma - oklch.c) * 3) ** 2;
      return d < bestD ? p : best;
    }, palettePresets[0]);
    const baseHue = ((Math.round(oklch.h - nearest.hueShift) % 360) + 360) % 360;
    setPalette(nearest.id);
    setHue(baseHue);
    setAnswers((a) => ({
      ...a,
      brandHex: trimmed,
      palette: nearest.id,
      hue: baseHue,
      hueSource: "hex",
    }));
  };
  const applyDensity = (v: DensityChoiceId) => {
    setDensity(v);
    setAnswers((a) => ({ ...a, density: v }));
  };

  /** 적용 흐름: 1) 확인 다이얼로그 open (기존 파일 조회) → 2) 사용자 확인 → 3) 미리보기 적용 + 파일 쓰기 */
  const openApplyConfirm = async () => {
    const { existing } = await checkExistingFiles();
    setApplyState({ phase: "confirm", existing });
  };

  const runApply = async () => {
    const layoutChoice = LAYOUT_CHOICES.find((c) => c.id === answers.layout);
    if (!answers.theme || !layoutChoice) {
      setApplyState({ phase: "error", message: "선택값이 비어있습니다", files: [] });
      return;
    }
    // confirm 단계에서 기존 파일 발견했었다면 overwrite=true로 명시 승인 전달
    const overwrite =
      applyState.phase === "confirm" && applyState.existing.length > 0;
    setApplyState({ phase: "applying" });
    // ThemeController 현재값이 소스 오브 트루스 — Summary 고급설정에서 바꾼 값이
    // answers에는 반영되지 않으므로 useTheme() 현재값을 그대로 쓴다.
    // 파일 쓰기 (server action)
    // server action이 reject되면(네트워크 끊김·배포환경·내부 throw 등) applying에 멈춰서
    // 무한로딩처럼 보이므로 반드시 try/catch로 감싸서 error phase로 떨어뜨린다.
    try {
      const result = await applyOnboarding(
        {
          theme: answers.theme,
          mode: answers.mode,
          palette: currentPalette,
          hue: currentHue,
          accentHue: currentAccentHue,
          shape: currentShape,
          density: currentDensity,
          motion: currentMotion,
          iconFamily: currentIconFamily,
          voice,
          lang: "ko",
          layout: {
            id: layoutChoice.id,
            sidebar: layoutChoice.sidebar,
            topbar: layoutChoice.topbar,
            appFrameLayout: layoutChoice.appFrameLayout,
            tabs: layoutChoice.tabs,
          },
          appliedAt: new Date().toISOString(),
        },
        { overwrite }
      );
      if (result.ok) {
        // 적용 성공 시 과거 축 값 흔적 제거. 다음 리프레시부터 ctds.config.json이
        // 유일한 소스가 되게 — 안 지우면 과거 ctds-mode=dark 등이 config을 덮어씀.
        try {
          [
            "ctds-mode",
            "ctds-palette",
            "ctds-hue",
            "ctds-accent-hue",
            "ctds-shape",
            "ctds-density",
            "ctds-motion",
            "ctds-icon-family",
            "ctds-lang",
            "ctds-voice",
          ].forEach((k) => localStorage.removeItem(k));
        } catch {}
        setApplyState({ phase: "done", files: result.files });
      } else {
        setApplyState({
          phase: "error",
          message: result.error,
          files: result.files,
        });
      }
    } catch (e) {
      setApplyState({
        phase: "error",
        message:
          e instanceof Error
            ? `적용 중 예외: ${e.message}`
            : `적용 중 알 수 없는 오류: ${String(e)}`,
        files: [],
      });
    }
  };

  // 페이지 진입 시 default answers를 축에 즉시 반영 (첫 렌더 톤 통일).
  useEffect(() => {
    if (answers.vibe) applyVibe(answers.vibe);
    if (answers.palette) setPalette(answers.palette);
    if (answers.hue != null) setHue(answers.hue);
    if (answers.density) setDensity(answers.density);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 온보딩은 설정 전 단계라 OS prefers-color-scheme이나 저장된 ctds-mode가 dark여도
  // 무조건 light로 고정 (SelectableCard 안 글자 가독성 확보).
  // theme이 dark로 돌아올 때마다 다시 light로 끌어오는 게 아니라, 마운트 시 한 번만
  // light로 세팅 — 사용자가 온보딩 안에서 축을 바꿔도 ThemeController sync effect가
  // light를 재적용함.
  useEffect(() => {
    if (theme !== "light") setTheme("light");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = STEPS[stepIdx];
  const canGoNext = useMemo(() => {
    if (step.key === "theme") return answers.theme != null;
    if (step.key === "vibe") return answers.vibe != null;
    if (step.key === "color") return answers.palette != null;
    if (step.key === "density") return answers.density != null;
    if (step.key === "layout") return answers.layout != null;
    return true;
  }, [step.key, answers]);

  if (mode === "free") {
    return <FreeMode onBack={() => setMode("wizard")} />;
  }

  return (
    <div className={styles.shell} data-mode="light" data-palette="standard">
      <Rail
        stepIdx={stepIdx}
        answers={answers}
        onStepClick={(idx) => {
          if (idx <= stepIdx || isStepReachable(idx, answers)) setStepIdx(idx);
        }}
        onFreeMode={() => setMode("free")}
      />

      <div className={styles.content}>
          <div className={styles.contentInner}>
            <header className={styles.stepHeader}>
              <span className={styles.stepProgress}>
                {stepIdx + 1} / {STEPS.length}
              </span>
              <h1 className={styles.stepTitle}>{stepTitle(step.key)}</h1>
              <p className={styles.stepLead}>{stepLead(step.key)}</p>
            </header>

            <div className={styles.stepBody}>
            {step.key === "theme" && (
              <ThemeStep value={answers.theme} onChange={applyTheme} />
            )}
            {step.key === "vibe" && (
              <VibeStep value={answers.vibe} onChange={applyVibe} />
            )}
            {step.key === "color" && (
              <ColorStep
                palette={answers.palette}
                hue={answers.hue ?? 210}
                hueSource={answers.hueSource}
                brandHex={answers.brandHex}
                mode={answers.mode}
                onMode={applyMode}
                onPalette={applyPalette}
                onHueChange={applyHue}
                onBrandHex={applyBrandHex}
              />
            )}
            {step.key === "density" && (
              <DensityStep value={answers.density} onChange={applyDensity} />
            )}
            {step.key === "layout" && (
              <LayoutStep
                value={answers.layout}
                onChange={(v) => setAnswers((a) => ({ ...a, layout: v }))}
              />
            )}
            {step.key === "summary" && <SummaryStep answers={answers} />}
            </div>

            <footer className={styles.stepFoot}>
              <div className={styles.stepFootActions}>
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={stepIdx === 0}
                  onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  disabled={!canGoNext}
                  onClick={() => {
                    if (stepIdx === STEPS.length - 1) {
                      openApplyConfirm();
                      return;
                    }
                    setStepIdx((i) => nextStepIdx(i, answers));
                  }}
                  rightIcon={
                    stepIdx === STEPS.length - 1 ? undefined : <Icon name="arrow-right" />
                  }
                >
                  {stepIdx === STEPS.length - 1 ? "이 설정 적용" : "Next"}
                </Button>
              </div>
            </footer>
          </div>
        </div>

        {applyState.phase !== "idle" && (
          <ApplyDialog
            state={applyState}
            onCancel={() => setApplyState({ phase: "idle" })}
            onConfirm={runApply}
          />
        )}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Apply dialog — confirm / applying / done / error
// ────────────────────────────────────────────────────────

type ApplyState =
  | { phase: "confirm"; existing: string[] }
  | { phase: "applying" }
  | { phase: "done"; files: string[] }
  | { phase: "error"; message: string; files: string[] };

function ApplyDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ApplyState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={styles.applyBackdrop} onClick={state.phase === "applying" ? undefined : onCancel}>
      <div
        className={styles.applyModal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {state.phase === "confirm" && (
          <>
            <h2 className={styles.applyTitle}>
              {state.existing.length > 0
                ? "기존 설정을 덮어쓸까요?"
                : "이 설정을 프로젝트에 적용할까요?"}
            </h2>
            {state.existing.length > 0 ? (
              <p className={styles.applyLead}>
                이미 다음 파일이 존재합니다. 적용하면 <strong>덮어쓰여집니다</strong>.
                커밋되지 않은 변경이 있는지 확인하세요.
              </p>
            ) : (
              <p className={styles.applyLead}>
                프로젝트 루트에 다음 두 파일이 생성됩니다. 모두 로컬 파일 작업이고 되돌릴 수 있어요.
              </p>
            )}
            <ul className={styles.applyFileList}>
              <li>
                <code>ctds.config.json</code>
                <span className={styles.applyFileHint}>
                  {state.existing.includes("ctds.config.json")
                    ? "기존 파일 덮어씀 · 축 값 JSON"
                    : "축 값 JSON (AI 에이전트·ThemeController가 참조)"}
                </span>
              </li>
              <li>
                <code>DESIGN.md</code>
                <span className={styles.applyFileHint}>
                  {state.existing.includes("DESIGN.md")
                    ? "기존 파일 덮어씀 · 테마·축 산문 요약"
                    : "테마·축 산문 요약"}
                </span>
              </li>
            </ul>
            <div className={styles.applyActions}>
              <Button variant="secondary" size="md" onClick={onCancel}>
                취소
              </Button>
              <Button variant="primary" size="md" onClick={onConfirm}>
                {state.existing.length > 0 ? "덮어쓰고 적용" : "적용"}
              </Button>
            </div>
          </>
        )}
        {state.phase === "applying" && (
          <>
            <h2 className={styles.applyTitle}>적용 중…</h2>
            <p className={styles.applyLead}>파일을 쓰는 중입니다.</p>
          </>
        )}
        {state.phase === "done" && (
          <>
            <h2 className={styles.applyTitle}>적용 완료</h2>
            <p className={styles.applyLead}>다음 파일이 생성/수정됐어요.</p>
            <ul className={styles.applyFileList}>
              {state.files.map((f) => (
                <li key={f}>
                  <code>{f}</code>
                </li>
              ))}
            </ul>
            <p className={styles.applyLead}>
              이제 Claude Code 등 AI 에이전트가 <code>ctds.config.json</code>·<code>DESIGN.md</code>를 참조해
              이 프로젝트의 축 값에 맞춰 코드를 생성할 수 있습니다.
            </p>
            <div className={styles.applyActions}>
              <Button variant="primary" size="md" onClick={onCancel}>
                닫기
              </Button>
            </div>
          </>
        )}
        {state.phase === "error" && (
          <>
            <h2 className={styles.applyTitle}>적용 실패</h2>
            <p className={styles.applyLead}>
              파일 쓰기 중 오류가 발생했어요. 미리보기(브라우저 톤)는 적용됐지만 파일은 저장되지 않았습니다.
            </p>
            <pre className={styles.applyError}>{state.message}</pre>
            {state.files.length > 0 && (
              <>
                <p className={styles.applyLead}>그 전에 성공한 파일:</p>
                <ul className={styles.applyFileList}>
                  {state.files.map((f) => (
                    <li key={f}>
                      <code>{f}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className={styles.applyActions}>
              <Button variant="secondary" size="md" onClick={onCancel}>
                닫기
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────

function stepTitle(k: StepKey): string {
  if (k === "theme") return "디자인 스타일을 적용할까요?";
  if (k === "vibe") return "이 프로덕트는 어떤 톤인가요?";
  if (k === "color") return "컬러는 어떻게 갈까요?";
  if (k === "density") return "화면에 정보가 얼마나 많나요?";
  if (k === "layout") return "어떤 레이아웃이 어울릴까요?";
  return "이렇게 설정할게요";
}

function stepLead(k: StepKey): string {
  if (k === "theme")
    return "스타일을 고르면 축 디폴트와 DESIGN.md가 함께 적용돼요. 축은 뒤에서 자유롭게 바꿀 수 있어요.";
  if (k === "vibe") return "가장 가까운 하나만 골라주세요. Shape · Motion · Icon Weight가 세트로 결정돼요.";
  if (k === "color")
    return "먼저 팔레트를 고르고, 그 다음 브랜드 색을 슬라이더로 조정하거나 hex로 직접 넣어주세요.";
  if (k === "density") return "한 화면에 담을 정보량. Density 축이 결정돼요.";
  if (k === "layout") return "쓰임새에 맞는 사이드바·탑바 조합.";
  return "선택을 확인하고 프로젝트에 적용하세요. 언제든 자유 조정으로 세부 축을 바꿀 수 있어요.";
}

/**
 * step 도달 가능 여부. STEPS 순서가 바뀌어도 안전하도록 key 기반으로 판정.
 * 각 step에 필요한 answers 필드를 매핑.
 */
const STEP_REQUIRES: Record<StepKey, (keyof Answers)[]> = {
  theme: [],
  vibe: ["theme"],
  density: ["theme", "vibe"],
  color: ["theme", "vibe", "density"],
  layout: ["theme", "vibe", "density", "palette"],
  summary: ["theme", "vibe", "density", "palette", "layout"],
};

function isStepReachable(idx: number, a: Answers): boolean {
  const step = STEPS[idx];
  if (!step) return false;
  return STEP_REQUIRES[step.key].every((k) => a[k] != null);
}

/**
 * 다음 step 인덱스 계산. 특수 룰:
 * - theme 단계에서 none이 아닌 테마를 고르면 vibe 단계는 건너뜀 (테마가 vibe 축을 커버).
 * 그 외엔 선형 +1.
 */
function nextStepIdx(current: number, a: Answers): number {
  const curr = STEPS[current]?.key;
  if (curr === "theme" && a.theme && a.theme !== "none") {
    const colorIdx = STEPS.findIndex((s) => s.key === "color");
    if (colorIdx > current) return colorIdx;
  }
  return Math.min(STEPS.length - 1, current + 1);
}

// ────────────────────────────────────────────────────────

function Rail({
  stepIdx,
  answers,
  onStepClick,
  onFreeMode,
}: {
  stepIdx: number;
  answers: Answers;
  onStepClick: (i: number) => void;
  onFreeMode: () => void;
}) {
  return (
    <aside className={styles.rail}>
      <div className={styles.railBrand} aria-hidden>
        <Icon name="palette" size={18} />
      </div>

      <Stepper
        className={styles.railSteps}
        activeIndex={stepIdx}
        onStepClick={onStepClick}
      >
        {STEPS.map((s, i) => (
          <Stepper.Item
            key={s.key}
            title={s.title}
            hint={s.hint}
            disabled={i > stepIdx && !isStepReachable(i, answers)}
          />
        ))}
      </Stepper>

      <div className={styles.railFoot}>
        <span>CTDS 온보딩</span>
        <button
          type="button"
          className={styles.railFootBtn}
          onClick={onFreeMode}
        >
          자유 조정
          <Icon name="arrow-right" size={12} />
        </button>
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────

/**
 * 각 테마 미리보기 이미지. null이면 placeholder 블록 표시.
 * 이미지는 web/public/onboarding/<slug>.png 에 둔다.
 */
const THEME_PREVIEW_IMG: Record<ThemeId, string | null> = {
  none: null,
  pure: "/onboarding/pure.png",
  spare: "/onboarding/spare.png",
  expressive: "/onboarding/expressive.png",
};

function ThemeStep({
  value,
  onChange,
}: {
  value: ThemeId | null;
  onChange: (v: ThemeId) => void;
}) {
  const [hovered, setHovered] = useState<ThemeId | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMove = (e: React.MouseEvent) => {
    setCursor({ x: e.clientX, y: e.clientY });
  };

  // "none"은 사진이 어차피 없으니 호버 미리보기 생략.
  const showPreview = hovered !== null && hovered !== "none";
  const previewSrc = hovered ? THEME_PREVIEW_IMG[hovered] : null;

  // 커서 오른쪽 아래로 offset. 화면 밖 넘치면 왼쪽/위로 뒤집기.
  const OFFSET_X = 20;
  const OFFSET_Y = 20;
  const PREVIEW_W = 384; // CSS와 동기 (space-24 * 4 = 96 * 4)
  const PREVIEW_H = 288; // CSS와 동기 (space-24 * 3)
  let left = cursor.x + OFFSET_X;
  let top = cursor.y + OFFSET_Y;
  if (typeof window !== "undefined") {
    if (left + PREVIEW_W > window.innerWidth) left = cursor.x - OFFSET_X - PREVIEW_W;
    if (top + PREVIEW_H > window.innerHeight) top = cursor.y - OFFSET_Y - PREVIEW_H;
  }

  return (
    <>
      <div className={styles.choiceList}>
        {THEME_CHOICES.map((c) => (
          <div
            key={c.id}
            onMouseEnter={() => setHovered(c.id)}
            onMouseLeave={() => setHovered((prev) => (prev === c.id ? null : prev))}
            onMouseMove={handleMove}
          >
            <SelectableCard
              mode="radio"
              name="onb-theme"
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
              title={
                c.badge ? (
                  <span className={styles.themeTitleRow}>
                    <Badge size="sm" variant="soft" status={c.badgeStatus}>
                      {c.badge}
                    </Badge>
                    <span>{c.title}</span>
                  </span>
                ) : (
                  c.title
                )
              }
              description={c.hint}
            />
          </div>
        ))}
      </div>

      <div
        className={styles.themeHoverLayer}
        data-visible={showPreview || undefined}
        style={{ transform: `translate(${left}px, ${top}px)` }}
        aria-hidden
      >
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewSrc} alt="" className={styles.themeHoverImg} />
        ) : (
          <div className={styles.themeHoverPlaceholder}>
            <span className={styles.themeHoverPlaceholderLabel}>
              {hovered ?? ""}
            </span>
            <span className={styles.themeHoverPlaceholderHint}>
              preview image TBD
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function VibeStep({
  value,
  onChange,
}: {
  value: VibeId | null;
  onChange: (v: VibeId) => void;
}) {
  return (
    <div className={styles.choiceList}>
      {VIBE_CHOICES.map((c) => (
        <SelectableCard
          key={c.id}
          mode="radio"
          name="onb-vibe"
          value={c.id}
          checked={value === c.id}
          onChange={() => onChange(c.id)}
          title={c.title}
          description={c.hint}
        />
      ))}
    </div>
  );
}

function ColorStep({
  palette,
  hue,
  hueSource,
  brandHex,
  mode,
  onMode,
  onPalette,
  onHueChange,
  onBrandHex,
}: {
  palette: PaletteValue | null;
  hue: number;
  hueSource: "preset" | "hex" | null;
  brandHex: string;
  mode: "light" | "dark";
  onMode: (v: "light" | "dark") => void;
  onPalette: (v: PaletteValue) => void;
  onHueChange: (v: number) => void;
  onBrandHex: (hex: string) => void;
}) {
  // hex가 유효하게 들어와 있으면 상단 컨트롤 비활성, 입력 섹션은 펼침.
  const hexLocked = hueSource === "hex" && brandHex.trim().length > 0;
  const [hexOpen, setHexOpen] = useState(hexLocked);
  useEffect(() => {
    if (hexLocked) setHexOpen(true);
  }, [hexLocked]);

  const hexInvalid =
    brandHex.trim().length > 0 &&
    (!isValidHex(brandHex.trim()) || hexToOklch(brandHex.trim()) == null);

  const activePalette = palettePresets.find((p) => p.id === palette) ?? palettePresets[1];
  const swatchColor = `oklch(${activePalette.lightness} ${activePalette.chroma} ${hue + activePalette.hueShift})`;
  const activeHint = PALETTE_CHOICES.find((c) => c.id === palette)?.hint;

  return (
    <div className={styles.colorStep}>
      <section className={styles.colorSection}>
        <span className={styles.colorSectionTitle}>밝기 모드</span>
        <div className={styles.paletteRow} role="radiogroup" aria-label="밝기 모드">
          <FilterButton
            size="md"
            selected={mode === "light"}
            onClick={() => onMode("light")}
          >
            밝게
          </FilterButton>
          <FilterButton
            size="md"
            selected={mode === "dark"}
            onClick={() => onMode("dark")}
          >
            어둡게
          </FilterButton>
        </div>
      </section>

      <section className={styles.colorSection}>
        <div className={styles.colorSectionHead}>
          <span className={styles.colorSectionTitle}>팔레트 선택</span>
          {activeHint && <span className={styles.colorSectionHint}>{activeHint}</span>}
        </div>
        <div className={styles.paletteRow} role="radiogroup" aria-label="팔레트 선택">
          {PALETTE_CHOICES.map((c) => {
            const preset = palettePresets.find((p) => p.id === c.id);
            return (
              <FilterButton
                key={c.id}
                size="md"
                selected={palette === c.id}
                disabled={hexLocked}
                onClick={() => onPalette(c.id)}
              >
                {preset?.label ?? c.id}
              </FilterButton>
            );
          })}
        </div>
      </section>

      <section className={styles.colorSection}>
        <span className={styles.colorSectionTitle}>브랜드 색</span>

        <div className={styles.hueSliderBlock} data-locked={hexLocked || undefined}>
          <span
            className={styles.hueSliderSwatch}
            style={{ background: swatchColor }}
            aria-hidden
          />
          <Slider
            min={0}
            max={360}
            value={hue}
            onValueChange={onHueChange}
            disabled={hexLocked}
            aria-label="hue"
          />
          <span className={styles.hueSliderValue}>{hue}°</span>
        </div>

        <div className={styles.hexDisclosure}>
          <button
            type="button"
            className={styles.hexToggle}
            onClick={() => setHexOpen((v) => !v)}
            aria-expanded={hexOpen}
          >
            <Icon name={hexOpen ? "caret-down" : "caret-right"} size={12} />
            <span>브랜드 hex 직접 입력</span>
            <span className={styles.hexOptionalTag}>선택</span>
          </button>

          {hexOpen && (
            <div className={styles.hexBlock}>
              <Input
                size="md"
                width="fill"
                placeholder="#3B82F6"
                value={brandHex}
                onChange={(e) => onBrandHex(e.target.value)}
                invalid={hexInvalid}
                prefix={
                  <span
                    className={styles.hexBigSwatch}
                    style={{
                      background:
                        brandHex && !hexInvalid
                          ? brandHex.startsWith("#")
                            ? brandHex
                            : `#${brandHex}`
                          : "transparent",
                    }}
                    aria-hidden
                  />
                }
              />
              <span className={styles.hexHelp}>
                {hexLocked
                  ? `${activePalette.label} 톤으로 매칭돼요`
                  : hexInvalid
                    ? "hex 형식이 올바르지 않아요"
                    : "입력한 색을 그대로 재현해요"}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DensityStep({
  value,
  onChange,
}: {
  value: DensityChoiceId | null;
  onChange: (v: DensityChoiceId) => void;
}) {
  return (
    <div className={styles.choiceList}>
      {DENSITY_CHOICES.map((c) => (
        <SelectableCard
          key={c.id}
          mode="radio"
          name="onb-density"
          value={c.id}
          checked={value === c.id}
          onChange={() => onChange(c.id)}
          title={c.title}
          description={c.hint}
        />
      ))}
    </div>
  );
}

function LayoutStep({
  value,
  onChange,
}: {
  value: LayoutId | null;
  onChange: (v: LayoutId) => void;
}) {
  const [hovered, setHovered] = useState<LayoutId | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMove = (e: React.MouseEvent) => {
    setCursor({ x: e.clientX, y: e.clientY });
  };

  const hoveredChoice = hovered ? LAYOUT_CHOICES.find((c) => c.id === hovered) : null;
  const hoveredSidebar = hoveredChoice?.sidebar ?? "none";
  const hoveredTopbar = hoveredChoice?.topbar ?? false;
  const hoveredFrameLayout = hoveredChoice?.appFrameLayout ?? "sidebar-first";
  const hoveredTabs = hoveredChoice?.tabs ?? false;

  // ThemeStep과 동일한 커서 추적 로직.
  const OFFSET_X = 20;
  const OFFSET_Y = 20;
  const PREVIEW_W = 384;
  const PREVIEW_H = 256;
  let left = cursor.x + OFFSET_X;
  let top = cursor.y + OFFSET_Y;
  if (typeof window !== "undefined") {
    if (left + PREVIEW_W > window.innerWidth) left = cursor.x - OFFSET_X - PREVIEW_W;
    if (top + PREVIEW_H > window.innerHeight) top = cursor.y - OFFSET_Y - PREVIEW_H;
  }

  return (
    <>
      <div className={styles.choiceList}>
        {LAYOUT_CHOICES.map((c) => (
          <div
            key={c.id}
            onMouseEnter={() => setHovered(c.id)}
            onMouseLeave={() => setHovered((prev) => (prev === c.id ? null : prev))}
            onMouseMove={handleMove}
          >
            <SelectableCard
              mode="radio"
              name="onb-layout"
              value={c.id}
              checked={value === c.id}
              onChange={() => onChange(c.id)}
              title={c.title}
              description={c.hint}
            />
          </div>
        ))}
      </div>

      <div
        className={styles.themeHoverLayer}
        data-visible={hoveredChoice ? true : undefined}
        style={{ transform: `translate(${left}px, ${top}px)` }}
        aria-hidden
      >
        {hoveredChoice && (
          <LayoutWireframe
            sidebar={hoveredSidebar}
            topbar={hoveredTopbar}
            frameLayout={hoveredFrameLayout}
            tabs={hoveredTabs}
          />
        )}
      </div>
    </>
  );
}

/**
 * 레이아웃 호버 미리보기 와이어프레임.
 * frameLayout에 따라 두 가지 구조:
 * - sidebar-first: [좌사이드바(세로 전체) | (탑바 + 콘텐츠 세로)] — Figma/Notion
 * - topbar-first: [탑바(가로 전체); (좌사이드바 | 콘텐츠)] — GitHub/Vercel
 * tabs=true면 탑바 아래 탭 바 한 줄 추가.
 */
function LayoutWireframe({
  sidebar,
  topbar,
  frameLayout,
  tabs,
}: {
  sidebar: "left" | "right" | "dual" | "none";
  topbar: boolean;
  frameLayout: "sidebar-first" | "topbar-first";
  tabs: boolean;
}) {
  const hasLeft = sidebar === "left" || sidebar === "dual";
  const hasRight = sidebar === "right" || sidebar === "dual";

  if (topbar && frameLayout === "topbar-first") {
    return (
      <div className={styles.layoutWire} data-frame="topbar-first">
        <div className={styles.layoutWireTopbar} />
        {tabs && <div className={styles.layoutWireTabs} />}
        <div className={styles.layoutWireBody}>
          {hasLeft && <div className={styles.layoutWireSidebar} />}
          <div className={styles.layoutWireContent} />
          {hasRight && <div className={styles.layoutWireSidebar} />}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layoutWire} data-frame="sidebar-first">
      {hasLeft && <div className={styles.layoutWireSidebar} />}
      <div className={styles.layoutWireMain}>
        {topbar && <div className={styles.layoutWireTopbar} />}
        {tabs && <div className={styles.layoutWireTabs} />}
        <div className={styles.layoutWireContent} />
      </div>
      {hasRight && <div className={styles.layoutWireSidebar} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────

function SummaryStep({ answers }: { answers: Answers }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const theme = THEME_CHOICES.find((c) => c.id === answers.theme);
  const vibe = VIBE_CHOICES.find((c) => c.id === answers.vibe);
  const paletteChoice = PALETTE_CHOICES.find((c) => c.id === answers.palette);
  const density = DENSITY_CHOICES.find((c) => c.id === answers.density);
  const layout = LAYOUT_CHOICES.find((c) => c.id === answers.layout);

  const hue = answers.hue ?? 210;

  return (
    <>
      <div className={styles.summaryGrid}>
        <SummaryCard
          label="디자인 스타일"
          value={theme?.title ?? "—"}
          preview={
            theme?.badge ? (
              <Badge size="sm" variant="soft" status={theme.badgeStatus}>
                {theme.badge}
              </Badge>
            ) : (
              <span className={styles.summaryPreviewMuted}>Custom</span>
            )
          }
        />
        <SummaryCard
          label="분위기"
          value={vibe?.title ?? "—"}
          preview={
            vibe && (
              <div className={styles.vibePreview} data-summary>
                <span
                  className={styles.vibePreviewBtn}
                  data-shape={vibe.values.shape}
                  aria-hidden
                />
                <span
                  className={styles.vibePreviewChip}
                  data-shape={vibe.values.shape}
                  data-motion={vibe.values.motion}
                  aria-hidden
                />
                <span
                  className={styles.vibePreviewChip}
                  data-shape={vibe.values.shape}
                  data-motion={vibe.values.motion}
                  data-variant="ghost"
                  aria-hidden
                />
              </div>
            )
          }
        />
        <SummaryCard
          label="컬러 & 톤"
          value={paletteChoice?.title ?? "—"}
          preview={
            <div className={styles.colorPreview} aria-hidden>
              <span
                className={styles.colorPreviewSwatch}
                style={{ background: `oklch(0.55 0.14 ${hue})` }}
              />
              <span
                className={styles.colorPreviewSwatch}
                data-tone="soft"
                style={{ background: `oklch(0.78 0.08 ${hue})` }}
              />
              <span
                className={styles.colorPreviewSwatch}
                data-tone="deep"
                style={{ background: `oklch(0.38 0.10 ${hue})` }}
              />
            </div>
          }
        />
        <SummaryCard
          label="정보 밀도"
          value={density?.title ?? "—"}
          preview={
            density && (
              <div
                className={styles.densityPreview}
                data-density={density.id}
                aria-hidden
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            )
          }
        />
        <SummaryCard
          label="레이아웃"
          value={layout?.title ?? "—"}
          preview={
            layout && (
              <LayoutPreviewMini
                sidebar={layout.sidebar}
                topbar={layout.topbar}
                frameLayout={layout.appFrameLayout ?? "sidebar-first"}
                tabs={layout.tabs ?? false}
              />
            )
          }
        />
      </div>

      <p className={styles.summaryHint}>
        한 번 적용한 뒤 축을 바꾸면 이미 쌓인 컴포넌트·레이아웃이 자동 보정되지 않아요. 지금 신중히 결정해주세요.
      </p>

      <div className={styles.summaryAdvanced}>
        <button
          type="button"
          className={styles.summaryAdvancedToggle}
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          <span>고급 설정</span>
          <Icon name={advancedOpen ? "caret-down" : "caret-right"} size={16} />

        </button>
        {advancedOpen && (
          <div className={styles.summaryAdvancedBody}>
            <OnboardingAxisPanel variant="wide" themeId={answers.theme} />
          </div>
        )}
      </div>

    </>
  );
}

function LayoutPreviewMini({
  sidebar,
  topbar,
  frameLayout,
  tabs,
}: {
  sidebar: "left" | "right" | "dual" | "none";
  topbar: boolean;
  frameLayout: "sidebar-first" | "topbar-first";
  tabs: boolean;
}) {
  const hasLeft = sidebar === "left" || sidebar === "dual";
  const hasRight = sidebar === "right" || sidebar === "dual";

  if (topbar && frameLayout === "topbar-first") {
    return (
      <div className={styles.layoutPreview} data-frame="topbar-first" aria-hidden>
        <span className={styles.layoutPreviewBar} />
        {tabs && <span className={styles.layoutPreviewTabs} />}
        <span className={styles.layoutPreviewBody}>
          {hasLeft && <span className={styles.layoutPreviewRail} />}
          <span className={styles.layoutPreviewContent} />
          {hasRight && <span className={styles.layoutPreviewRail} />}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.layoutPreview} data-frame="sidebar-first" aria-hidden>
      {hasLeft && <span className={styles.layoutPreviewRail} />}
      <span className={styles.layoutPreviewMain}>
        {topbar && <span className={styles.layoutPreviewBar} />}
        {tabs && <span className={styles.layoutPreviewTabs} />}
        <span className={styles.layoutPreviewContent} />
      </span>
      {hasRight && <span className={styles.layoutPreviewRail} />}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  preview,
}: {
  label: string;
  value: string;
  preview?: React.ReactNode;
}) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryCardPreview}>{preview}</div>
      <div className={styles.summaryCardText}>
        <span className={styles.summaryLabel}>{label}</span>
        <span className={styles.summaryValue}>{value}</span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Free mode: 위저드 밖 자유 조정 (기존 갤러리 뷰 재사용)
// ────────────────────────────────────────────────────────

function FreeMode({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<"presets" | "layout" | "docs">("presets");

  return (
    <div className={styles.freeShell} data-palette="standard">
      <div className={styles.freeAxis}>
        <div className={styles.freeAxisScroll}>
          <div className={styles.freeAxisInner}>
            <OnboardingAxisPanel />
          </div>
        </div>
      </div>
      <div className={styles.freeContent}>
        <div className={styles.freeContentInner}>
          <div className={styles.freeHeader}>
            <div>
              <h1 className={styles.freeTitle}>자유 조정</h1>
              <p className={styles.freeLead}>
                좌측 축을 직접 조작하거나 아래에서 프리셋·레이아웃·문서를 골라 보세요.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onBack}>
              ← 위저드로
            </Button>
          </div>

          <FreeTabs value={tab} onChange={setTab} />

          {tab === "presets" && <PresetsGallery />}
          {tab === "layout" && <LayoutBuilder />}
          {tab === "docs" && <DocsIndex />}
        </div>
      </div>
    </div>
  );
}

function FreeTabs({
  value,
  onChange,
}: {
  value: "presets" | "layout" | "docs";
  onChange: (v: "presets" | "layout" | "docs") => void;
}) {
  const tabs: { id: "presets" | "layout" | "docs"; label: string }[] = [
    { id: "presets", label: "프리셋" },
    { id: "layout", label: "레이아웃" },
    { id: "docs", label: "컴포넌트 문서" },
  ];
  return (
    <div className={styles.segment} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={styles.segmentItem}
          data-active={value === t.id || undefined}
          onClick={() => onChange(t.id)}
          role="tab"
          aria-selected={value === t.id}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
