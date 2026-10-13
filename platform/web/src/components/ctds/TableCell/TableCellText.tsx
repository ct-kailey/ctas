import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import styles from "./TableCell.module.css";

export type TableCellTextTone = "default" | "strong" | "muted" | "subtle";

export type TableCellTextProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: TableCellTextTone;
  children?: ReactNode;
};

const toneClass: Record<TableCellTextTone, string> = {
  default: "",
  strong: styles.textStrong,
  muted: styles.textMuted,
  subtle: styles.textSubtle,
};

export const TableCellText = forwardRef<HTMLSpanElement, TableCellTextProps>(
  function TableCellText({ className, tone = "default", children, ...rest }, ref) {
    const cls = [styles.base, styles.text, toneClass[tone], className ?? ""]
      .filter(Boolean)
      .join(" ");
    return (
      <span ref={ref} className={cls} {...rest}>
        {children}
      </span>
    );
  },
);
