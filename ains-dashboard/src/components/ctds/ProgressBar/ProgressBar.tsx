"use client";

import { forwardRef, type HTMLAttributes } from "react";
import styles from "./ProgressBar.module.css";

export type ProgressBarProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * 진행률 (0~100). 미지정이면 무한 왕복 애니메이션(indeterminate).
   * 실제 %가 없는 라우팅/네트워크 로딩용.
   */
  value?: number;
  /** 화면 최상단에 fixed로 붙임. */
  position?: "fixed" | "inline";
  /** 표시 여부. false면 즉시 숨김 + fade-out. */
  active?: boolean;
};

/**
 * 라인 로딩바. 두 가지 모드:
 * - value 있으면 그 %로 채움 (determinate)
 * - value 없으면 무한 왕복 (indeterminate) — 네트워크·라우팅 로딩용
 */
const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, position = "fixed", active = true, className, ...rest }, ref) => {
    const isDeterminate = typeof value === "number";
    const clamped = isDeterminate
      ? Math.max(0, Math.min(100, value as number))
      : undefined;

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        data-position={position}
        data-active={active || undefined}
        data-mode={isDeterminate ? "determinate" : "indeterminate"}
        className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        <div
          className={styles.bar}
          style={isDeterminate ? { width: `${clamped}%` } : undefined}
        />
      </div>
    );
  },
);

ProgressBar.displayName = "ProgressBar";

export { ProgressBar };
