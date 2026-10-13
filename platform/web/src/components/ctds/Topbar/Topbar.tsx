"use client";

import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../_cn";
import styles from "./Topbar.module.css";

/* Root ─────────────────────────────────────────────────
   자유 슬롯 컨테이너. 자체 표현(bg/border/shadow) 없음.
   컨테이너 표현은 상위 AppFrame variant가 담당.
   size는 세로 높이만 결정 (sm=얇게, md=기본). */
export type TopbarSize = "sm" | "md";

export interface TopbarProps extends HTMLAttributes<HTMLElement> {
  size?: TopbarSize;
}

const TopbarRoot = forwardRef<HTMLElement, TopbarProps>(function TopbarRoot(
  { size = "md", className, children, ...rest },
  ref,
) {
  return (
    <header
      ref={ref}
      className={cn(styles.root, className)}
      data-size={size}
      {...rest}
    >
      {children}
    </header>
  );
});

/* Spacer ───────────────────────────────────────────────
   좌/우 정렬용 flex:1 빈 블록. */
function TopbarSpacer() {
  return <div className={styles.spacer} aria-hidden />;
}

type TopbarComponent = typeof TopbarRoot & {
  Spacer: typeof TopbarSpacer;
};

const Topbar = TopbarRoot as TopbarComponent;
Topbar.Spacer = TopbarSpacer;

export { Topbar };
