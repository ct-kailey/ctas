"use client";

import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Checkbox } from "../Checkbox";
import { pinnedStyle, type TableHeaderAlign } from "../TableHeader";
import type { TableRowColumn } from "../TableRow";
import rowStyles from "../TableRow/TableRow.module.css";
import styles from "./TableRowEdit.module.css";

/* ────────────────────────────────────────────────────────────
   TableRowEdit
   edit 모드 — Notion/Excel 스타일. 행 전체가 아닌 "셀"이 상호작용 단위.
   세로 구분선이 강제된다. 셀 콘텐츠는 호출 측에서 columns[].render로 꽂음
   (TableCell* 또는 Input/Select 등 편집 요소).

   variant 없음(line 외곽 고정). size는 sm(36)/md(40) 두 가지만 —
   edit은 스프레드시트 톤이라 lg 같은 큰 밀도는 어울리지 않음.
   ──────────────────────────────────────────────────────────── */

export type TableRowEditSize = "sm" | "md";

export type TableRowEditProps<T = unknown> = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "role"
> & {
  size?: TableRowEditSize;
  columns: TableRowColumn<T>[];
  order?: string[];
  widths?: Record<string, number>;
  data: T;

  /** 맨 앞 체크박스 셀 — 헤더 selectable과 짝. Notion처럼 '행 선택' 보조. */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (next: boolean) => void;

  /** 현재 포커스/편집 중인 셀의 column key. */
  activeCellKey?: string;
  /** 셀 클릭/키보드 활성화 시 호출. */
  onCellActivate?: (key: string) => void;

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

function TableRowEditInner<T>(
  props: TableRowEditProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const {
    className,
    size = "md",
    columns,
    order,
    widths,
    data,
    selectable = false,
    selected = false,
    onSelectedChange,
    activeCellKey,
    onCellActivate,
    disabled = false,
    ...rest
  } = props;

  const orderedKeys = resolveOrder(columns, order);
  const columnMap = new Map(columns.map((c) => [c.key, c]));

  /* 외곽/높이는 edit 전용으로 .edit에서 그린다 — TableRow의 .line/sizeMd를
     쓰면 셀 padding이 0으로 cascade되고 행 높이도 48px(터치 톤)이 되어
     스프레드시트 톤과 어긋남. */
  const rootClass = [
    rowStyles.root,
    styles.edit,
    size === "sm" ? styles.sizeSm : styles.sizeMd,
    selected ? styles.selected : "",
    disabled ? rowStyles.disabled : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  /* 체크박스 셀 자체 클릭이 다른 핸들러로 전파되지 않도록 stop. */
  const stop = (e: MouseEvent) => e.stopPropagation();

  const activateCell = (key: string) => {
    if (disabled) return;
    onCellActivate?.(key);
  };

  const handleCellKeyDown = (
    e: KeyboardEvent<HTMLDivElement>,
    key: string,
  ) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activateCell(key);
    }
  };

  return (
    <div
      ref={ref}
      role="row"
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      className={rootClass}
      {...rest}
    >
      {selectable && (
        <div
          className={rowStyles.selectCell}
          onClick={stop}
          data-edit-cell="select"
        >
          <Checkbox
            checked={selected}
            disabled={disabled}
            onChange={(e) => onSelectedChange?.(e.currentTarget.checked)}
            aria-label="행 선택"
          />
        </div>
      )}

      {orderedKeys.map((key, idx) => {
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
          ...pinnedStyle(col, orderedKeys, columnMap, widths ?? {}),
        };
        const content: ReactNode = col.render
          ? col.render(data)
          : (data as Record<string, ReactNode>)?.[col.key];
        const editable = col.editable !== false;
        const isActive = editable && !disabled && activeCellKey === col.key;
        /* 세로 구분선은 editable 여부와 무관하게 모든 셀 사이에 균일하게.
           엑셀 톤 "셀 그리드" 신호는 일관성이 핵심 — read-only 셀만 선이 빠지면
           리듬이 깨져 보임. 첫 데이터 셀은 왼쪽에 선 없음(테이블 외곽).
           selectable이면 체크박스 ↔ 첫 데이터 셀 사이에도 선.
           pinned 경계는 cellSlot box-shadow가 담당 — pinned-right 셀 자신과
           pinned-left 바로 다음 셀의 왼쪽 divider는 그으면 두 줄로 겹쳐 보임. */
        const prevCol = idx > 0 ? columnMap.get(orderedKeys[idx - 1]) : undefined;
        const skipDivider =
          col.pinned === "right" || prevCol?.pinned === "left";
        const showLeftDivider = (idx > 0 || selectable) && !skipDivider;
        return (
          <div
            key={col.key}
            data-pinned={col.pinned || undefined}
            className={rowStyles.cellSlot}
            style={slotStyle}
          >
            <div
              role="cell"
              className={[
                rowStyles.cell,
                editable ? styles.editCell : styles.readonlyCell,
                isActive ? styles.cellActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-align={col.align ?? "start"}
              data-active={isActive || undefined}
              data-divider={showLeftDivider || undefined}
              tabIndex={editable && !disabled && !isActive ? 0 : undefined}
              onMouseDown={(e) => {
                if (!editable || isActive) return;
                /* preventDefault 중요 — 셀의 role/tabIndex 때문에 네이티브 focus가
                   셀로 이동하면서 바로 뒤에 마운트될 input의 focus를 뺏음 →
                   React useEffect에서 input.focus() 후 네이티브 focus 반환 →
                   input blur → onBlur commit → clearActive 로 활성이 즉시 꺼지는
                   레이스. mouseDown에서 default를 끊으면 포커스 이동이 발생
                   안 해 input focus가 안정적으로 유지된다. */
                e.preventDefault();
                activateCell(col.key);
              }}
              onFocus={editable && !isActive ? () => activateCell(col.key) : undefined}
              onKeyDown={
                editable && !isActive ? (e) => handleCellKeyDown(e, col.key) : undefined
              }
            >
              {isActive ? (
                /* 활성: editor(input/select 등)를 셀 안에 바로 꽂음. editorHost는
                   nowrap/mask 없는 flex container라 editor가 셀 폭을 꽉 채움.
                   cellInner와 editorHost 둘 중 하나만 렌더해 같은 render(data)가
                   두 번 마운트되는 것을 방지. */
                <div
                  className={styles.editorHost}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {content}
                </div>
              ) : (
                /* 비활성 콘텐츠 — TableRow의 cellInner(nowrap + mask fade). */
                <span className={rowStyles.cellInner}>{content}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const TableRowEdit = forwardRef(TableRowEditInner) as <T>(
  props: TableRowEditProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => ReturnType<typeof TableRowEditInner>;

export { TableRowEdit };
