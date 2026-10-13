"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { Checkbox } from "../Checkbox";
import {
  pinnedStyle,
  type TableHeaderAlign,
  type TableHeaderColumn,
  type TableHeaderVariant,
} from "../TableHeader";
import styles from "./TableRow.module.css";

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

export type TableRowSize = "sm" | "md" | "lg";

/** Row가 columns 스펙 안에 선택적으로 심을 수 있는 "셀 렌더" 콜백.
 *  TableHeaderColumn은 label·width만 정의 — 데이터 렌더링 책임은 Row 쪽에서
 *  columns[i].render(data)로 확장. columns 참조를 공유하면 header와 row가 자동으로
 *  정렬·폭이 맞는다. */
export type TableRowColumn<T = unknown> = TableHeaderColumn & {
  /** 셀 렌더러. 미지정이면 data[key]를 그대로 노출. */
  render?: (data: T) => ReactNode;
  /** edit 모드 전용. false면 해당 셀은 활성화·세로선 대상에서 빠지고 read-only로 보임.
   *  기본은 true — 생략하면 편집 가능 셀로 간주. navigate/select 모드에선 무시된다. */
  editable?: boolean;
  /** 사용자가 column 삭제 가능. TableHeader가 context menu / × 액션을 노출.
   *  기본 false — 삭제는 호출 측 콜백으로 columns 배열 변경. */
  removable?: boolean;
  /* resizable / movable / pinned는 TableHeaderColumn에 정의되어 자동 상속. */
};

type BaseProps<T> = {
  variant?: TableHeaderVariant;
  size?: TableRowSize;
  columns: TableRowColumn<T>[];

  /** 헤더와 공유하는 컬럼 순서. uncontrolled면 columns 원본 순서. */
  order?: string[];
  /** 헤더가 resize로 적용한 컬럼별 폭. */
  widths?: Record<string, number>;

  /** 이 행의 데이터. columns[].render(data) 또는 data[key]로 사용. */
  data: T;

  /** 맨 앞 체크박스 셀 — 헤더의 selectable과 짝. */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (next: boolean) => void;

  /** navigate 모드에서 '선택된 행'처럼 보이게 하는 활성 상태 (현재 보고 있는 상세 등). */
  active?: boolean;

  /** 비활성 — 톤 다운 + 상호작용 차단. */
  disabled?: boolean;

  /** 셀 콘텐츠 줄바꿈 허용. 기본 false — 긴 텍스트는 한 줄 + 끝단 fade로 잘라냄.
   *  true면 white-space:normal 로 줄바꿈, 끝단 mask 제거, 행 높이가 콘텐츠 따라 자람.
   *  보통 테이블 전체 Row에 동일 값을 넘김 — 열별 분기는 지원하지 않음(테이블 리듬 유지). */
  wrap?: boolean;
};

/** 두 가지 "render as" 모드:
 *  - href 있으면 <a>로 렌더 (navigate 라우팅)
 *  - 아니면 <div role="button">로 렌더 (onClick 핸들러)
 *  둘 다 안 주면 <div role="row"> (단순 디스플레이). */
export type TableRowAnchorProps<T> = BaseProps<T> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps<T> | "role"> & {
    href: string;
  };

export type TableRowButtonProps<T> = BaseProps<T> &
  Omit<HTMLAttributes<HTMLDivElement>, keyof BaseProps<T> | "role"> & {
    href?: undefined;
    onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  };

export type TableRowProps<T = unknown> =
  | TableRowAnchorProps<T>
  | TableRowButtonProps<T>;

/* ────────────────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────────────────── */

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

function alignToJustify(align: TableHeaderAlign | undefined): CSSProperties["justifyContent"] {
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
   TableRow
   ──────────────────────────────────────────────────────────── */

function TableRowInner<T>(
  props: TableRowProps<T>,
  ref: React.ForwardedRef<HTMLDivElement | HTMLAnchorElement>,
) {
  const {
    className,
    variant = "line",
    size = "sm",
    columns,
    order,
    widths,
    data,
    selectable = false,
    selected = false,
    onSelectedChange,
    active = false,
    disabled = false,
    wrap = false,
    ...rest
  } = props as BaseProps<T> & {
    className?: string;
    href?: string;
    onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  } & Record<string, unknown>;

  const orderedKeys = resolveOrder(columns, order);
  const columnMap = new Map(columns.map((c) => [c.key, c]));

  /* selectCell 폭을 측정해 좌측 pinned column의 left offset에 반영.
     Header와 동일한 로직 — selectCell이 sticky left:0이라 pinned column들이 그 뒤에
     위치하려면 폭만큼 밀어야 함. */
  const selectCellRef = useRef<HTMLDivElement>(null);
  const [selectCellWidth, setSelectCellWidth] = useState(0);
  useEffect(() => {
    if (!selectable) {
      setSelectCellWidth(0);
      return;
    }
    const el = selectCellRef.current;
    if (!el) return;
    const update = () => setSelectCellWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectable]);

  const rootClass = [
    styles.root,
    variant === "plate" ? styles.plate : styles.line,
    size === "sm" ? styles.sizeSm : size === "lg" ? styles.sizeLg : styles.sizeMd,
    active ? styles.active : "",
    disabled ? styles.disabled : "",
    wrap ? styles.wrap : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const isInteractive = !disabled && (!!(props as TableRowAnchorProps<T>).href || !!(props as TableRowButtonProps<T>).onClick);

  /* 체크박스 셀 자체 클릭이 행 클릭으로 전파되지 않도록 stop. */
  const stop = (e: MouseEvent) => e.stopPropagation();

  const cells = (
    <>
      {selectable && (
        <div ref={selectCellRef} className={styles.selectCell} onClick={stop}>
          <Checkbox
            checked={selected}
            disabled={disabled}
            onChange={(e) => onSelectedChange?.(e.currentTarget.checked)}
            aria-label="행 선택"
          />
        </div>
      )}

      {orderedKeys.map((key) => {
        const col = columnMap.get(key);
        if (!col) return null;
        const cssWidth = widths?.[col.key] !== undefined ? `${widths[col.key]}px` : toCssSize(col.width);
        /* Header와 완전히 동일한 2단계 구조 + 동일한 inline 공식.
           cellSlot: flex item, 폭 결정. cell: slot 안쪽 width:100%로 콘텐츠 그릇. */
        const slotStyle: CSSProperties = {
          width: cssWidth,
          minWidth: toCssSize(col.minWidth) ?? cssWidth,
          flex: col.flex ? "1 1 0" : undefined,
          justifyContent: alignToJustify(col.align),
          ...pinnedStyle(col, orderedKeys, columnMap, widths ?? {}, selectCellWidth),
        };
        const content = col.render ? col.render(data) : (data as Record<string, ReactNode>)?.[col.key];
        return (
          <div
            key={col.key}
            data-pinned={col.pinned || undefined}
            className={styles.cellSlot}
            style={slotStyle}
          >
            <div role="cell" className={styles.cell} data-align={col.align ?? "start"}>
              <span className={styles.cellInner}>{content}</span>
            </div>
          </div>
        );
      })}
    </>
  );

  /* ── 라우팅: href 있으면 anchor, onClick 있으면 div[role=button], 둘 다 없으면 div[role=row] ── */
  if (!disabled && "href" in props && props.href) {
    const { href, onClick, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    return (
      <a
        ref={ref as React.ForwardedRef<HTMLAnchorElement>}
        className={rootClass}
        href={href}
        role="row"
        aria-selected={active || undefined}
        aria-disabled={disabled || undefined}
        onClick={onClick}
        {...anchorRest}
      >
        {cells}
      </a>
    );
  }

  const divRest = rest as HTMLAttributes<HTMLDivElement>;
  const { onClick, onKeyDown, tabIndex, ...divRestClean } = divRest;

  /* div[role=button] 분기에서 키보드 활성화 — Enter/Space로 클릭 트리거. */
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (!isInteractive || !onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(e as unknown as MouseEvent<HTMLDivElement>);
    }
  };

  return (
    <div
      ref={ref as React.ForwardedRef<HTMLDivElement>}
      className={rootClass}
      role="row"
      aria-selected={active || undefined}
      aria-disabled={disabled || undefined}
      tabIndex={isInteractive ? (tabIndex ?? 0) : tabIndex}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={isInteractive ? handleKeyDown : onKeyDown}
      {...divRestClean}
    >
      {cells}
    </div>
  );
}

/* generic + forwardRef 조합 — 캐스팅으로 generic 보존. */
const TableRow = forwardRef(TableRowInner) as <T>(
  props: TableRowProps<T> & { ref?: React.ForwardedRef<HTMLDivElement | HTMLAnchorElement> },
) => ReturnType<typeof TableRowInner>;

export { TableRow };
