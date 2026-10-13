"use client";

import { memo, useMemo } from "react";
import { IconButton } from "../IconButton";
import { Icon } from "../Icon";
import styles from "./DatePicker.module.css";
import {
  addMonths,
  buildMonthGrid,
  isSameDay,
  isSameMonth,
  isWithin,
  MONTH_LABELS_KO,
  WEEKDAY_LABELS_KO,
  type DateRange,
} from "./utils";

interface MonthProps {
  month: Date;
  selectedFrom: Date | null;
  selectedTo: Date | null;
  hoverDate: Date | null;
  rangeInProgress: boolean;
  mode: "single" | "range";
  onSelectDay: (day: Date) => void;
  onHoverDay: (day: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  weekStartsOn: number;
  showHeader: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  showPrev?: boolean;
  showNext?: boolean;
}

const MonthView = memo(function MonthView({
  month,
  selectedFrom,
  selectedTo,
  hoverDate,
  rangeInProgress,
  mode,
  onSelectDay,
  onHoverDay,
  minDate,
  maxDate,
  weekStartsOn,
  showHeader,
  onPrev,
  onNext,
  showPrev,
  showNext,
}: MonthProps) {
  const cells = useMemo(
    () => buildMonthGrid(month, weekStartsOn),
    [month, weekStartsOn]
  );
  const weekdays = useMemo(() => {
    const list = [...WEEKDAY_LABELS_KO];
    for (let i = 0; i < weekStartsOn; i += 1) list.push(list.shift() as string);
    return list;
  }, [weekStartsOn]);

  const previewTo = rangeInProgress && selectedFrom && !selectedTo ? hoverDate : null;
  const rangeStart = selectedFrom;
  const rangeEnd = selectedTo ?? previewTo;
  const normalizedStart =
    rangeStart && rangeEnd && rangeStart.getTime() > rangeEnd.getTime() ? rangeEnd : rangeStart;
  const normalizedEnd =
    rangeStart && rangeEnd && rangeStart.getTime() > rangeEnd.getTime() ? rangeStart : rangeEnd;

  return (
    <div className={styles.monthCol}>
      {showHeader && (
        <div className={styles.monthHeader}>
          <IconButton
            variant="outline"
            size="md"
            icon={<Icon name="caret-left" />}
            onClick={onPrev}
            aria-label="이전 달"
            style={{ visibility: showPrev ? "visible" : "hidden" }}
          />
          <div className={styles.monthTitle}>
            {month.getFullYear()}년 {MONTH_LABELS_KO[month.getMonth()]}
          </div>
          <IconButton
            variant="outline"
            size="md"
            icon={<Icon name="caret-right" />}
            onClick={onNext}
            aria-label="다음 달"
            style={{ visibility: showNext ? "visible" : "hidden" }}
          />
        </div>
      )}

      <div className={styles.weekdays} role="row">
        {weekdays.map((w) => (
          <div key={w} role="columnheader" className={styles.weekday}>
            {w}
          </div>
        ))}
      </div>

      <div className={styles.grid} role="grid" aria-label={monthLabelText(month)}>
        {cells.map((day) => {
          const outside = !isSameMonth(day, month);
          const disabled =
            outside ||
            (minDate && day.getTime() < minDate.setHours(0, 0, 0, 0)) ||
            (maxDate && day.getTime() > maxDate.setHours(23, 59, 59, 999));

          const isFrom = mode === "range" && isSameDay(day, normalizedStart);
          const isTo = mode === "range" && isSameDay(day, normalizedEnd);
          const isSelected =
            mode === "single"
              ? isSameDay(day, selectedFrom)
              : isFrom || isTo;
          const inRange =
            mode === "range" &&
            !outside &&
            normalizedStart &&
            normalizedEnd &&
            isWithin(day, normalizedStart, normalizedEnd) &&
            !isFrom &&
            !isTo;
          const isToday = !outside && isSameDay(day, new Date());

          return (
            <button
              type="button"
              key={day.toISOString()}
              className={styles.dayCell}
              data-outside={outside || undefined}
              data-today={isToday || undefined}
              data-selected={isSelected || undefined}
              data-in-range={inRange || undefined}
              data-range-start={isFrom || undefined}
              data-range-end={isTo || undefined}
              disabled={disabled || undefined}
              onClick={() => onSelectDay(day)}
              onMouseEnter={() => onHoverDay(day)}
              onMouseLeave={() => onHoverDay(null)}
              aria-selected={isSelected}
              aria-disabled={disabled || undefined}
              aria-label={dayAriaLabel(day, { isToday, isSelected })}
              role="gridcell"
            >
              <span className={styles.dayLabel}>{day.getDate()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

/** "2026년 10월" 류 — grid aria-label용. 월 이름이 바뀌면 utils 쪽 MONTH_LABELS_KO 교체. */
function monthLabelText(d: Date): string {
  return `${d.getFullYear()}년 ${MONTH_LABELS_KO[d.getMonth()]}`;
}

/** "2026년 10월 9일 (금), 오늘, 선택됨" 류 스크린리더용 라벨. */
function dayAriaLabel(d: Date, flags: { isToday: boolean; isSelected: boolean }): string {
  const parts = [
    `${d.getFullYear()}년 ${MONTH_LABELS_KO[d.getMonth()]} ${d.getDate()}일`,
    `(${WEEKDAY_LABELS_KO[d.getDay()]})`,
  ];
  if (flags.isToday) parts.push("오늘");
  if (flags.isSelected) parts.push("선택됨");
  return parts.join(", ");
}

export interface CalendarProps {
  mode: "single" | "range";
  months: 1 | 2;
  viewMonth: Date;
  onViewMonthChange: (m: Date) => void;
  selectedFrom: Date | null;
  selectedTo: Date | null;
  hoverDate: Date | null;
  onHoverDate: (d: Date | null) => void;
  rangeInProgress: boolean;
  onSelectDay: (day: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  weekStartsOn?: number;
}

export function Calendar({
  mode,
  months,
  viewMonth,
  onViewMonthChange,
  selectedFrom,
  selectedTo,
  hoverDate,
  onHoverDate,
  rangeInProgress,
  onSelectDay,
  minDate,
  maxDate,
  weekStartsOn = 0,
}: CalendarProps) {
  const secondMonth = addMonths(viewMonth, 1);
  return (
    <div className={styles.calendarWrap} data-months={months}>
      <MonthView
        month={viewMonth}
        selectedFrom={selectedFrom}
        selectedTo={selectedTo}
        hoverDate={hoverDate}
        rangeInProgress={rangeInProgress}
        mode={mode}
        onSelectDay={onSelectDay}
        onHoverDay={onHoverDate}
        minDate={minDate}
        maxDate={maxDate}
        weekStartsOn={weekStartsOn}
        showHeader
        onPrev={() => onViewMonthChange(addMonths(viewMonth, -1))}
        onNext={() => onViewMonthChange(addMonths(viewMonth, 1))}
        showPrev
        showNext={months === 1}
      />
      {months === 2 && (
        <MonthView
          month={secondMonth}
          selectedFrom={selectedFrom}
          selectedTo={selectedTo}
          hoverDate={hoverDate}
          rangeInProgress={rangeInProgress}
          mode={mode}
          onSelectDay={onSelectDay}
          onHoverDay={onHoverDate}
          minDate={minDate}
          maxDate={maxDate}
          weekStartsOn={weekStartsOn}
          showHeader
          onPrev={() => onViewMonthChange(addMonths(viewMonth, -1))}
          onNext={() => onViewMonthChange(addMonths(viewMonth, 1))}
          showPrev={false}
          showNext
        />
      )}
    </div>
  );
}

export type { DateRange };
