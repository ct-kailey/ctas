"use client";

import {
  forwardRef,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { Slot } from "@radix-ui/react-slot";

import styles from "./IconButton.module.css";

/**
 * IconButton 크기.
 * ⚠️ Button과 이름은 같지만 실제 크기는 한 단계씩 작다:
 *  - IconButton md(24) ↔ Button sm(28)
 *  - IconButton lg(32) ↔ Button md(32)
 * 같은 툴바에 나란히 놓을 때 위 매핑을 기준으로 크기를 맞춘다.
 */
export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonVariant = "secondary" | "outline" | "ghost" | "destructive";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 아이콘 요소. asChild=true일 땐 자식 요소가 아이콘/링크 전체를 담당하므로 무시된다. */
  icon?: ReactNode;
  /** 트레일링 슬롯. caret-down 같은 보조 아이콘을 넣으면 정사각형→가로형(dual)로 자동 전환. */
  trailingIcon?: ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  asChild?: boolean;
}

const sizeClassMap: Record<IconButtonSize, string> = {
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
};

const variantClassMap: Record<IconButtonVariant, string> = {
  secondary: styles.secondary,
  outline: styles.outline,
  ghost: styles.ghost,
  destructive: styles.destructive,
};

type PhosphorIconProps = { weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone" };

function withPhosphorWeight(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<PhosphorIconProps>;
  return cloneElement(el, { weight: el.props.weight ?? "regular" });
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      icon,
      trailingIcon,
      size = "md",
      variant = "ghost",
      asChild = false,
      type,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const dual = trailingIcon !== undefined && trailingIcon !== null && trailingIcon !== false;

    const rootClass = [
      styles.root,
      sizeClassMap[size],
      variantClassMap[variant],
      dual ? styles.dual : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    // asChild=true → 자식 요소(예: <a><Icon/></a>)가 아이콘 렌더를 담당.
    // Slot은 단일 자식만 허용하므로 icon/trailingIcon은 무시하고 children을 그대로 넘긴다.
    const content = asChild ? (
      children
    ) : (
      <>
        {withPhosphorWeight(icon)}
        {dual && withPhosphorWeight(trailingIcon)}
      </>
    );

    return (
      <Comp
        ref={ref}
        className={rootClass}
        type={asChild ? undefined : (type ?? "button")}
        data-dual={dual || undefined}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);

IconButton.displayName = "IconButton";

export { IconButton };
