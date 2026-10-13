import { forwardRef, type HTMLAttributes } from "react";

import styles from "./TableCell.module.css";

export type TableCellMeterTone = "default" | "success" | "warning" | "destructive";

export type TableCellMeterProps = HTMLAttributes<HTMLSpanElement> & {
  /** 0~100. 범위 밖은 clamp. */
  value: number;
  /** 트랙 폭(px). 기본 80. 셀 폭에 맞춰 조정. */
  width?: number;
  /** 수치 라벨 위치 — right(기본), none. */
  labelPosition?: "right" | "none";
  /** 수치 표기 포맷. 기본 `{value}%`. */
  format?: (value: number) => string;
  /** 톤 — 상태 전달용. */
  tone?: TableCellMeterTone;
};

const toneClass: Record<TableCellMeterTone, string> = {
  default: "",
  success: styles.meterSuccess,
  warning: styles.meterWarning,
  destructive: styles.meterDestructive,
};

export const TableCellMeter = forwardRef<HTMLSpanElement, TableCellMeterProps>(
  function TableCellMeter(
    { className, value, width = 80, labelPosition = "right", format, tone = "default", style, ...rest },
    ref,
  ) {
    const clamped = Math.max(0, Math.min(100, value));
    const text = (format ?? ((v: number) => `${Math.round(v)}%`))(clamped);
    const cls = [styles.base, styles.meter, toneClass[tone], className ?? ""]
      .filter(Boolean)
      .join(" ");
    return (
      <span
        ref={ref}
        className={cls}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        style={style}
        {...rest}
      >
        <span className={styles.meterTrack} style={{ width }}>
          <span className={styles.meterFill} style={{ width: `${clamped}%` }} />
        </span>
        {labelPosition === "right" && <span className={styles.meterLabel}>{text}</span>}
      </span>
    );
  },
);
