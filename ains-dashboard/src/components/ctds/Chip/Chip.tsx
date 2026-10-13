"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { Icon } from "../Icon";
import styles from "./Chip.module.css";

export type ChipSize = "sm" | "md";
export type ChipVariant = "soft" | "outline";

export type ChipProps = Omit<HTMLAttributes<HTMLSpanElement>, "onClick"> & {
  size?: ChipSize;
  variant?: ChipVariant;
  leftIcon?: ReactNode;
  /** 있으면 오른쪽 X 버튼 렌더. 클릭 시 호출. */
  onRemove?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** 제거 버튼 접근성 라벨. onRemove와 세트. */
  removeLabel?: string;
  disabled?: boolean;
};

const sizeClass: Record<ChipSize, string> = {
  sm: styles.sm,
  md: styles.md,
};

const variantClass: Record<ChipVariant, string> = {
  soft: styles.soft,
  outline: styles.outline,
};

const ICON_SIZE: Record<ChipSize, number> = {
  sm: 12,
  md: 14,
};

function sizedIcon(node: ReactNode, size: number): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size });
}

const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  (
    {
      className,
      size = "md",
      variant = "soft",
      leftIcon,
      onRemove,
      removeLabel = "제거",
      disabled = false,
      children,
      ...rest
    },
    ref,
  ) => {
    const rootClass = [
      styles.root,
      sizeClass[size],
      variantClass[variant],
      disabled ? styles.disabled : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <span ref={ref} className={rootClass} {...rest}>
        {leftIcon && (
          <span className={styles.icon} aria-hidden>
            {sizedIcon(leftIcon, ICON_SIZE[size])}
          </span>
        )}
        {children && <span className={styles.label}>{children}</span>}
        {onRemove && (
          <button
            type="button"
            className={styles.remove}
            onClick={onRemove}
            disabled={disabled}
            aria-label={removeLabel}
          >
            <Icon name="x" size={ICON_SIZE[size]} />
          </button>
        )}
      </span>
    );
  },
);

Chip.displayName = "Chip";

export { Chip };
