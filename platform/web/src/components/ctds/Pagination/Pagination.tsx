"use client";

/**
 * Pagination ─ 긴 목록·테이블의 페이지 네비.
 *
 * 설계 원칙 — "variant로 유즈케이스 조립":
 *   DatePicker처럼 분화된 컴포넌트(DateRangePicker)를 만들지 않고 하나의 Pagination에
 *   `variant` prop으로 numbered / simple / compact / jump를 커버한다. prop 표면이
 *   예측 가능성이 높다.
 *
 * 시각 규칙:
 *   - 숫자 아이템은 Button(라벨 있음). prev/next/first/last는 IconButton(정사각 전용).
 *     Button을 icon-only로 쓰면 가로 padding이 남아 정사각으로 안 떨어지므로 IconButton이 맞다.
 *   - 사이즈 매핑: Pagination md = Button sm + IconButton md, Pagination lg = Button md + IconButton lg.
 *   - 현재 페이지는 `variant="secondary"` (primary 8% 알파 배경 + primary 텍스트).
 *     primary filled는 페이지 안 다른 primary 액션과 충돌해 쓰지 않음.
 *   - 그 외는 `variant="ghost"`로 시각 무게 최소화.
 */

import {
  forwardRef,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "../Button";
import { IconButton, type IconButtonSize } from "../IconButton";
import { Icon } from "../Icon";
import styles from "./Pagination.module.css";

/** Pagination size → 내부 Button/IconButton size 매핑.
 *  Pagination md = Button sm + IconButton md, Pagination lg = Button md + IconButton lg. */
const BUTTON_SIZE: Record<"md" | "lg", "sm" | "md"> = {
  md: "sm",
  lg: "md",
};
const ICON_BTN_SIZE: Record<"md" | "lg", IconButtonSize> = {
  md: "md",
  lg: "lg",
};

export type PaginationVariant = "numbered" | "compact" | "jump";
export type PaginationSize = "md" | "lg";

export interface PaginationProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  variant?: PaginationVariant;
  /** 아이템 사이즈. md=내부 Button sm, lg=내부 Button md. */
  size?: PaginationSize;
  /** 현재 페이지 (1-indexed) */
  page: number;
  /** 전체 페이지 수 */
  total: number;
  onChange?: (page: number) => void;
  /** numbered·jump에서 한 번에 보여줄 숫자 개수(5~10). 기본 5.
   *  현재 페이지 중심의 슬라이딩 윈도우 — 생략(…)·양 끝 고정 숫자 없음. */
  windowSize?: number;
  disabled?: boolean;
  /** compact variant의 라벨 포맷터. 기본 `${page} / ${total}`. */
  compactFormatter?: (page: number, total: number) => ReactNode;
  "aria-label"?: string;
}

/**
 * 현재 페이지 중심의 슬라이딩 윈도우.
 * 전체가 윈도우보다 작으면 전부 표시. 아니면 현재를 가운데 두되,
 * 왼/오 끝 가까우면 그 쪽으로 밀착해 빈 자리가 생기지 않게 한다.
 * 예: total=100, windowSize=5, page=1  → [1..5]
 *     total=100, windowSize=5, page=10 → [8..12]
 *     total=100, windowSize=5, page=100 → [96..100]
 */
function buildWindow(page: number, total: number, windowSize: number): number[] {
  const size = Math.min(windowSize, total);
  const half = Math.floor((size - 1) / 2);
  let start = page - half;
  let end = start + size - 1;
  if (start < 1) {
    start = 1;
    end = size;
  }
  if (end > total) {
    end = total;
    start = total - size + 1;
  }
  return Array.from({ length: size }, (_, i) => start + i);
}

/** windowSize를 5~10 범위로 클램프. */
function clampWindow(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(5, Math.round(n)));
}

export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  (
    {
      variant = "numbered",
      size = "md",
      page,
      total,
      onChange,
      windowSize = 5,
      disabled = false,
      compactFormatter,
      className,
      "aria-label": ariaLabel = "페이지네이션",
      ...rest
    },
    ref
  ) => {
    const safeTotal = Math.max(1, total);
    const safePage = Math.min(Math.max(1, page), safeTotal);
    const isFirst = safePage <= 1;
    const isLast = safePage >= safeTotal;

    const go = (p: number) => {
      if (disabled) return;
      const next = Math.min(Math.max(1, p), safeTotal);
      if (next !== safePage) onChange?.(next);
    };

    const range = useMemo(
      () =>
        variant === "numbered" || variant === "jump"
          ? buildWindow(safePage, safeTotal, clampWindow(windowSize))
          : [],
      [variant, safePage, safeTotal, windowSize]
    );

    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");
    const numberCls = size === "md" ? styles.numberBtnMd : styles.numberBtnLg;
    const iconCls = size === "md" ? styles.iconBtnMd : styles.iconBtnLg;
    const statusCls = size === "md" ? styles.statusMd : styles.statusLg;
    const buttonSize = BUTTON_SIZE[size];
    const iconSize = ICON_BTN_SIZE[size];

    /* prev/next는 "보이는 윈도우의 끝 숫자"로 점프 — 현재가 윈도우 중앙이면 윈도우 안에서 끝으로,
       이미 끝 위에 있으면 다음 호출에서 윈도우가 통째로 밀린다. 숫자 윈도우가 없는 compact에선
       기존 ±1 유지. */
    const prevTarget = range.length > 0 ? range[0] : safePage - 1;
    const nextTarget =
      range.length > 0 ? range[range.length - 1] : safePage + 1;
    const prevDisabled = disabled || isFirst || prevTarget === safePage;
    const nextDisabled = disabled || isLast || nextTarget === safePage;

    return (
      <nav
        ref={ref}
        className={rootClass}
        aria-label={ariaLabel}
        role="navigation"
        {...rest}
      >
        <ul
          className={[
            styles.list,
            variant === "compact" ? styles.listCompact : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {variant === "jump" && (
            <li>
              <IconButton
                size={iconSize}
                variant="ghost"
                aria-label="처음 페이지"
                icon={<Icon name="caret-double-left" />}
                disabled={disabled || isFirst}
                onClick={() => go(1)}
                className={iconCls}
              />
            </li>
          )}

          <li>
            <IconButton
              size={iconSize}
              variant="ghost"
              aria-label="이전 페이지"
              icon={<Icon name="caret-left" />}
              disabled={prevDisabled}
              onClick={() => go(prevTarget)}
              className={iconCls}
            />
          </li>

          {variant === "compact" && (
            <li className={statusCls} aria-live="polite">
              {compactFormatter
                ? compactFormatter(safePage, safeTotal)
                : `${safePage}/${safeTotal}`}
            </li>
          )}

          {(variant === "numbered" || variant === "jump") &&
            range.map((item) => {
              const isCurrent = item === safePage;
              return (
                <li key={item}>
                  <Button
                    size={buttonSize}
                    variant={isCurrent ? "secondary" : "ghost"}
                    aria-label={`${item} 페이지`}
                    aria-current={isCurrent ? "page" : undefined}
                    disabled={disabled}
                    onClick={() => go(item)}
                    className={numberCls}
                  >
                    {item}
                  </Button>
                </li>
              );
            })}

          <li>
            <IconButton
              size={iconSize}
              variant="ghost"
              aria-label="다음 페이지"
              icon={<Icon name="caret-right" />}
              disabled={nextDisabled}
              onClick={() => go(nextTarget)}
              className={iconCls}
            />
          </li>

          {variant === "jump" && (
            <li>
              <IconButton
                size={iconSize}
                variant="ghost"
                aria-label="마지막 페이지"
                icon={<Icon name="caret-double-right" />}
                disabled={disabled || isLast}
                onClick={() => go(safeTotal)}
                className={iconCls}
              />
            </li>
          )}
        </ul>
      </nav>
    );
  }
);

Pagination.displayName = "Pagination";
