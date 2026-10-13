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

export type EventChipProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: string;
  tone?: EventChipTone;
  /** outside 월·과거 등으로 흐리게 표시. */
  faded?: boolean;
};

const EventChip = forwardRef<HTMLDivElement, EventChipProps>(function EventChip(
  { className, title, tone = "default", faded, ...rest },
  ref,
) {
  const cls = [styles.root, className].filter(Boolean).join(" ");
  return (
    <div
      ref={ref}
      className={cls}
      data-tone={tone}
      data-faded={faded || undefined}
      {...rest}
    >
      <span className={styles.title}>{title}</span>
    </div>
  );
});

export { EventChip };
