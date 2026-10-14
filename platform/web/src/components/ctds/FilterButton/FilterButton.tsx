"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import styles from "./FilterButton.module.css";

export type FilterButtonSize = "sm" | "md";

export type FilterButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "size"
> & {
  size?: FilterButtonSize;
  selected?: boolean;
  onPressedChange?: (next: boolean) => void;
  leftIcon?: ReactNode;
  count?: number;
};

const sizeClass: Record<FilterButtonSize, string> = {
  sm: styles.sm,
  md: styles.md,
};

const ICON_SIZE: Record<FilterButtonSize, number> = {
  sm: 14,
  md: 16,
};

function sizedIcon(node: ReactNode, size: number): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size });
}

const FilterButton = forwardRef<HTMLButtonElement, FilterButtonProps>(
  (
    {
      className,
      size = "md",
      selected = false,
      onPressedChange,
      onClick,
      leftIcon,
      count,
      type,
      children,
      ...rest
    },
    ref,
  ) => {
    const rootClass = [styles.root, sizeClass[size], className ?? ""]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={rootClass}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) onPressedChange?.(!selected);
        }}
        aria-pressed={selected}
        {...rest}
      >
        {leftIcon && (
          <span className={styles.icon} aria-hidden>
            {sizedIcon(leftIcon, ICON_SIZE[size])}
          </span>
        )}
        {children && <span className={styles.label}>{children}</span>}
        {count !== undefined && (
          <span className={styles.count} aria-hidden>
            {count}
          </span>
        )}
      </button>
    );
  },
);

FilterButton.displayName = "FilterButton";

export { FilterButton };
