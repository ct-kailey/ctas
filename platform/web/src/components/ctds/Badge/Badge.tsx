import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import styles from "./Badge.module.css";

export type BadgeSize = "sm" | "md";
export type BadgeVariant = "solid" | "soft" | "inverse";
export type BadgeStatus = "success" | "warning" | "destructive" | "info";
/** 기본은 "square". pill은 웬만하면 쓰지 않는다 —
 *  Shape 축이 전역적으로 radius를 조절하므로, 특정 컴포넌트가 pill로 모양을 고정하면
 *  축 스왑 효과가 사라지고 테마 간 톤이 깨진다. 알림·카운터 등 "원형이 의미인" 경우에만 opt-in. */
export type BadgeShape = "square" | "pill";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  size?: BadgeSize;
  variant?: BadgeVariant;
  status?: BadgeStatus;
  shape?: BadgeShape;
  children?: ReactNode;
};

const sizeClass: Record<BadgeSize, string> = {
  sm: styles.sm,
  md: styles.md,
};

const variantClass: Record<BadgeVariant, string> = {
  solid: styles.solid,
  soft: styles.soft,
  inverse: styles.inverse,
};

const statusClass: Record<BadgeStatus, string> = {
  success: styles.success,
  warning: styles.warning,
  destructive: styles.destructive,
  info: styles.info,
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, size = "sm", variant = "solid", status, shape = "square", children, ...rest }, ref) => {
    /* solid/inverse는 알림·강조 전용 — primary·bg 톤만 허용. status와 조합 금지. */
    const effectiveStatus = variant === "soft" ? status : undefined;
    if (process.env.NODE_ENV !== "production" && variant !== "soft" && status) {
      console.warn(
        `[Badge] status는 variant="soft" 전용입니다. solid/inverse는 강조 톤이라 상태색과 조합하지 않습니다.`,
      );
    }
    const cls = [
      styles.root,
      sizeClass[size],
      variantClass[variant],
      effectiveStatus ? statusClass[effectiveStatus] : "",
      shape === "pill" ? styles.pill : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <span ref={ref} className={cls} {...rest}>
        {children}
      </span>
    );
  },
);

Badge.displayName = "Badge";

export { Badge };
