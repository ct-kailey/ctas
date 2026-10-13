import { forwardRef, type HTMLAttributes } from "react";

import styles from "./TableCell.module.css";

export type TableCellNumberProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  value: number | string;
  /** Intl.NumberFormat 옵션. value가 number일 때 적용. */
  format?: Intl.NumberFormatOptions;
  /** 로케일. 지정 안 하면 브라우저 기본. */
  locale?: string;
  /** 숫자 뒤에 붙는 단위(원·%·ms 등). fg-muted 톤으로 렌더. */
  unit?: string;
  /** 음수 하이라이트 — destructive 톤. */
  highlightNegative?: boolean;
};

export const TableCellNumber = forwardRef<HTMLSpanElement, TableCellNumberProps>(
  function TableCellNumber(
    { className, value, format, locale, unit, highlightNegative, ...rest },
    ref,
  ) {
    const numeric = typeof value === "number" ? value : Number(value);
    const isNegative = highlightNegative && !Number.isNaN(numeric) && numeric < 0;
    const text =
      typeof value === "number"
        ? new Intl.NumberFormat(locale, format).format(value)
        : String(value);
    const cls = [
      styles.base,
      styles.number,
      isNegative ? styles.numberNegative : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <span ref={ref} className={cls} {...rest}>
        <span>{text}</span>
        {unit && <span className={styles.numberUnit}>{unit}</span>}
      </span>
    );
  },
);
