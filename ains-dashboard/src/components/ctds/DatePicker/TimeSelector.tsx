"use client";

import { useMemo } from "react";
import { MenuItem } from "../MenuItem";
import styles from "./DatePicker.module.css";

function formatHM12(h: number, m: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export interface TimeSelectorProps {
  /** null이면 시간이 아직 미설정. */
  value: { hours: number; minutes: number } | null;
  onChange: (v: { hours: number; minutes: number }) => void;
  /** 표시 시작 시(포함). 기본 0 */
  startHour?: number;
  /** 표시 종료 시(제외). 기본 24 */
  endHour?: number;
  /** 라벨 (from/to 구분 등) */
  label?: string;
}

export function TimeSelector({
  value,
  onChange,
  startHour = 0,
  endHour = 24,
  label,
}: TimeSelectorProps) {
  const slots = useMemo(() => {
    const list: { h: number; m: number }[] = [];
    for (let h = startHour; h < endHour; h += 1) {
      list.push({ h, m: 0 });
      list.push({ h, m: 30 });
    }
    return list;
  }, [startHour, endHour]);

  return (
    <div className={styles.timeSection}>
      {label && <div className={styles.timeLabel}>{label}</div>}
      <div
        className={`${styles.timeList} scroll-fade-y`}
        role="listbox"
        aria-label="시간 선택"
      >
        <div className={styles.timeListTrack}>
          {slots.map(({ h, m }) => {
            const active = !!(value && value.hours === h && value.minutes === m);
            return (
              <MenuItem
                key={`${h}-${m}`}
                size="sm"
                active={active}
                role="option"
                aria-selected={active}
                onClick={() => onChange({ hours: h, minutes: m })}
              >
                {formatHM12(h, m)}
              </MenuItem>
            );
          })}
        </div>
      </div>
    </div>
  );
}
