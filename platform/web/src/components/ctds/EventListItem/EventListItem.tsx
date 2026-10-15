"use client";

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { Badge } from "../Badge";
import { Icon, type IconName } from "../Icon";

import styles from "./EventListItem.module.css";

/**
 * EventListItem — 리스트에 쌓이는 "하나의 일정" 아이템.
 * 좌: 날짜 블록 (큰 숫자 + 요일), 우: 제목 + status + meta.
 *
 * EventChip은 캘린더 셀 안 색 바 전용. 이 컴포넌트는 리스트 아이템.
 */

export type EventListItemStatus = "upcoming" | "pending" | "completed" | "cancelled";

/**
 * variant:
 * - "card"(기본) — border + radius + bg. 단독 떠있는 리스트 아이템.
 * - "line" — radius 없음, 하단 hairline만. 리스트가 가로 폭 꽉 채워 흐르는 자리.
 * - "fill" — 기본은 중립 soft bg. status를 명시하면 info/warning/success/destructive 톤으로 덮어씀.
 *   fill + status 조합일 땐 Badge 중복 방지로 자동 숨김.
 */
export type EventListItemVariant = "card" | "line" | "fill";

/**
 * size:
 * - "md"(기본) — 대시보드·상세 뷰 등 일반 자리.
 * - "sm" — 사이드바·밀집 리스트처럼 세로 공간이 아쉬운 자리.
 */
export type EventListItemSize = "md" | "sm";

export type EventListItemMeta = {
  icon?: IconName;
  label: ReactNode;
};

type Common = {
  date: Date;
  title: ReactNode;
  variant?: EventListItemVariant;
  size?: EventListItemSize;
  status?: EventListItemStatus;
  statusLabel?: ReactNode;
  meta?: EventListItemMeta[];
  /** 날짜 블록 오른쪽 세로 hairline 표시 여부. 기본 true. */
  showDateDivider?: boolean;
  /** meta 아이템 사이 세로 hairline 분리선 표시 여부. 기본 true. */
  showMetaDivider?: boolean;
};

type DivProps = Common &
  Omit<HTMLAttributes<HTMLDivElement>, keyof Common> & { href?: undefined };

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & { href: string };

export type EventListItemProps = DivProps | AnchorProps;

const statusMap: Record<
  EventListItemStatus,
  { badgeStatus: "info" | "warning" | "success" | "destructive"; defaultLabel: string }
> = {
  upcoming: { badgeStatus: "info", defaultLabel: "Upcoming" },
  pending: { badgeStatus: "warning", defaultLabel: "Pending" },
  completed: { badgeStatus: "success", defaultLabel: "Completed" },
  cancelled: { badgeStatus: "destructive", defaultLabel: "Cancelled" },
};

/* locale 고정 없이 사용자 로케일에 맡기면 리스트 안에서 길이가 들쭉날쭉.
   요일 3글자 약어는 en-US 기준으로 맞추고, 대문자 금지 규칙에 따라 수동 소문자화. */
function formatDay(date: Date): string {
  return String(date.getDate()).padStart(2, "0");
}
function formatWeekday(date: Date): string {
  return date
    .toLocaleDateString("en-US", { weekday: "short" })
    .toLowerCase();
}

const variantClass: Record<EventListItemVariant, string> = {
  card: styles.card,
  line: styles.line,
  fill: styles.fill,
};

const sizeClass: Record<EventListItemSize, string> = {
  md: styles.md,
  sm: styles.sm,
};

/* meta 아이콘 size — md는 14px, sm은 12px. */
const metaIconSize: Record<EventListItemSize, number> = {
  md: 14,
  sm: 12,
};

const fillStatusClass: Record<EventListItemStatus, string> = {
  upcoming: styles.fillInfo,
  pending: styles.fillWarning,
  completed: styles.fillSuccess,
  cancelled: styles.fillDestructive,
};

const EventListItem = forwardRef<HTMLElement, EventListItemProps>((props, ref) => {
  const {
    className,
    date,
    title,
    variant = "card",
    size = "md",
    status,
    statusLabel,
    meta,
    showDateDivider = true,
    showMetaDivider = true,
    ...rest
  } = props as Common & { className?: string } & Record<string, unknown>;

  const isLink = typeof (props as AnchorProps).href === "string";

  const rootClass = [
    styles.root,
    variantClass[variant],
    sizeClass[size],
    variant === "fill" && status ? fillStatusClass[status] : "",
    !showMetaDivider ? styles.noMetaDivider : "",
    isLink ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const mapped = status ? statusMap[status] : undefined;
  const effectiveStatusLabel = statusLabel ?? mapped?.defaultLabel;
  /* fill + status 조합일 때만 Badge 중복 숨김. fill 단독(중립 회색)일 땐 status 자체가 없다. */
  const showStatusBadge = Boolean(mapped) && !(variant === "fill" && status);

  const content = (
    <>
      <div className={styles.dateBlock} aria-hidden>
        <span className={styles.day}>{formatDay(date)}</span>
        <span className={styles.weekday}>{formatWeekday(date)}</span>
      </div>
      {showDateDivider && <div className={styles.divider} aria-hidden />}
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {(showStatusBadge || meta?.length) && (
          <div className={styles.metaRow}>
            {showStatusBadge && mapped && effectiveStatusLabel && (
              <Badge variant="soft" status={mapped.badgeStatus}>
                {effectiveStatusLabel}
              </Badge>
            )}
            {meta?.map((m, i) => (
              <span key={i} className={styles.metaItem}>
                {m.icon && (
                  <span className={styles.metaIcon} aria-hidden>
                    <Icon name={m.icon} size={metaIconSize[size]} />
                  </span>
                )}
                <span className={styles.metaLabel}>{m.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
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

EventListItem.displayName = "EventListItem";

export { EventListItem };
