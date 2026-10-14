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

import styles from "./EventCard.module.css";

/**
 * EventCard — 리스트에 쌓이는 "하나의 일정" 아이템.
 * 좌: 날짜 블록 (큰 숫자 + 요일), 우: 제목 + status + meta.
 *
 * EventChip은 캘린더 셀 안 색 바 전용. 이 컴포넌트는 리스트 카드.
 */

export type EventCardStatus = "upcoming" | "pending" | "completed" | "cancelled";

export type EventCardMeta = {
  icon?: IconName;
  label: ReactNode;
};

type Common = {
  date: Date;
  title: ReactNode;
  status?: EventCardStatus;
  statusLabel?: ReactNode;
  meta?: EventCardMeta[];
};

type DivProps = Common &
  Omit<HTMLAttributes<HTMLDivElement>, keyof Common> & { href?: undefined };

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & { href: string };

export type EventCardProps = DivProps | AnchorProps;

const statusMap: Record<
  EventCardStatus,
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

const EventCard = forwardRef<HTMLElement, EventCardProps>((props, ref) => {
  const {
    className,
    date,
    title,
    status,
    statusLabel,
    meta,
    ...rest
  } = props as Common & { className?: string } & Record<string, unknown>;

  const isLink = typeof (props as AnchorProps).href === "string";

  const rootClass = [
    styles.root,
    isLink ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const mapped = status ? statusMap[status] : undefined;
  const effectiveStatusLabel = statusLabel ?? mapped?.defaultLabel;

  const content = (
    <>
      <div className={styles.dateBlock} aria-hidden>
        <span className={styles.day}>{formatDay(date)}</span>
        <span className={styles.weekday}>{formatWeekday(date)}</span>
      </div>
      <div className={styles.divider} aria-hidden />
      <div className={styles.body}>
        <h3 className={styles.title}>{title}</h3>
        {(mapped || meta?.length) && (
          <div className={styles.metaRow}>
            {mapped && effectiveStatusLabel && (
              <Badge variant="soft" status={mapped.badgeStatus}>
                {effectiveStatusLabel}
              </Badge>
            )}
            {meta?.map((m, i) => (
              <span key={i} className={styles.metaItem}>
                {m.icon && (
                  <span className={styles.metaIcon} aria-hidden>
                    <Icon name={m.icon} size={12} />
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

EventCard.displayName = "EventCard";

export { EventCard };
