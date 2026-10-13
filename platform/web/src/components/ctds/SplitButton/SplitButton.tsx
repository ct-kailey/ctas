"use client";

import {
  cloneElement,
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import { Icon } from "../Icon";
import styles from "./SplitButton.module.css";

export type SplitButtonVariant =
  | "primary"
  | "inverse"
  | "secondary"
  | "outline";

export type SplitButtonSize = "sm" | "md" | "lg";

type NativeButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size" | "onClick">;

export interface SplitButtonProps extends NativeButtonProps {
  size?: SplitButtonSize;
  variant?: SplitButtonVariant;
  fullWidth?: boolean;
  /** main 라벨 앞 아이콘 (선택) */
  leftIcon?: ReactNode;
  /** main 버튼 라벨 */
  children: ReactNode;
  /** main 영역 클릭 */
  onMainClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  /** menu(caret) 영역 클릭 — 드롭다운 트리거 */
  onMenuClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  /** menu 영역 스크린리더 라벨. 예: "옵션 더보기" */
  menuLabel: string;
  /** menu 영역 아이콘. 기본 caret-down 대체용 */
  menuIcon?: ReactNode;
  /** 로딩·disabled는 main·menu 모두에 적용 */
  loading?: boolean;
}

const variantClass: Record<SplitButtonVariant, string> = {
  primary: styles.primary,
  inverse: styles.inverse,
  secondary: styles.secondary,
  outline: styles.outline,
};

const sizeClass: Record<SplitButtonSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

const ICON_SIZE: Record<SplitButtonSize, number> = {
  sm: 16,
  md: 16,
  lg: 20,
};

function sizedIcon(node: ReactNode, size: number): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size });
}

/**
 * SplitButton — main 액션 + 부가 메뉴(caret) 2-part 버튼.
 * 시각적으로 하나로 보이지만 클릭 영역이 분리되고, 각 영역이 독립 hover.
 * 접근성: 각 영역이 별개 <button>이며 menuLabel은 필수.
 */
const SplitButton = forwardRef<HTMLDivElement, SplitButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      fullWidth = false,
      leftIcon,
      children,
      onMainClick,
      onMenuClick,
      menuLabel,
      menuIcon,
      loading = false,
      disabled,
      type,
      ...rest
    },
    ref,
  ) => {
    const rootClass = [
      styles.root,
      variantClass[variant],
      sizeClass[size],
      fullWidth ? styles.fullWidth : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const partDisabled = disabled || loading;

    return (
      <div ref={ref} className={rootClass}>
        <button
          {...rest}
          type={type ?? "button"}
          className={`${styles.part} ${styles.main}`}
          onClick={onMainClick}
          disabled={partDisabled}
          data-loading={loading || undefined}
        >
          {leftIcon && (
            <span className={styles.icon} aria-hidden>
              {sizedIcon(leftIcon, ICON_SIZE[size])}
            </span>
          )}
          <span className={styles.label}>{children}</span>
        </button>
        <span className={styles.divider} aria-hidden />
        <button
          type="button"
          className={`${styles.part} ${styles.menu}`}
          onClick={onMenuClick}
          disabled={partDisabled}
          aria-label={menuLabel}
          aria-haspopup="menu"
        >
          <span className={styles.icon} aria-hidden>
            {sizedIcon(menuIcon ?? <Icon name="caret-down" />, ICON_SIZE[size])}
          </span>
        </button>
      </div>
    );
  },
);

SplitButton.displayName = "SplitButton";

export { SplitButton };
