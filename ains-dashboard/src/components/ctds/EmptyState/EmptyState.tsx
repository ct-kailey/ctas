"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../Icon";

import styles from "./EmptyState.module.css";

/**
 * EmptyState — 리스트·테이블·대시보드 영역이 비었을 때 그 영역 전체를 채우는 자리채움.
 * 세로 중앙정렬: 시각 요소(illustration ∨ icon) → 타이틀 → 설명 → 액션.
 *
 * 배치 규칙:
 *  - size는 **컨테이너 폭/영역 크기**에 맞춰 선택 (sm/md/lg)
 *  - illustration이 있으면 icon은 무시 (병치 금지)
 *  - 액션은 Button slot. primary 1 + ghost 1 패턴, destructive 금지
 */
export type EmptyStateSize = "sm" | "md";

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  size?: EmptyStateSize;
  /** 큰 3D 일러스트 등 ReactNode. 지정되면 icon보다 우선. */
  illustration?: ReactNode;
  /** illustration이 없을 때만 렌더되는 Icon slot. */
  icon?: IconName;
  title: ReactNode;
  description?: ReactNode;
  /** Button 1~2개. primary 1 + ghost 1 패턴 권장. */
  actions?: ReactNode;
}

const sizeClass: Record<EmptyStateSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
};

const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      className,
      size = "sm",
      illustration,
      icon,
      title,
      description,
      actions,
      ...rest
    },
    ref,
  ) => {
    const rootClass = [styles.root, sizeClass[size], className ?? ""]
      .filter(Boolean)
      .join(" ");

    const visual = illustration ? (
      <div className={styles.illustration} aria-hidden>
        {illustration}
      </div>
    ) : icon ? (
      <span className={styles.icon} aria-hidden>
        <Icon name={icon} />
      </span>
    ) : null;

    return (
      <div ref={ref} className={rootClass} {...rest}>
        {visual}
        <div className={styles.text}>
          <div className={styles.title}>{title}</div>
          {description && <div className={styles.description}>{description}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    );
  },
);

EmptyState.displayName = "EmptyState";

export { EmptyState };
