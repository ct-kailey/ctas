"use client";

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { Icon, type IconName } from "../Icon";

import styles from "./MetricCard.module.css";

/**
 * MetricCard — 대시보드 상단 KPI/Stat 카드.
 * label + value + 선택적 아이콘 + trend 매핑된 inline delta + 선택적 보조 설명.
 *
 * trend prop을 주면 delta는 trend-up/trend-down/minus 아이콘 + 숫자 inline으로 자동 생성.
 * delta를 직접 ReactNode로 주면 수동 모드, trend 매핑은 무시된다.
 */
export type MetricCardVariant = "line" | "soft" | "bare";
export type MetricCardTrend = "up" | "down" | "flat";

type Common = {
  label: ReactNode;
  value: ReactNode;
  icon?: IconName;
  trend?: MetricCardTrend;
  deltaLabel?: ReactNode;
  delta?: ReactNode;
  description?: ReactNode;
  variant?: MetricCardVariant;
};

type DivProps = Common &
  Omit<HTMLAttributes<HTMLDivElement>, keyof Common> & {
    href?: undefined;
  };

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & {
    href: string;
  };

export type MetricCardProps = DivProps | AnchorProps;

const variantClass: Record<MetricCardVariant, string> = {
  line: styles.line,
  soft: styles.soft,
  bare: styles.bare,
};

const trendIcon: Record<MetricCardTrend, IconName> = {
  up: "trend-up",
  down: "trend-down",
  flat: "minus",
};

const MetricCard = forwardRef<HTMLElement, MetricCardProps>((props, ref) => {
  const {
    className,
    label,
    value,
    icon,
    trend,
    deltaLabel,
    delta,
    description,
    variant = "line",
    ...rest
  } = props as Common & { className?: string } & Record<string, unknown>;

  const isLink = typeof (props as AnchorProps).href === "string";

  const rootClass = [
    styles.root,
    variantClass[variant],
    isLink ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const resolvedDelta =
    delta ??
    (trend && deltaLabel !== undefined ? (
      <span className={styles.delta} data-trend={trend}>
        <span className={styles.deltaIcon} aria-hidden>
          <Icon name={trendIcon[trend]} />
        </span>
        <span>{deltaLabel}</span>
      </span>
    ) : null);

  const content = (
    <>
      <div className={styles.head}>
        {icon && (
          <span className={styles.icon} aria-hidden>
            <Icon name={icon} />
          </span>
        )}
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.valueRow}>
        <span className={styles.value}>{value}</span>
        {resolvedDelta}
      </div>
      {description && <div className={styles.description}>{description}</div>}
    </>
  );

  if (isLink) {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={rootClass}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        href={(props as AnchorProps).href}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={rootClass}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {content}
    </div>
  );
});

MetricCard.displayName = "MetricCard";

export { MetricCard };
