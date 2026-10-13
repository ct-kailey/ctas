"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import { IconButton } from "../IconButton";

import styles from "./Callout.module.css";

/**
 * Callout — 사이드바·패널·공백 영역에 얹는 소형 홍보/안내 카드.
 * 좌상단 아이콘, 우상단 닫기, 타이틀 · 본문 · 하단 액션 슬롯 구조.
 *
 * 배치 규칙:
 *  - actions 슬롯은 하단(기본) 또는 우측(actionsPlacement="right"). Sidebar 좁은 폭엔 bottom.
 *  - dismissible=true면 우상단 닫기 IconButton 렌더 + onDismiss 호출 (controlled 정책).
 */
export type CalloutTone = "neutral" | "brand" | "success" | "warning" | "destructive";
export type CalloutVariant = "fill" | "outline";
export type CalloutActionsPlacement = "bottom" | "right";

export interface CalloutProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: IconName;
  title: ReactNode;
  /** 본문. 짧게 유지 — 3~4줄 안쪽. */
  children?: ReactNode;
  /** 하단(또는 우측) 액션 슬롯. Button/Link 자유 배치. */
  actions?: ReactNode;
  actionsPlacement?: CalloutActionsPlacement;
  /** 카드 표면 강도. fill=tone tint 표면, outline=표면 투명 + 경계. */
  variant?: CalloutVariant;
  /** tone은 아이콘·강조 색만 스왑. 표면·본문 텍스트는 유지. */
  tone?: CalloutTone;
  /** 우상단 닫기 버튼 표시. 상태는 부모가 관리 — onDismiss만 콜백. */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** 스크린리더용 닫기 라벨. i18n을 위해 프롬프트가 아닌 부모가 넘긴다. */
  dismissLabel?: string;
}

const toneClass: Record<CalloutTone, string> = {
  neutral: styles.neutral,
  brand: styles.brand,
  success: styles.success,
  warning: styles.warning,
  destructive: styles.destructive,
};

const variantClass: Record<CalloutVariant, string> = {
  fill: styles.fill,
  outline: styles.outline,
};

/**
 * tone별 기본 아이콘.
 * warning: warning-circle (원+느낌표, "주의")
 * destructive: warning (삼각형+느낌표, "위험")
 * 나머지 tone은 기본 아이콘 없음 — 사용자가 icon prop으로 지정.
 */
const toneDefaultIcon: Partial<Record<CalloutTone, IconName>> = {
  warning: "warning-circle",
  destructive: "warning",
};

const Callout = forwardRef<HTMLDivElement, CalloutProps>(
  (
    {
      className,
      icon,
      title,
      children,
      actions,
      actionsPlacement = "bottom",
      variant = "fill",
      tone = "brand",
      dismissible = false,
      onDismiss,
      dismissLabel,
      ...rest
    },
    ref,
  ) => {
    const rootClass = [
      styles.root,
      variantClass[variant],
      toneClass[tone],
      actionsPlacement === "right" ? styles.actionsRight : styles.actionsBottom,
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const resolvedIcon = icon ?? toneDefaultIcon[tone];
    const isRight = actionsPlacement === "right";

    const dismissBtn = dismissible ? (
      <IconButton
        className={styles.dismiss}
        size="md"
        variant="ghost"
        icon={<Icon name="x" />}
        onClick={onDismiss}
        aria-label={dismissLabel}
      />
    ) : null;

    return (
      <div ref={ref} className={rootClass} {...rest}>
        <div className={styles.head}>
          {resolvedIcon && (
            <span className={styles.icon} aria-hidden>
              <Icon name={resolvedIcon} />
            </span>
          )}
          <div className={styles.title}>{title}</div>
          {!isRight && dismissBtn}
        </div>
        {children && <div className={styles.body}>{children}</div>}
        {isRight ? (
          <div
            className={[styles.side, dismissible ? "" : styles.sideNoDismiss]
              .filter(Boolean)
              .join(" ")}
          >
            {dismissBtn}
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>
        ) : (
          actions && <div className={styles.actions}>{actions}</div>
        )}
      </div>
    );
  },
);

Callout.displayName = "Callout";

export { Callout };
