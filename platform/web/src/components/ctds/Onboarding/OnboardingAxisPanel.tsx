"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "../Icon";
import { useTheme } from "../ThemeController";
import { hexToHue, isValidHex } from "../_color";
import type { FocusRingValue } from "../ThemeController";
import type {
  DensityValue,
  IconFamily,
  MotionValue,
  PaletteValue,
  ShapeValue,
  VoiceValue,
} from "../_data";
import {
  DENSITIES,
  HUE_PRESETS,
  ICON_FAMILIES,
  MOTIONS,
  PALETTES,
  SHAPES,
  VOICES,
} from "../axisOptions";
import { THEME_PRESETS, type ThemeId } from "./wizardData";
import styles from "./Onboarding.module.css";

type Variant = "narrow" | "wide";

/** Voice 축 미리보기 샘플 문구. 같은 상황(저장 완료 토스트)을 3톤으로. */
const VOICE_SAMPLE: Record<VoiceValue, string> = {
  formal: "저장되었습니다.",
  neutral: "저장 완료",
  casual: "저장했어요",
};

/** 테마가 "성격"으로 묶는 축: shape · density · motion · iconFamily.
 *  테마 선택 시 이 축들은 preset 값으로 lock. palette/hue/mode는 유지(사용자 브랜드 색 자유). */
const THEME_LABEL: Record<Exclude<ThemeId, "none">, string> = {
  pure: "Pure",
  spare: "Spare",
  expressive: "Expressive",
};

export function OnboardingAxisPanel({
  variant = "narrow",
  themeId = null,
}: {
  variant?: Variant;
  /** Summary 고급설정에서 전달. 'none'/null이면 모든 축 자유 조정. */
  themeId?: ThemeId | null;
} = {}) {
  const [hexDraft, setHexDraft] = useState("");
  const [hexError, setHexError] = useState(false);
  const {
    theme,
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
    focusRing,
    setFocusRing,
    voice,
    setVoice,
    reset,
  } = useTheme();

  const applyBrandHex = (raw: string) => {
    const trimmed = raw.trim();
    setHexDraft(trimmed);
    if (!trimmed) {
      setHexError(false);
      return;
    }
    if (!isValidHex(trimmed)) {
      setHexError(true);
      return;
    }
    const nextHue = hexToHue(trimmed);
    if (nextHue == null) {
      setHexError(true);
      return;
    }
    setHexError(false);
    setHue(nextHue);
  };

  const wide = variant === "wide";

  // 테마가 "성격"으로 묶는 축 lock 계산.
  // themeId가 none/null이면 자유 조정. 그 외엔 THEME_PRESETS의 해당 축 값으로 고정.
  const lockedTheme = themeId && themeId !== "none" ? themeId : null;
  const preset = lockedTheme ? THEME_PRESETS[lockedTheme] : null;
  const themeLabel = lockedTheme ? THEME_LABEL[lockedTheme] : null;
  const lockedReason = themeLabel
    ? `${themeLabel} 테마가 이 축을 결정합니다. 바꾸려면 "직접 조합"으로 변경하세요.`
    : undefined;
  const lockedShape = preset?.shape;
  const lockedDensity = preset?.density;
  const lockedMotion = preset?.motion;
  const lockedIconFamily = preset?.iconFamily;

  return (
    <div
      className={wide ? styles.axisAdv : undefined}
      aria-label="9축 컨트롤"
    >
      {!wide && (
        <div className={styles.axisRailHead}>
          <span className={styles.axisRailTitle}>9축 컨트롤</span>
          <button type="button" className={styles.axisRailReset} onClick={reset}>
            reset
          </button>
        </div>
      )}
      {wide && (
        <div className={styles.axisAdvHead}>
          <button type="button" className={styles.axisRailReset} onClick={reset}>
            전체 초기화
          </button>
        </div>
      )}

      <AxisRow label="모드" wide={wide}>
        <SegmentGroup
          wide={wide}
          options={[
            { value: "light", label: "밝게", preview: wide && <ModeSwatch mode="light" /> },
            { value: "dark", label: "어둡게", preview: wide && <ModeSwatch mode="dark" /> },
          ]}
          value={theme}
          onChange={() => toggleTheme()}
        />
      </AxisRow>

      <AxisRow label="팔레트" wide={wide}>
        <SegmentGroup
          wide={wide}
          options={PALETTES.map((p) => ({
            value: p,
            label: p,
            preview: wide && <PaletteSwatch palette={p} hue={hue} />,
          }))}
          value={palette}
          onChange={(v) => setPalette(v as PaletteValue)}
        />
      </AxisRow>

      <AxisRow label="브랜드 색" wide={wide}>
        <div className={wide ? styles.axisAdvHue : styles.hueBox}>
          <div className={styles.huePresets}>
            {HUE_PRESETS.map((h) => (
              <button
                type="button"
                key={h.name}
                className={styles.hueChip}
                data-active={hue === h.value || undefined}
                onClick={() => setHue(h.value)}
                title={`${h.name} · ${h.value}°`}
              >
                <span
                  className={styles.hueSwatch}
                  style={{ background: `oklch(0.55 0.14 ${h.value})` }}
                />
                <span className={styles.hueLabel}>{h.name}</span>
              </button>
            ))}
          </div>
          <div className={styles.hueDial}>
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(e) => setHue(Number(e.target.value))}
            />
            <span className={styles.hueValue}>{hue}°</span>
          </div>
          <div className={styles.hexRow}>
            <span
              className={styles.hexSwatch}
              style={{
                background:
                  isValidHex(hexDraft) && !hexError
                    ? hexDraft.startsWith("#")
                      ? hexDraft
                      : `#${hexDraft}`
                    : "transparent",
              }}
              aria-hidden
            />
            <input
              type="text"
              placeholder="#3B82F6"
              value={hexDraft}
              onChange={(e) => applyBrandHex(e.target.value)}
              className={styles.hexInput}
              aria-invalid={hexError || undefined}
              aria-label="브랜드 hex"
            />
          </div>
          <label className={styles.axisAdvCheck}>
            <input
              type="checkbox"
              checked={accentHue != null}
              onChange={(e) =>
                setAccentHue(e.target.checked ? (hue + 60) % 360 : null)
              }
            />
            보조 색상 사용
          </label>
          {accentHue != null && (
            <div className={styles.hueDial}>
              <input
                type="range"
                min={0}
                max={360}
                value={accentHue}
                onChange={(e) => setAccentHue(Number(e.target.value))}
              />
              <span className={styles.hueValue}>{accentHue}°</span>
            </div>
          )}
        </div>
      </AxisRow>

      <AxisRow label="모양" wide={wide} lockedBy={lockedShape ? themeLabel ?? undefined : undefined}>
        <SegmentGroup
          wide={wide}
          options={SHAPES.map((s) => ({
            value: s,
            label: s,
            preview: wide && <ShapePreview shape={s} />,
          }))}
          value={shape}
          onChange={(v) => setShape(v as ShapeValue)}
          lockedValue={lockedShape}
          lockedReason={lockedReason}
        />
      </AxisRow>

      <AxisRow label="정보 밀도" wide={wide} lockedBy={lockedDensity ? themeLabel ?? undefined : undefined}>
        <SegmentGroup
          wide={wide}
          options={DENSITIES.map((d) => ({
            value: d,
            label: d,
            preview: wide && <DensityMini density={d} />,
          }))}
          value={density}
          onChange={(v) => setDensity(v as DensityValue)}
          lockedValue={lockedDensity}
          lockedReason={lockedReason}
        />
      </AxisRow>

      <AxisRow label="모션" wide={wide} lockedBy={lockedMotion ? themeLabel ?? undefined : undefined}>
        <SegmentGroup
          wide={wide}
          options={MOTIONS.map((m) => ({
            value: m,
            label: m,
            preview: wide && <MotionPreview motion={m} />,
          }))}
          value={motionMode}
          onChange={(v) => setMotionMode(v as MotionValue)}
          lockedValue={lockedMotion}
          lockedReason={lockedReason}
        />
      </AxisRow>

      <AxisRow label="보이스" wide={wide}>
        {wide ? (
          <div className={styles.voiceGroup} role="radiogroup">
            {VOICES.map((v) => (
              <button
                key={v}
                type="button"
                className={styles.voiceItem}
                data-active={voice === v || undefined}
                onClick={() => setVoice(v)}
                role="radio"
                aria-checked={voice === v}
              >
                <span className={styles.voiceSample}>&ldquo;{VOICE_SAMPLE[v]}&rdquo;</span>
                <span className={styles.voiceCode}>{v}</span>
              </button>
            ))}
          </div>
        ) : (
          <SegmentGroup
            wide={wide}
            options={VOICES.map((v) => ({ value: v, label: v }))}
            value={voice}
            onChange={(v) => setVoice(v as VoiceValue)}
          />
        )}
      </AxisRow>

      <AxisRow label="아이콘 세트" wide={wide} lockedBy={lockedIconFamily ? themeLabel ?? undefined : undefined}>
        <SegmentGroup
          wide={wide}
          options={ICON_FAMILIES.map((f) => ({
            value: f,
            label: f,
            preview: wide && <IconFamilyPreview family={f} />,
          }))}
          value={iconFamily}
          onChange={(v) => setIconFamily(v as IconFamily)}
          lockedValue={lockedIconFamily}
          lockedReason={lockedReason}
        />
      </AxisRow>

      <AxisRow label="포커스 링" wide={wide}>
        <SegmentGroup
          wide={wide}
          options={[
            { value: "on", label: "표시", preview: wide && <FocusRingPreview on /> },
            { value: "off", label: "숨김", preview: wide && <FocusRingPreview on={false} /> },
          ]}
          value={focusRing}
          onChange={(v) => setFocusRing(v as FocusRingValue)}
        />
      </AxisRow>
    </div>
  );
}

function AxisRow({
  label,
  wide,
  lockedBy,
  children,
}: {
  label: string;
  wide: boolean;
  /** 테마가 이 축을 잠근 경우 테마 라벨(예: "Spare"). 없으면 자유 조정. */
  lockedBy?: string;
  children: ReactNode;
}) {
  const title = lockedBy
    ? `${lockedBy} 테마가 이 축을 결정합니다. 바꾸려면 디자인 스타일을 "직접 조합"으로 변경하세요.`
    : undefined;
  return (
    <div className={wide ? styles.axisAdvRow : styles.axisRow}>
      <span className={wide ? styles.axisAdvLabel : styles.axisLabel}>
        {label}
        {wide && lockedBy && (
          <span className={styles.axisLockBadge} title={title}>
            {lockedBy} 결정
          </span>
        )}
      </span>
      <div
        className={wide ? styles.axisAdvControl : undefined}
        title={title}
        aria-disabled={lockedBy ? true : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function SegmentGroup<T extends string>({
  options,
  value,
  onChange,
  wide,
  lockedValue,
  lockedReason,
}: {
  options: {
    value: T;
    label: string;
    /** wide variant에서 label 아래에 작게 들어가는 보조 텍스트 (예: 코드명). */
    sublabel?: string;
    preview?: ReactNode | false;
  }[];
  value: T;
  onChange: (v: T) => void;
  wide: boolean;
  /** 지정된 경우 이 값만 활성, 나머지는 disabled. */
  lockedValue?: T;
  /** disabled 아이템 hover 시 보여줄 이유 문구. */
  lockedReason?: string;
}) {
  return (
    <div className={wide ? styles.segmentWide : styles.segment} role="radiogroup">
      {options.map((o) => {
        const disabled = lockedValue != null && o.value !== lockedValue;
        return (
          <button
            key={o.value}
            type="button"
            className={wide ? styles.segmentWideItem : styles.segmentItem}
            data-active={value === o.value || undefined}
            data-disabled={disabled || undefined}
            disabled={disabled}
            title={disabled ? lockedReason : undefined}
            onClick={() => !disabled && onChange(o.value)}
            role="radio"
            aria-checked={value === o.value}
          >
            {wide ? (
              <>
                {o.preview && (
                  <span className={styles.segmentWidePreview}>{o.preview}</span>
                )}
                <span className={styles.segmentWideLabel}>{o.label}</span>
                {o.sublabel && (
                  <span className={styles.segmentWideSublabel}>{o.sublabel}</span>
                )}
              </>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Preview atoms ──────────────────────────────────────

function ModeSwatch({ mode }: { mode: "light" | "dark" }) {
  return (
    <span
      className={styles.modeSwatch}
      data-mode={mode}
      aria-hidden
    />
  );
}

function PaletteSwatch({ palette, hue }: { palette: PaletteValue; hue: number }) {
  // palette 강도 ≈ chroma/lightness로 근사. 실제 토큰값과 완전 일치 아니라도 비주얼 시그널로 충분.
  const spec: Record<PaletteValue, { l: number; c: number }> = {
    mono: { l: 0.52, c: 0 },
    vivid: { l: 0.58, c: 0.18 },
    standard: { l: 0.55, c: 0.14 },
    calm: { l: 0.52, c: 0.07 },
    pastel: { l: 0.82, c: 0.06 },
  };
  const { l, c } = spec[palette];
  return (
    <span
      className={styles.paletteSwatch}
      style={{ background: `oklch(${l} ${c} ${hue})` }}
      aria-hidden
    />
  );
}

function ShapePreview({ shape }: { shape: ShapeValue }) {
  return (
    <span
      className={styles.shapePreview}
      data-shape={shape}
      aria-hidden
    />
  );
}

function DensityMini({ density }: { density: DensityValue }) {
  return (
    <span className={styles.densityMini} data-density={density} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

function MotionPreview({ motion }: { motion: MotionValue }) {
  return (
    <span className={styles.motionPreview} aria-hidden>
      <span className={styles.motionDot} data-motion={motion} />
    </span>
  );
}

/** family 특색이 가장 잘 보이는 세 아이콘 트리오. 셋 다 세 family 모두 지원하는 범용 세트. */
const ICON_TRIO = ["heart", "bell", "gear"] as const;

function IconFamilyPreview({ family }: { family: IconFamily }) {
  return (
    <span className={styles.iconTrio} aria-hidden>
      {ICON_TRIO.map((n) => (
        <Icon key={n} name={n} family={family} size={16} />
      ))}
    </span>
  );
}

function FocusRingPreview({ on }: { on: boolean }) {
  return (
    <span className={styles.focusRingPreview} aria-hidden>
      <span className={styles.focusRingButton} data-on={on || undefined} />
    </span>
  );
}
