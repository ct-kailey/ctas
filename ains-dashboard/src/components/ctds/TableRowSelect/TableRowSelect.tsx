"use client";

import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import type {
  TableHeaderAlign,
  TableHeaderVariant,
} from "../TableHeader";
import type { TableRowColumn, TableRowSize } from "../TableRow";
import rowStyles from "../TableRow/TableRow.module.css";
import styles from "./TableRowSelect.module.css";

/* ────────────────────────────────────────────────────────────
   TableRowSelect
   ──────────────────────────────────────────────────────────── */

export type TableRowSelectProps<T = unknown> = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "role"
> & {
  variant?: TableHeaderVariant;
  size?: TableRowSize;
  columns: TableRowColumn<T>[];
  order?: string[];
  widths?: Record<string, number>;
  data: T;

  /** 현재 행 선택 상태. */
  selected?: boolean;
  /** 행 클릭 또는 Space 키로 토글될 때 호출. */
  onSelectedChange?: (next: boolean) => void;

  disabled?: boolean;
};

/* ────────────────────────────────────────────────────────────
   Utilities (TableRow와 동일)
   ──────────────────────────────────────────────────────────── */

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

function alignToJustify(
  align: TableHeaderAlign | undefined,
): CSSProperties["justifyContent"] {
  return align === "end" ? "flex-end" : align === "center" ? "center" : "flex-start";
}

function resolveOrder<T>(columns: TableRowColumn<T>[], order?: string[]): string[] {
  if (!order) return columns.map((c) => c.key);
  const known = new Set(columns.map((c) => c.key));
  const filtered = order.filter((k) => known.has(k));
  const missing = columns.map((c) => c.key).filter((k) => !filtered.includes(k));
  return [...filtered, ...missing];
}

/* ────────────────────────────────────────────────────────────
   Component
   ──────────────────────────────────────────────────────────── */

function TableRowSelectInner<T>(
  props: TableRowSelectProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const {
    className,
    variant = "line",
    size = "md",
    columns,
    order,
    widths,
    data,
    selected = false,
    onSelectedChange,
    disabled = false,
    onKeyDown,
    tabIndex,
    ...rest
  } = props;

  const orderedKeys = resolveOrder(columns, order);
  const columnMap = new Map(columns.map((c) => [c.key, c]));

  const rootClass = [
    rowStyles.root,
    variant === "plate" ? rowStyles.plate : rowStyles.line,
    size === "sm"
      ? rowStyles.sizeSm
      : size === "lg"
        ? rowStyles.sizeLg
        : rowStyles.sizeMd,
    selected ? styles.selected : "",
    disabled ? rowStyles.disabled : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const toggle = () => {
    if (disabled) return;
    onSelectedChange?.(!selected);
  };

  const handleRowClick = (e: MouseEvent<HTMLDivElement>) => {
    rest.onClick?.(e);
    toggle();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (disabled) return;
    if (e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div
      ref={ref}
      role="row"
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? undefined : (tabIndex ?? 0)}
      className={rootClass}
      onClick={disabled ? undefined : handleRowClick}
      onKeyDown={disabled ? undefined : handleKeyDown}
      {...rest}
    >
      {orderedKeys.map((key) => {
        const col = columnMap.get(key);
        if (!col) return null;
        const cssWidth =
          widths?.[col.key] !== undefined
            ? `${widths[col.key]}px`
            : toCssSize(col.width);
        const slotStyle: CSSProperties = {
          width: cssWidth,
          minWidth: toCssSize(col.minWidth) ?? cssWidth,
          flex: col.flex ? "1 1 0" : undefined,
          justifyContent: alignToJustify(col.align),
        };
        const content: ReactNode = col.render
          ? col.render(data)
          : (data as Record<string, ReactNode>)?.[col.key];
        return (
          <div key={col.key} className={rowStyles.cellSlot} style={slotStyle}>
            <div
              role="cell"
              className={rowStyles.cell}
              data-align={col.align ?? "start"}
            >
              <span className={rowStyles.cellInner}>{content}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TableRowSelect = forwardRef(TableRowSelectInner) as <T>(
  props: TableRowSelectProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof TableRowSelectInner>;

export { TableRowSelect };
