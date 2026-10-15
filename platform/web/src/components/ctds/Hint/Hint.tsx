"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../Icon";

import styles from "./Hint.module.css";

/**
 * Hint — 흐름 속에 스며드는 참고 한 줄~두 줄.
 * 아이콘 하나 + muted 텍스트. 액션·배경·테두리 없음.
 *
 * 아이콘 수직 정렬은 flex가 아니라 line-box에 흘려넣고,
 * 둘째 줄은 hanging indent로 아이콘 폭만큼 들여쓰기 — Hint.module.css 참고.
 *
 * **아이콘 + 텍스트 한 줄짜리 안내는 반드시 이 컴포넌트 경유.**
 * `<Icon /> + <span>` 수제 조립 금지 — [[feedback_no_hand_rolled_components]].
 */
export type HintSize = "sm" | "md";
export type HintTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "destructive";

export interface HintProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: IconName;
  size?: HintSize;
  /** 아이콘·텍스트 공통 톤. 기본 neutral(muted). 톤 색이 필요하면 brand/success/warning/destructive. */
  tone?: HintTone;
  children?: ReactNode;
}

const sizeClass: Record<HintSize, string> = {
  sm: styles.sm,
  md: styles.md,
};

const toneClass: Record<HintTone, string> = {
  neutral: styles.neutral,
  brand: styles.brand,
  success: styles.success,
  warning: styles.warning,
  destructive: styles.destructive,
};

const Hint = forwardRef<HTMLSpanElement, HintProps>(
  (
    { className, icon = "info", size = "sm", tone = "neutral", children, ...rest },
    ref,
  ) => {
    const rootClass = [
      styles.root,
      sizeClass[size],
      toneClass[tone],
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span ref={ref} className={rootClass} {...rest}>
        <span className={styles.icon} aria-hidden>
          <Icon name={icon} />
        </span>
        {children}
      </span>
    );
  },
);

Hint.displayName = "Hint";

export { Hint };
