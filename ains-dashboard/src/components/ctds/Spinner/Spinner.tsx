"use client";

/**
 * Spinner — Motion 축이 로더 성격을 결정.
 *
 * variant 생략 시 Motion 축의 `--loader-style`을 추종한다.
 *   - bouncy  → dots-bounce
 *   - standard → ring
 *   - calm    → dots-fade
 *   - none    → ring (접근성 예외: 로딩 신호는 유지)
 *
 * `lottie-<name>` variant는 번들된 Lottie 로티를 렌더 (colorBind=true면 currentColor 추종).
 *
 * 색은 currentColor로 묶여 부모 color를 그대로 승계 (Palette/Hue 축 호환).
 */

import { forwardRef, type HTMLAttributes } from "react";
import styles from "./Spinner.module.css";
import type { LottieName } from "./lottieManifest";
import { LottiePlayer } from "./LottiePlayer";

export type SpinnerSize = "sm" | "md" | "lg" | "xl";
export type SpinnerBaseVariant = "ring" | "dots-bounce" | "dots-fade" | "pulse";
export type SpinnerLottieVariant = `lottie-${LottieName}`;
export type SpinnerVariant = SpinnerBaseVariant | SpinnerLottieVariant;

export type SpinnerProps = HTMLAttributes<HTMLSpanElement> & {
  size?: SpinnerSize;
  /** 생략 시 현재 Motion 축의 `--loader-style`을 따름 */
  variant?: SpinnerVariant;
  /** 스크린리더 라벨 */
  label?: string;
};

const sizeClass: Record<SpinnerSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  xl: styles.xl,
};

const baseVariantClass: Record<SpinnerBaseVariant, string> = {
  ring: styles["v-ring"],
  "dots-bounce": `${styles["v-dots"]} ${styles["v-dots-bounce"]}`,
  "dots-fade": `${styles["v-dots"]} ${styles["v-dots-fade"]}`,
  pulse: styles["v-pulse"],
};

function isLottieVariant(v: SpinnerVariant): v is SpinnerLottieVariant {
  return v.startsWith("lottie-");
}

const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size = "sm", variant, label = "Loading", ...rest }, ref) => {
    let variantPart = "";
    let lottieName: LottieName | null = null;

    if (variant) {
      if (isLottieVariant(variant)) {
        lottieName = variant.slice("lottie-".length) as LottieName;
        variantPart = styles["v-lottie"];
      } else {
        variantPart = baseVariantClass[variant];
      }
    } else {
      variantPart = styles["v-auto"];
    }

    const rootClass = [styles.root, sizeClass[size], variantPart, className ?? ""]
      .filter(Boolean)
      .join(" ");

    return (
      <span
        ref={ref}
        className={rootClass}
        role="status"
        aria-label={label}
        {...rest}
      >
        {lottieName ? <LottiePlayer name={lottieName} /> : <SpinnerBody />}
      </span>
    );
  },
);

Spinner.displayName = "Spinner";

/* 비-로티 variant용 공통 바디. 활성 variant 클래스가 해당하는 자식만 display. */
function SpinnerBody() {
  return (
    <>
      <svg className={styles.ring} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="3"
        />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className={styles.dot} aria-hidden />
      <span className={styles.dot} aria-hidden />
      <span className={styles.dot} aria-hidden />
      <span className={styles.pulse} aria-hidden />
    </>
  );
}

export { Spinner };
