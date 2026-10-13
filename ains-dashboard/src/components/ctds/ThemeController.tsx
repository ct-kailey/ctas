"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  DensityValue,
  IconFamily,
  LangValue,
  MotionValue,
  PaletteValue,
  ShapeValue,
  ThemePreset,
  VoiceValue,
} from "./_data";
import { IconAxisProvider } from "./Icon";

type ThemeMode = "light" | "dark";
export type FocusRingValue = "on" | "off";

/**
 * ctds.config.json의 shape. `ctds init` 후 사용자가 /ctds 적용하면 이 모양으로 쓰임.
 * 모든 필드가 optional — 부분 설정만 있어도 override로 작동, 나머지는 ThemeController
 * 기본값 유지. 알 수 없는 필드는 무시.
 */
export type InitialConfig = {
  mode?: ThemeMode;
  palette?: PaletteValue;
  hue?: number;
  accentHue?: number | null;
  shape?: ShapeValue;
  density?: DensityValue;
  motion?: MotionValue;
  iconFamily?: IconFamily;
  voice?: VoiceValue;
  lang?: LangValue;
  focusRing?: FocusRingValue;
};

export type ThemeState = {
  theme: ThemeMode;
  setTheme: (v: ThemeMode) => void;
  toggleTheme: () => void;
  palette: PaletteValue;
  setPalette: (v: PaletteValue) => void;
  hue: number;
  setHue: (v: number) => void;
  /** 보조 hue. null이면 미설정(secondary variant는 primary hue로 폴백). */
  accentHue: number | null;
  setAccentHue: (v: number | null) => void;
  shape: ShapeValue;
  setShape: (v: ShapeValue) => void;
  density: DensityValue;
  setDensity: (v: DensityValue) => void;
  motionMode: MotionValue;
  setMotionMode: (v: MotionValue) => void;
  iconFamily: IconFamily;
  setIconFamily: (v: IconFamily) => void;
  lang: LangValue;
  setLang: (v: LangValue) => void;
  focusRing: FocusRingValue;
  setFocusRing: (v: FocusRingValue) => void;
  voice: VoiceValue;
  setVoice: (v: VoiceValue) => void;
  applyPreset: (preset: ThemePreset) => void;
  reset: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeController");
  return ctx;
}

/**
 * ThemeController 사용법:
 *   <ThemeController>...</ThemeController>  — 기본값에서 시작
 *   <ThemeController initialConfig={ctdsConfig}>...</ThemeController>
 *     → ctds.config.json을 import해서 넘기면 SSR 첫 렌더부터 그 값으로 뜸.
 *       mount 후 localStorage가 있으면 localStorage가 우선 (사용자가 바꾼 값 유지).
 */
export function ThemeController({
  children,
  initialConfig,
}: {
  children: React.ReactNode;
  initialConfig?: InitialConfig;
}) {
  const ic = initialConfig ?? {};
  const [theme, setTheme] = useState<ThemeMode>(ic.mode ?? "light");
  const [palette, setPalette] = useState<PaletteValue>(ic.palette ?? "standard");
  const [hue, setHue] = useState<number>(ic.hue ?? 210);
  const [accentHue, setAccentHue] = useState<number | null>(ic.accentHue ?? null);
  const [shape, setShape] = useState<ShapeValue>(ic.shape ?? "standard");
  const [density, setDensity] = useState<DensityValue>(ic.density ?? "default");
  const [motionMode, setMotionMode] = useState<MotionValue>(ic.motion ?? "standard");
  const [iconFamily, setIconFamily] = useState<IconFamily>(ic.iconFamily ?? "phosphor");
  const [lang, setLang] = useState<LangValue>(ic.lang ?? "ko");
  const [focusRing, setFocusRing] = useState<FocusRingValue>(ic.focusRing ?? "off");
  const [voice, setVoice] = useState<VoiceValue>(ic.voice ?? "neutral");
  const [hydrated, setHydrated] = useState(false);

  // Init from localStorage — 반드시 첫 렌더는 서버와 동일한 default로 두고
  // mount 후 한 번에 실제 값으로 스왑한다. 그래야 hydration mismatch가 안 난다.
  useEffect(() => {
    try {
      const saved =
        (localStorage.getItem("ctds-mode") as ThemeMode | null) ||
        ic.mode ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser preferences load after the first render matches the static HTML.
      setTheme(saved);
      const savedPalette = localStorage.getItem("ctds-palette") as PaletteValue | null;
      if (savedPalette) setPalette(savedPalette);
      const savedHue = localStorage.getItem("ctds-hue");
      if (savedHue) setHue(Number(savedHue));
      const savedAccentHue = localStorage.getItem("ctds-accent-hue");
      if (savedAccentHue && savedAccentHue !== "") setAccentHue(Number(savedAccentHue));
      // ctds-accent는 축에서 제거됨. 과거값은 정리.
      try {
        localStorage.removeItem("ctds-accent");
      } catch {}
      const savedShape = localStorage.getItem("ctds-shape") as ShapeValue | null;
      if (savedShape) setShape(savedShape);
      const savedDensity = localStorage.getItem("ctds-density") as DensityValue | null;
      if (savedDensity) setDensity(savedDensity);
      const savedMotion = localStorage.getItem("ctds-motion") as MotionValue | null;
      const motionMigration: Record<string, MotionValue> = {
        expressive: "bouncy",
        subtle: "calm",
      };
      const validMotion: MotionValue[] = ["bouncy", "standard", "calm", "none"];
      if (savedMotion) {
        const next = motionMigration[savedMotion as string] ?? savedMotion;
        if (validMotion.includes(next as MotionValue)) setMotionMode(next as MotionValue);
      }
      const savedIconFamily = localStorage.getItem("ctds-icon-family") as IconFamily | null;
      if (savedIconFamily) setIconFamily(savedIconFamily);
      // ctds-icon-weight는 축에서 제거됨. 과거값은 정리.
      try {
        localStorage.removeItem("ctds-icon-weight");
      } catch {}
      const savedLang = localStorage.getItem("ctds-lang") as LangValue | null;
      const validLang: LangValue[] = ["ko", "en"];
      if (savedLang && validLang.includes(savedLang)) setLang(savedLang);
      const savedFocusRing = localStorage.getItem("ctds-focus-ring") as FocusRingValue | null;
      if (savedFocusRing === "on" || savedFocusRing === "off") setFocusRing(savedFocusRing);
      const savedVoice = localStorage.getItem("ctds-voice") as VoiceValue | null;
      const validVoice: VoiceValue[] = ["formal", "neutral", "casual"];
      if (savedVoice && validVoice.includes(savedVoice)) setVoice(savedVoice);
      try {
        localStorage.removeItem("ctds-typography");
      } catch {}
    } catch {}
    setHydrated(true);
  }, [ic.mode]);

  // Sync -> document + persist
  // hydrated 전에는 스킵 — head 스크립트가 이미 실제 값으로 attr을 세팅해뒀고,
  // 우리는 마운트 후 state가 실제 값으로 스왑된 뒤부터 관리한다.
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.setAttribute("data-mode", theme);
    document.documentElement.setAttribute("data-palette", palette);
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.setAttribute("data-shape", shape);
    document.documentElement.setAttribute("data-density", density);
    document.documentElement.setAttribute("data-motion", motionMode);
    document.documentElement.setAttribute("data-icon-family", iconFamily);
    document.documentElement.removeAttribute("data-icon-weight");
    document.documentElement.setAttribute("data-lang", lang);
    document.documentElement.setAttribute("data-focus-ring", focusRing);
    document.documentElement.setAttribute("data-voice", voice);
    document.documentElement.removeAttribute("data-typography");
    document.documentElement.lang = lang;
    document.documentElement.style.setProperty("--hue", String(hue));
    if (accentHue == null) {
      document.documentElement.style.removeProperty("--secondary-hue");
    } else {
      document.documentElement.style.setProperty("--secondary-hue", String(accentHue));
    }
    try {
      localStorage.setItem("ctds-mode", theme);
      localStorage.setItem("ctds-palette", palette);
      localStorage.setItem("ctds-shape", shape);
      localStorage.setItem("ctds-density", density);
      localStorage.setItem("ctds-motion", motionMode);
      localStorage.setItem("ctds-icon-family", iconFamily);
      localStorage.setItem("ctds-lang", lang);
      localStorage.setItem("ctds-focus-ring", focusRing);
      localStorage.setItem("ctds-voice", voice);
      localStorage.setItem("ctds-hue", String(hue));
      if (accentHue == null) localStorage.removeItem("ctds-accent-hue");
      else localStorage.setItem("ctds-accent-hue", String(accentHue));
    } catch {}
  }, [hydrated, theme, palette, hue, accentHue, shape, density, motionMode, iconFamily, lang, focusRing, voice]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  const applyPreset = useCallback((p: ThemePreset) => {
    // Voice is Theme-independent — intentionally not reset by presets.
    setTheme(p.mode);
    setPalette(p.palette);
    setHue(p.hue);
    setAccentHue(p.accentHue ?? null);
    setShape(p.shape);
    setDensity(p.density);
    setMotionMode(p.motion);
    setIconFamily(p.iconFamily);
    setLang(p.lang);
  }, []);

  const reset = useCallback(() => {
    setTheme("light");
    setPalette("standard");
    setHue(210);
    setAccentHue(null);
    setShape("standard");
    setDensity("default");
    setMotionMode("standard");
    setIconFamily("phosphor");
    setLang("ko");
    setFocusRing("off");
    setVoice("neutral");
  }, []);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      palette,
      setPalette,
      hue,
      setHue,
      accentHue,
      setAccentHue,
      shape,
      setShape,
      density,
      setDensity,
      motionMode,
      setMotionMode,
      iconFamily,
      setIconFamily,
      lang,
      setLang,
      focusRing,
      setFocusRing,
      voice,
      setVoice,
      applyPreset,
      reset,
    }),
    [theme, palette, hue, accentHue, shape, density, motionMode, iconFamily, lang, focusRing, voice, toggleTheme, applyPreset, reset]
  );

  // Icon 축을 Icon 라이브러리 컨텍스트에도 브로드캐스트 (아이콘마다 MutationObserver 제거용)
  // weight 축은 제거됨. Icon 라이브러리는 default 'regular' 그대로.
  const iconAxisValue = useMemo(
    () => ({ family: iconFamily, weight: "regular" as const }),
    [iconFamily]
  );

  return (
    <ThemeContext.Provider value={value}>
      <IconAxisProvider value={iconAxisValue}>{children}</IconAxisProvider>
    </ThemeContext.Provider>
  );
}
