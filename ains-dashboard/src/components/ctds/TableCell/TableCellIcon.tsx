import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../Icon";
import styles from "./TableCell.module.css";

export type TableCellIconTone = "default" | "muted" | "subtle" | "strong" | "accent";

export type TableCellIconProps = HTMLAttributes<HTMLSpanElement> & {
  /** 아이콘 이름. CTDS Icon 세트 기준. */
  name: IconName;
  /** 아이콘 옆 라벨. 미지정 시 아이콘만. */
  label?: ReactNode;
  /** 아이콘 톤. 셀 전반의 색을 결정. */
  tone?: TableCellIconTone;
  /** 아이콘 크기(px). 기본 16 — 셀 min-height 안쪽. */
  size?: number;
};

const toneClass: Record<TableCellIconTone, string> = {
  default: "",
  muted: styles.iconMuted,
  subtle: styles.iconSubtle,
  strong: styles.iconStrong,
  accent: styles.iconAccent,
};

export const TableCellIcon = forwardRef<HTMLSpanElement, TableCellIconProps>(
  function TableCellIcon({ className, name, label, tone = "default", size = 16, ...rest }, ref) {
    const cls = [styles.base, styles.icon, toneClass[tone], className ?? ""]
      .filter(Boolean)
      .join(" ");
    return (
      <span ref={ref} className={cls} {...rest}>
        <Icon name={name} size={size} />
        {label != null && <span className={styles.text}>{label}</span>}
      </span>
    );
  },
);
