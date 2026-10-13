"use client";

import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../_cn";
import styles from "./Toolbar.module.css";

/* Root ─────────────────────────────────────────────────
   툴바 — IconButton 중심의 action 줄. 단일 size.
   variant:
     - floating  : 떠 있는 알약(bg-elevated + shadow-md + radius-xl)
     - attached  : 콘텐츠에 붙은 bar (transparent + 하단 hairline) */
export type ToolbarVariant = "floating" | "attached";

export interface ToolbarProps extends HTMLAttributes<HTMLElement> {
  variant?: ToolbarVariant;
  /** 가로 꽉 채울지(attached에 어울림) vs 콘텐츠 폭(floating). 기본은 variant로 자동 결정. */
  stretch?: boolean;
}

const ToolbarRoot = forwardRef<HTMLDivElement, ToolbarProps>(function ToolbarRoot(
  { variant = "floating", stretch, className, children, role = "toolbar", ...rest },
  ref,
) {
  const resolvedStretch = stretch ?? variant === "attached";
  return (
    <div
      ref={ref}
      role={role}
      className={cn(styles.root, className)}
      data-variant={variant}
      data-stretch={resolvedStretch || undefined}
      {...rest}
    >
      {children}
    </div>
  );
});

/* Group ─────────────────────────────────────────────────
   관련 액션 묶음. 내부는 좁은 gap, 그룹 간은 Divider 또는 넓은 gap으로 구분. */
interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {}

function ToolbarGroup({ className, children, ...rest }: ToolbarGroupProps) {
  return (
    <div className={cn(styles.group, className)} role="group" {...rest}>
      {children}
    </div>
  );
}

/* Divider ───────────────────────────────────────────────
   세로 hairline. 그룹 사이 시각 구분. */
function ToolbarDivider() {
  return <div className={styles.divider} role="separator" aria-orientation="vertical" />;
}

/* Spacer ────────────────────────────────────────────────
   좌/우 정렬용 flex:1. */
function ToolbarSpacer() {
  return <div className={styles.spacer} aria-hidden />;
}

type ToolbarComponent = typeof ToolbarRoot & {
  Group: typeof ToolbarGroup;
  Divider: typeof ToolbarDivider;
  Spacer: typeof ToolbarSpacer;
};

const Toolbar = ToolbarRoot as ToolbarComponent;
Toolbar.Group = ToolbarGroup;
Toolbar.Divider = ToolbarDivider;
Toolbar.Spacer = ToolbarSpacer;

export { Toolbar };
