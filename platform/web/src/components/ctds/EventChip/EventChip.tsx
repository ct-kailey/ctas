"use client";

import { forwardRef, type HTMLAttributes } from "react";

import styles from "./EventChip.module.css";

export type EventChipTone =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type EventChipVariant = "default" | "dot";

export type EventChipProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: string;
  tone?: EventChipTone;
  /** 표현 밀도. dot은 색 점 하나만 노출(초미니멀). 기본 default는 라벨 바. */
  variant?: EventChipVariant;
  /** outside 월·과거 등으로 흐리게 표시. */
  faded?: boolean;
};

const EventChip = forwardRef<HTMLDivElement, EventChipProps>(function EventChip(
  { className, title, tone = "default", variant = "default", faded, ...rest },
  ref,
) {
  const cls = [styles.root, className].filter(Boolean).join(" ");
  return (
    <div
      ref={ref}
      className={cls}
      data-tone={tone}
      data-variant={variant}
      data-faded={faded || undefined}
      aria-label={variant === "dot" ? title : undefined}
      {...rest}
    >
      {variant === "dot" ? null : <span className={styles.title}>{title}</span>}
    </div>
  );
});

export { EventChip };
