"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Checkbox } from "../Checkbox";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";
import styles from "./TableHeader.module.css";

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

export type TableHeaderVariant = "line" | "plate";
export type TableHeaderSortDirection = "asc" | "desc";
export type TableHeaderAlign = "start" | "center" | "end";

export type TableHeaderSortState = {
  key: string;
  direction: TableHeaderSortDirection;
} | null;

export type TableHeaderColumn = {
  /** 안정적인 id. reorder/width 상태의 key. */
  key: string;
  label: ReactNode;
  /** 고정 폭(px 또는 CSS 값). 미지정 + flex=false면 자동. */
  width?: number | string;
  /** flex=true면 남은 공간을 채운다. minWidth와 조합. */
  flex?: boolean;
  minWidth?: number | string;
  sortable?: boolean;
  align?: TableHeaderAlign;
  /** 이 column에만 resize handle을 숨긴다. 상위 header의 resizable=true여도
   *  false로 설정하면 handle 안 보임. 기본 true(상위 resizable 따라감). */
  resizable?: boolean;
  /** 이 column에만 drag reorder를 숨긴다. 상위 header의 reorderable=true여도
   *  false면 drag 안 됨. 기본 true. */
  movable?: boolean;
  /** column을 좌/우 끝에 sticky 고정. 가로스크롤에도 유지된다.
   *  pinned column은 reorder 대상에서 자동 제외(움직이면 "고정"의 의미 사라짐). */
  pinned?: "left" | "right";
};

export type TableHeaderProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  variant?: TableHeaderVariant;
  columns: TableHeaderColumn[];

  /** 각 셀에 resize handle을 붙인다. */
  resizable?: boolean;
  /** 각 셀을 drag-reorder 가능하게 한다. hover 배경도 함께 켜짐. */
  reorderable?: boolean;

  /** 맨 앞에 selection 체크박스 셀. */
  selectable?: boolean;
  selectAllChecked?: boolean;
  onSelectAllChange?: (next: boolean) => void;

  /** 컬럼 순서 (controlled). 미지정 시 columns 원본 순서로 uncontrolled. */
  order?: string[];
  onOrderChange?: (next: string[]) => void;

  /** 컬럼별 현재 width. resize 결과가 여기로 전달. controlled/uncontrolled 둘 다 지원. */
  widths?: Record<string, number>;
  onWidthsChange?: (next: Record<string, number>) => void;

  /** 정렬 상태. 2-state 토글(asc ↔ desc). 첫 클릭은 asc. */
  sort?: TableHeaderSortState;
  onSortChange?: (next: TableHeaderSortState) => void;

  /** 우측 끝 컬럼 매니지먼트 버튼(눈에 띄는 sq IconButton). */
  columnManager?: boolean;
  onColumnManagerClick?: () => void;
};

/* ────────────────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────────────────── */

function toCssSize(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === "number" ? `${v}px` : v;
}

/** TableRow와 반드시 공유하는 "셀 폭 공식".
 *  flex item(여기선 .cellSlot div)에 적용. 공식이 어긋나면 header와 row의
 *  열이 세로로 정렬되지 않으니 변경 시 TableRow 쪽도 함께 바꿔야 함. */
function cellSlotStyle(
  column: TableHeaderColumn,
  resolvedWidth: number | undefined,
): CSSProperties {
  const cssWidth = resolvedWidth !== undefined ? `${resolvedWidth}px` : toCssSize(column.width);
  if (column.flex) {
    return {
      width: cssWidth,
      minWidth: toCssSize(column.minWidth) ?? cssWidth,
      flex: "1 1 0",
    };
  }
  return {
    width: cssWidth,
    minWidth: cssWidth,
    flexShrink: 0,
    flexGrow: 0,
  };
}

/** 특정 column의 "pinned 위치" 스타일을 계산.
 *  왼쪽 pinned가 여럿이면 앞선 pinned 열들의 폭을 누적해서 left offset 산출.
 *  오른쪽도 동일 — 뒤쪽 pinned부터 right offset 누적.
 *  TableRow/TableRowEdit에도 그대로 재사용 가능하도록 export. */
export function pinnedStyle(
  column: TableHeaderColumn,
  orderedKeys: string[],
  columnMap: Map<string, TableHeaderColumn>,
  widths: Record<string, number>,
  /* selectable일 때 selectCell이 좌측에 먼저 sticky로 깔려 있음 — 그 폭만큼
     좌측 pinned column들의 left offset을 밀어줘야 겹치지 않음. */
  leftOffsetBase = 0,
): CSSProperties {
  if (!column.pinned) return {};
  const resolveWidth = (key: string): number => {
    const c = columnMap.get(key);
    if (!c) return 0;
    if (widths[key] !== undefined) return widths[key];
    if (typeof c.width === "number") return c.width;
    return 0;
  };
  const idx = orderedKeys.indexOf(column.key);
  if (column.pinned === "left") {
    let offset = leftOffsetBase;
    for (let i = 0; i < idx; i++) {
      const c = columnMap.get(orderedKeys[i]);
      if (c?.pinned === "left") offset += resolveWidth(orderedKeys[i]);
    }
    return {
      position: "sticky",
      left: `${offset}px`,
      zIndex: "var(--z-raise)" as unknown as number,
    };
  }
  let offset = 0;
  for (let i = orderedKeys.length - 1; i > idx; i--) {
    const c = columnMap.get(orderedKeys[i]);
    if (c?.pinned === "right") offset += resolveWidth(orderedKeys[i]);
  }
  return {
    position: "sticky",
    right: `${offset}px`,
    zIndex: 1,
  };
}

/** 배열을 columns 원본 순서와 order prop을 병합해 최종 렌더 순서 산출.
 *  order가 부분적이거나 columns에 없는 key를 담고 있어도 안전하게 정규화한다. */
function resolveOrder(columns: TableHeaderColumn[], order?: string[]): string[] {
  if (!order) return columns.map((c) => c.key);
  const known = new Set(columns.map((c) => c.key));
  const filtered = order.filter((k) => known.has(k));
  const missing = columns.map((c) => c.key).filter((k) => !filtered.includes(k));
  return [...filtered, ...missing];
}

/* ────────────────────────────────────────────────────────────
   Cell (individual columnheader)
   sortable/reorderable 여부에 따라 @dnd-kit useSortable을 사용/미사용 분기.
   ──────────────────────────────────────────────────────────── */

type CellProps = {
  column: TableHeaderColumn;
  variant: TableHeaderVariant;
  resizable: boolean;
  reorderable: boolean;
  width: number | undefined;
  sort: TableHeaderSortState;
  onSortToggle: (key: string) => void;
  onResizeStart: (key: string, startX: number) => void;
};

function Cell({
  column,
  variant,
  resizable,
  reorderable,
  width,
  sort,
  onSortToggle,
  onResizeStart,
}: CellProps) {
  /* @dnd-kit useSortable은 항상 호출(hook 규칙). reorderable=false면 결과만 무시. */
  const sortable = useSortable({ id: column.key, disabled: !reorderable });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;
  /* dnd-kit attributes에는 role="button"이 포함돼 있어 우리 role="columnheader"와 충돌.
     role만 벗겨내고 나머지(aria-* 등)는 유지. */
  const { role: _dndRole, ...dndAttributes } = attributes;

  /* align은 flex 자식이라 text-align이 아니라 justify-content로 매핑해야 함. */
  const alignJustify =
    column.align === "end"
      ? "flex-end"
      : column.align === "center"
        ? "center"
        : "flex-start";
  /* Cell에는 "내용용" style만 — 폭 결정은 바깥 .cellSlot div가 담당(= cellSlotStyle).
     dnd transform/transition은 cell에 유지(dnd가 useSortable 결과를 cell DOM에 바인딩). */
  const style: CSSProperties = {
    width: "100%",
    minWidth: 0,
    transform: CSS.Translate.toString(transform),
    transition,
    justifyContent: alignJustify,
  };

  const isSorted = sort?.key === column.key;
  const sortDir = isSorted ? sort!.direction : null;
  const ariaSort = !column.sortable
    ? undefined
    : sortDir === "asc"
      ? "ascending"
      : sortDir === "desc"
        ? "descending"
        : "none";

  /* 정렬 아이콘: arrows-down-up(위 ↓ / 아래 ↑ 분리형) 하나로 모양은 고정이고,
     상태에 따라 각 path 톤만 바뀜.
     - 미정렬: 둘 다 subtle
     - asc : 아래 ↑ 만 strong (오름 방향)
     - desc: 위  ↓ 만 strong (내림 방향) */
  const sortIcon = !column.sortable ? null : (
    <Icon
      name="arrows-down-up"
      size={14}
      className={styles.sortIcon}
      upClassName={`${styles.sortPath} ${sortDir === "desc" ? styles.sortPathActive : ""}`}
      downClassName={`${styles.sortPath} ${sortDir === "asc" ? styles.sortPathActive : ""}`}
      aria-hidden="true"
    />
  );

  const handleResizePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart(column.key, e.clientX);
  };

  const handleLabelClick = () => {
    if (column.sortable) onSortToggle(column.key);
  };

  return (
    <div
      ref={setNodeRef}
      className={[
        styles.cell,
        reorderable ? styles.reorderable : "",
        column.sortable ? styles.sortable : "",
        isDragging ? styles.dragging : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role="columnheader"
      aria-sort={ariaSort as "ascending" | "descending" | "none" | undefined}
      data-variant={variant}
      /* reorderable=on일 때만 전체 셀이 드래그 트리거(cursor-grab). */
      {...(reorderable ? dndAttributes : {})}
      {...(reorderable ? listeners : {})}
    >
      {/* line variant에서 resize on일 때 좌측 tick — 눈금자 느낌.
          첫 셀엔 붙지 않도록 :first-child에서 css로 숨김. */}
      {variant === "line" && resizable && (
        <span aria-hidden="true" className={styles.tick} />
      )}

      <span
        className={styles.label}
        onClick={handleLabelClick}
        /* sortable 셀은 라벨 자체가 버튼 역할. reorder 드래그와 충돌하지 않도록
           pointerdown에서 dnd 리스너 전파를 막지 않음(dnd는 이동 threshold로 구분). */
      >
        {column.label}
        {sortIcon}
      </span>

      {resizable && (
        <button
          type="button"
          className={styles.resizeHandle}
          aria-label="컬럼 너비 조절"
          onPointerDown={handleResizePointerDown}
          /* dnd 리스너로 이벤트가 새는 걸 방지 — resize와 reorder는 상호배제. */
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          data-variant={variant}
        >
          <span aria-hidden="true" className={styles.resizeLine} />
        </button>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TableHeader
   ──────────────────────────────────────────────────────────── */

const TableHeader = forwardRef<HTMLDivElement, TableHeaderProps>(function TableHeader(
  {
    className,
    variant = "line",
    columns,
    resizable = false,
    reorderable = false,
    selectable = false,
    selectAllChecked = false,
    onSelectAllChange,
    order: orderProp,
    onOrderChange,
    widths: widthsProp,
    onWidthsChange,
    sort: sortProp,
    onSortChange,
    columnManager = false,
    onColumnManagerClick,
    ...rest
  },
  ref,
) {
  /* uncontrolled fallback 상태들 */
  const [orderState, setOrderState] = useState<string[]>(() =>
    columns.map((c) => c.key),
  );
  const [widthsState, setWidthsState] = useState<Record<string, number>>({});
  const [sortState, setSortState] = useState<TableHeaderSortState>(null);

  const order = resolveOrder(columns, orderProp ?? orderState);
  const widths = widthsProp ?? widthsState;
  const sort = sortProp !== undefined ? sortProp : sortState;

  /* columns 배열이 바뀌면 uncontrolled order도 자동 확장 — 새 컬럼은 뒤에 추가. */
  useEffect(() => {
    if (orderProp) return;
    setOrderState((prev) => {
      const known = new Set(columns.map((c) => c.key));
      const kept = prev.filter((k) => known.has(k));
      const added = columns.map((c) => c.key).filter((k) => !kept.includes(k));
      if (kept.length === prev.length && added.length === 0) return prev;
      return [...kept, ...added];
    });
  }, [columns, orderProp]);

  const columnMap = useMemo(() => {
    const m = new Map<string, TableHeaderColumn>();
    columns.forEach((c) => m.set(c.key, c));
    return m;
  }, [columns]);

  const orderedColumns = order
    .map((k) => columnMap.get(k))
    .filter((c): c is TableHeaderColumn => !!c);

  /* selectCell이 렌더되면 그 실제 폭을 측정해 좌측 pinned columns의 left offset에
     더해준다. CSS 토큰(--iconbtn-h-lg / --control-h-sm) + space-scale 반영이 자동으로
     흡수되므로 하드코딩이나 CSS 변수 파싱 없이 처리 가능. */
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

  /* Sort ─────────────────────────────────────────────────── */
  const toggleSort = useCallback(
    (key: string) => {
      const next: TableHeaderSortState =
        sort?.key === key
          ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
          : { key, direction: "asc" };
      if (sortProp === undefined) setSortState(next);
      onSortChange?.(next);
    },
    [sort, sortProp, onSortChange],
  );

  /* Resize ──────────────────────────────────────────────────
     pointerdown → document 레벨 pointermove/up 리스너로 전역 추적.
     resize 중엔 body에 커서 강제·selection 방지 클래스를 얹는다. */
  const resizeState = useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const commitWidth = useCallback(
    (key: string, w: number) => {
      const clamped = Math.max(48, Math.round(w));
      const next = { ...widths, [key]: clamped };
      if (widthsProp === undefined) setWidthsState(next);
      onWidthsChange?.(next);
    },
    [widths, widthsProp, onWidthsChange],
  );

  const beginResize = useCallback(
    (key: string, startX: number) => {
      const col = columnMap.get(key);
      if (!col) return;
      /* 현재 시각 폭을 시작점으로 — controlled width 있으면 그 값, 없으면 DOM 실측. */
      const current =
        widths[key] ??
        (typeof col.width === "number"
          ? col.width
          : (document.querySelector<HTMLElement>(
              `[data-th-key="${window.CSS.escape(key)}"]`,
            )?.offsetWidth ?? 120));
      resizeState.current = { key, startX, startWidth: current };
      document.body.classList.add(styles.bodyResizing);
    },
    [columnMap, widths],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = resizeState.current;
      if (!s) return;
      const delta = e.clientX - s.startX;
      commitWidth(s.key, s.startWidth + delta);
    };
    const onUp = () => {
      if (!resizeState.current) return;
      resizeState.current = null;
      document.body.classList.remove(styles.bodyResizing);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [commitWidth]);

  /* Reorder (dnd-kit) ───────────────────────────────────── */
  const sensors = useSensors(
    /* 8px 이상 이동해야 드래그 시작 — 라벨 클릭(sort)과 충돌 방지. */
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    if (orderProp === undefined) setOrderState(next);
    onOrderChange?.(next);
  };

  const rootClass = [
    styles.root,
    variant === "plate" ? styles.plate : styles.line,
    reorderable ? styles.rootReorderable : "",
    resizable ? styles.rootResizable : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const cells = (
    <>
      {selectable && (
        <div ref={selectCellRef} className={styles.selectCell} role="columnheader">
          <Checkbox
            checked={selectAllChecked}
            onChange={(e) => onSelectAllChange?.(e.currentTarget.checked)}
            aria-label="전체 선택"
          />
        </div>
      )}

      {reorderable ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={order}
            strategy={horizontalListSortingStrategy}
          >
            {orderedColumns.map((col) => (
              <div
                key={col.key}
                data-th-key={col.key}
                data-pinned={col.pinned || undefined}
                className={styles.cellSlot}
                style={{
                  ...cellSlotStyle(col, widths[col.key]),
                  ...pinnedStyle(col, order, columnMap, widths, selectCellWidth),
                }}
              >
                <Cell
                  column={col}
                  variant={variant}
                  resizable={resizable && col.resizable !== false}
                  /* pinned column은 reorder 대상에서 제외 — 움직이면 "고정" 의미 사라짐. */
                  reorderable={reorderable && col.movable !== false && !col.pinned}
                  width={widths[col.key]}
                  sort={sort}
                  onSortToggle={toggleSort}
                  onResizeStart={beginResize}
                />
              </div>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        orderedColumns.map((col) => (
          <div
            key={col.key}
            data-th-key={col.key}
            data-pinned={col.pinned || undefined}
            className={styles.cellSlot}
            style={{
              ...cellSlotStyle(col, widths[col.key]),
              ...pinnedStyle(col, order, columnMap, widths, selectCellWidth),
            }}
          >
            <Cell
              column={col}
              variant={variant}
              resizable={resizable && col.resizable !== false}
              reorderable={reorderable && col.movable !== false && !col.pinned}
              width={widths[col.key]}
              sort={sort}
              onSortToggle={toggleSort}
              onResizeStart={beginResize}
            />
          </div>
        ))
      )}

      {columnManager && (
        <div className={styles.managerCell}>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="컬럼 관리"
            icon={<Icon name="columns" size={16} />}
            onClick={onColumnManagerClick}
          />
        </div>
      )}
    </>
  );

  const { role, ...restProps } = rest;
  return (
    <div ref={ref} role={role ?? "row"} className={rootClass} {...restProps}>
      {cells}
    </div>
  );
});

export { TableHeader };
