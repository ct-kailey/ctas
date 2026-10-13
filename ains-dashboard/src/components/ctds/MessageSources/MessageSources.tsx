"use client";

import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import styles from "./MessageSources.module.css";

export interface MessageSource {
  id: string;
  label: string;
  href?: string;
  /** 왼쪽 favicon. 없으면 중성 원형 placeholder. */
  icon?: ReactNode;
}

export interface MessageSourcesProps extends HTMLAttributes<HTMLButtonElement> {
  sources: MessageSource[];
  /** 라벨 override. 기본 "Sources". */
  label?: string;
  /** 겹쳐 보여줄 favicon 최대 개수. 기본 3. */
  maxFavicons?: number;
  /** chip 클릭 시 (popover 열기 등). 외부에서 처리. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

/** AIMessage의 MessageActions 바 옆에 inline으로 들어가는 작은 chip.
 *  [겹친 favicon stack] + 라벨 (+N) 형태. 클릭 시 popover 등은 소비처가 조립. */
export function MessageSources({
  sources,
  label = "Sources",
  maxFavicons = 3,
  onClick,
  className,
  ...rest
}: MessageSourcesProps) {
  const visible = sources.slice(0, maxFavicons);

  const cls = [styles.root, className].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      aria-label={`${label} (${sources.length})`}
      {...rest}
    >
      <span className={styles.stack} aria-hidden>
        {visible.map((s, i) => (
          <span
            key={s.id}
            className={styles.favicon}
            style={{ ["--stack-i" as string]: String(i) }}
          >
            {s.icon ?? null}
          </span>
        ))}
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
