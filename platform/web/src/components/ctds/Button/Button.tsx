"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { Slot } from "@radix-ui/react-slot";

import { Spinner, type SpinnerSize } from "../Spinner";
import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary"
  | "inverse"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "destructive-ghost";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "size"
> & {
  size?: ButtonSize;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** 라벨 오른쪽 트레일링 슬롯에 붙는 카운트·상태 뱃지.
   *  rightIcon과 공존 시 badge → rightIcon 순으로 배치. */
  badge?: ReactNode;
  asChild?: boolean;
  /** Content rows/cards retain their intrinsic height without changing normal buttons. */
  layout?: "inline" | "content";
};

const variantClass: Record<ButtonVariant, string> = {
  primary: styles.primary,
  inverse: styles.inverse,
  secondary: styles.secondary,
  outline: styles.outline,
  ghost: styles.ghost,
  destructive: styles.destructive,
  "destructive-ghost": styles.destructiveGhost,
};

const sizeClass: Record<ButtonSize, string> = {
  xs: styles.xs,
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

const ICON_SIZE: Record<ButtonSize, number> = {
  xs: 12,
  sm: 16,
  md: 16,
  lg: 20,
};

const SPINNER_SIZE: Record<ButtonSize, SpinnerSize> = {
  xs: "sm",
  sm: "sm",
  md: "sm",
  lg: "md",
};

function sizedIcon(node: ReactNode, size: number): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size });
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth = false,
      loading = false,
      leftIcon,
      rightIcon,
      badge,
      asChild = false,
      layout = "inline",
      disabled,
      type,
      children,
      ...rest
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    const rootClass = [
      styles.root,
      variantClass[variant],
      sizeClass[size],
      layout === "content" ? styles.contentLayout : "",
      fullWidth ? styles.fullWidth : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    /* asChild 모드: Slot은 자식이 정확히 하나여야 한다. leftIcon/label/badge/rightIcon을
       모두 넘기면 자식이 여러 개가 되어 터지므로, asChild일 때는 children을 그대로
       Slot에 넘기고(= 소비 측 anchor/div 하나) icon·badge prop은 무시. 아이콘은 소비
       측에서 anchor 내부에 직접 꽂아 single-child 조건을 지키도록 설계. */
    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={rootClass}
          data-loading={loading || undefined}
          data-ctds="button"
          aria-busy={loading || undefined}
          disabled={disabled || loading}
          {...rest}
        >
          {children}
        </Slot>
      );
    }

    return (
      <Comp
        ref={ref}
        data-ctds="button"
        className={rootClass}
        type={type ?? "button"}
        disabled={disabled || loading}
        data-loading={loading || undefined}
        aria-busy={loading || undefined}
        aria-label={rest["aria-label"] ?? (loading && typeof children === "string" ? children : undefined)}
        {...rest}
      >
        {leftIcon && (
          <span className={styles.icon} aria-hidden>
            {sizedIcon(leftIcon, ICON_SIZE[size])}
          </span>
        )}
        <span className={styles.label}>{children}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
        {rightIcon && (
          <span className={styles.icon} aria-hidden>
            {sizedIcon(rightIcon, ICON_SIZE[size])}
          </span>
        )}
        {loading && (
          <span className={styles.spinner} aria-hidden>
            <Spinner size={SPINNER_SIZE[size]} />
          </span>
        )}
      </Comp>
    );
  },
);

Button.displayName = "Button";

export { Button };
