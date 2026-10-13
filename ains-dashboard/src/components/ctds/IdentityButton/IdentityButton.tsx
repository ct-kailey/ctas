"use client";

import { forwardRef, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";

import { Avatar, type AvatarProps } from "../Avatar";
import styles from "./IdentityButton.module.css";

export type IdentityButtonSize = "sm" | "md" | "lg";
export type IdentityButtonVariant = "ghost" | "muted";

export interface IdentityButtonProps {
  size?: IdentityButtonSize;
  variant?: IdentityButtonVariant;
  /** 왼쪽 식별 요소. Avatar props를 패스스루하거나 ReactNode(Icon 등) 직접 삽입. 둘 다 생략 가능. */
  avatar?: Omit<AvatarProps, "size" | "name" | "alt"> & { name?: string; alt?: string };
  leading?: ReactNode;
  /** 1줄 라벨. 메인 식별자. */
  name: ReactNode;
  /** 2번째 줄 — 메타·역할·설명. 생략 시 1줄 모드. */
  sub?: ReactNode;
  /** 오른쪽 trailing — caret-down, IconButton, Badge 등. collapsed일 땐 숨김. */
  trailing?: ReactNode;
  /** 선택 상태 (switcher 리스트의 현재 선택 등). */
  active?: boolean;
  disabled?: boolean;
  /** icon-only 모드. leading/avatar만 남기고 라벨·sub·trailing 숨김. Sidebar가 자동 주입. */
  collapsed?: boolean;
  /** Radix Slot — DropdownMenu.Trigger 등 상위 트리거에 위임. */
  asChild?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  "aria-label"?: string;
  "aria-haspopup"?: boolean | "menu" | "dialog" | "listbox" | "tree" | "grid";
  "aria-expanded"?: boolean;
}

const sizeToAvatar: Record<IdentityButtonSize, AvatarProps["size"]> = {
  sm: "sm",
  md: "md",
  lg: "md",
};

const IdentityButton = forwardRef<HTMLButtonElement, IdentityButtonProps>(
  function IdentityButton(
    {
      size = "md",
      variant = "ghost",
      avatar,
      leading,
      name,
      sub,
      trailing,
      active,
      disabled,
      collapsed,
      asChild,
      className,
      onClick,
      ...a11y
    },
    ref,
  ) {
    const Comp: React.ElementType = asChild ? Slot : "button";

    const classes = [
      styles.root,
      styles[`size-${size}`],
      styles[`variant-${variant}`],
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const leadingNode =
      leading ??
      (avatar ? (
        <Avatar
          size={sizeToAvatar[size]}
          name={typeof name === "string" ? name : undefined}
          alt={typeof name === "string" ? name : undefined}
          {...avatar}
        />
      ) : null);

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : "button"}
        className={classes}
        data-active={active || undefined}
        data-collapsed={collapsed || undefined}
        data-single-line={!sub || undefined}
        disabled={disabled}
        onClick={onClick}
        {...a11y}
      >
        {leadingNode && <span className={styles.leading}>{leadingNode}</span>}
        {!collapsed && (
          <span className={styles.labels}>
            <span className={styles.name}>{name}</span>
            {sub && <span className={styles.sub}>{sub}</span>}
          </span>
        )}
        {!collapsed && trailing && (
          <span className={styles.trailing}>{trailing}</span>
        )}
      </Comp>
    );
  },
);

export { IdentityButton };
