"use client";

import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../_cn";
import styles from "./Topbar.module.css";

/* Root ─────────────────────────────────────────────────
   자유 슬롯 컨테이너. 자체 표현(bg/border/shadow) 없음.
   컨테이너 표현은 상위 AppFrame variant가 담당.

   구조는 leading / center / trailing 3-zone 고정. 루트가 부모 폭을 꽉 채우고
   세 zone이 flex로 자리를 나눠서 "왼쪽에 몰림" 현상을 구조적으로 차단.

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

/* Zones ────────────────────────────────────────────────
   leading / center / trailing. zone 안 자식은 가로 flex + space-1 gap.
   center는 flex:1 + 가운데 정렬 — 비워두면 leading과 trailing 사이가 자연히 벌어짐. */
type ZoneProps = HTMLAttributes<HTMLDivElement>;

const TopbarLeading = forwardRef<HTMLDivElement, ZoneProps>(function TopbarLeading(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(styles.zone, styles.leading, className)}
      data-topbar-zone="leading"
      {...rest}
    >
      {children}
    </div>
  );
});

const TopbarCenter = forwardRef<HTMLDivElement, ZoneProps>(function TopbarCenter(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(styles.zone, styles.center, className)}
      data-topbar-zone="center"
      {...rest}
    >
      {children}
    </div>
  );
});

const TopbarTrailing = forwardRef<HTMLDivElement, ZoneProps>(function TopbarTrailing(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(styles.zone, styles.trailing, className)}
      data-topbar-zone="trailing"
      {...rest}
    >
      {children}
    </div>
  );
});

type TopbarComponent = typeof TopbarRoot & {
  Leading: typeof TopbarLeading;
  Center: typeof TopbarCenter;
  Trailing: typeof TopbarTrailing;
};

const Topbar = TopbarRoot as TopbarComponent;
Topbar.Leading = TopbarLeading;
Topbar.Center = TopbarCenter;
Topbar.Trailing = TopbarTrailing;

export { Topbar };
