"use client";

import { useTheme } from "../ThemeController";
import { Button } from "../Button";
import { themePresets } from "../_data";
import styles from "./Onboarding.module.css";

export function PresetsGallery() {
  const { applyPreset, palette, hue, shape, density, motionMode } = useTheme();

  return (
    <div className={styles.cardGrid}>
      {themePresets.map((p) => {
        const active =
          palette === p.values.palette &&
          hue === p.values.hue &&
          shape === p.values.shape &&
          density === p.values.density &&
          motionMode === p.values.motion;

        return (
          <div
            key={p.id}
            className={styles.card}
            data-active={active || undefined}
          >
            <div className={styles.cardHead}>
              <span className={styles.cardTitle}>{p.label}</span>
              <div className={styles.cardSwatches} aria-hidden>
                <span
                  className={styles.cardSwatch}
                  style={{
                    background: `oklch(0.55 0.14 ${p.values.hue})`,
                  }}
                />
                {p.values.accentHue != null && (
                  <span
                    className={styles.cardSwatch}
                    style={{
                      background: `oklch(0.55 0.14 ${p.values.accentHue})`,
                    }}
                  />
                )}
              </div>
            </div>
            <p className={styles.cardDesc}>{p.desc}</p>
            <p className={styles.cardDesc}>
              {p.values.palette} · {p.values.shape} · {p.values.density} ·{" "}
              {p.values.motion}
            </p>
            <div className={styles.cardFoot}>
              <Button
                variant={active ? "primary" : "ghost"}
                size="sm"
                onClick={() => applyPreset(p.values)}
              >
                {active ? "적용됨" : "적용"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
