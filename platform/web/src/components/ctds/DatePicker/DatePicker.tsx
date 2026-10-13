"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Input, type InputSize } from "../Input";
import { Icon } from "../Icon";
import { Button } from "../Button";
import styles from "./DatePicker.module.css";
import { Calendar } from "./Calendar";
import { TimeSelector } from "./TimeSelector";
import {
  defaultRangePresets,
  defaultSinglePresets,
  type RangePreset,
  type SinglePreset,
} from "./presets";
import {
  combineDateTime,
  formatDate,
  formatHM,
  startOfMonth,
  type DateFormat,
} from "./utils";

export type DatePickerMode = "single" | "range";

export interface DatePickerProps {
  mode?: DatePickerMode;
  /** 달력을 몇 개 나란히 보일지. range에서 2를 권장. */
  months?: 1 | 2;

  /** single 모드 값 */
  value?: Date | null;
  /** range 모드 값 */
  rangeValue?: { from: Date | null; to: Date | null };

  onChange?: (v: Date | null) => void;
  onRangeChange?: (v: { from: Date | null; to: Date | null }) => void;

  /** 시간 선택 포함 여부 */
  withTime?: boolean;

  /** 퀵 프리셋 표시 */
  withPresets?: boolean;
  /** 커스텀 프리셋 (mode에 맞춰 전달). 지정 시 기본 프리셋 대체 */
  presets?: SinglePreset[] | RangePreset[];

  /** 하단 액션 바 표시 (재설정 / 확인). withTime일 때 자동 true. */
  withFooter?: boolean;
  /** footer 재설정 클릭 — 값을 null로 초기화 */
  onReset?: () => void;
  /** footer 확인 클릭 — Popover 닫기 트리거. inline일 땐 무시. */
  onConfirm?: () => void;
  /** footer 재설정 버튼 라벨 (기본 "재설정") */
  resetLabel?: string;
  /** footer 확인 버튼 라벨 (기본 "확인") */
  confirmLabel?: string;

  minDate?: Date;
  maxDate?: Date;
  /** 주 시작 요일 (0=일 ... 6=토). 기본 0(일). */
  weekStartsOn?: number;

  /** 트리거 인풋 표시 형식.
   *  - "short":  25-01-15
   *  - "iso":    2025-01-15 (기본)
   *  - "medium": 2025년 1월 15일
   *  - "long":   2025년 1월 15일 (수) */
  dateFormat?: DateFormat;

  placeholder?: string;
  disabled?: boolean;
  size?: InputSize;
  /** popover 없이 인라인으로 노출. 트리거 input이 사라짐. */
  inline?: boolean;
  /** 인풋 커스텀 렌더링. asChild 형태로 rendered element를 감쌈. */
  trigger?: ReactNode;

  className?: string;
  id?: string;
  "aria-label"?: string;
}

function displayValue(props: {
  mode: DatePickerMode;
  value: Date | null;
  from: Date | null;
  to: Date | null;
  withTime: boolean;
  dateFormat: DateFormat;
}): string {
  const { mode, value, from, to, withTime, dateFormat } = props;
  const fmt = (d: Date) =>
    withTime ? `${formatDate(d, dateFormat)} ${formatHM(d)}` : formatDate(d, dateFormat);
  if (mode === "single") {
    if (!value) return "";
    return fmt(value);
  }
  const f = from ? fmt(from) : "";
  const t = to ? fmt(to) : "";
  if (!f && !t) return "";
  return `${f} ~ ${t}`;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      mode = "single",
      months = mode === "range" ? 2 : 1,
      value = null,
      rangeValue = { from: null, to: null },
      onChange,
      onRangeChange,
      withTime = false,
      withPresets = false,
      presets,
      withFooter,
      onReset,
      onConfirm,
      resetLabel = "재설정",
      confirmLabel = "확인",
      minDate,
      maxDate,
      weekStartsOn = 0,
      dateFormat = "iso",
      placeholder = "날짜 선택",
      disabled = false,
      size = "md",
      inline = false,
      trigger,
      className,
      id,
      "aria-label": ariaLabel,
    },
    ref
  ) => {
    const [open, setOpen] = useState(false);
    const anchorDate = value ?? rangeValue.from ?? new Date();
    const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(anchorDate));
    const [hoverDate, setHoverDate] = useState<Date | null>(null);
    const [rangeInProgress, setRangeInProgress] = useState(false);

    const activePresets = useMemo(() => {
      if (presets) return presets;
      return mode === "single" ? defaultSinglePresets : defaultRangePresets;
    }, [presets, mode]);

    const handleSelectDay = useCallback(
      (day: Date) => {
        if (mode === "single") {
          const next = withTime && value
            ? combineDateTime(day, value.getHours(), value.getMinutes())
            : day;
          onChange?.(next);
          if (!withTime && !(withFooter ?? withTime)) setOpen(false);
          return;
        }

        // range
        const { from, to } = rangeValue;
        const firstPick = !from || (from && to) || rangeInProgress === false;
        if (firstPick) {
          const nextFrom = withTime && from
            ? combineDateTime(day, from.getHours(), from.getMinutes())
            : day;
          onRangeChange?.({ from: nextFrom, to: null });
          setRangeInProgress(true);
          setHoverDate(day);
          return;
        }
        // second pick
        let start = from!;
        let end = day;
        if (end.getTime() < start.getTime()) [start, end] = [end, start];
        if (withTime) {
          if (from) start = combineDateTime(start, from.getHours(), from.getMinutes());
          if (to) end = combineDateTime(end, to.getHours(), to.getMinutes());
        }
        onRangeChange?.({ from: start, to: end });
        setRangeInProgress(false);
        setHoverDate(null);
        if (!withTime && !(withFooter ?? withTime)) setOpen(false);
      },
      [mode, value, rangeValue, withTime, withFooter, onChange, onRangeChange, rangeInProgress]
    );

    const handleTimeChange = useCallback(
      (which: "single" | "from" | "to", t: { hours: number; minutes: number }) => {
        if (which === "single") {
          const base = value ?? new Date();
          onChange?.(combineDateTime(base, t.hours, t.minutes));
          return;
        }
        const { from, to } = rangeValue;
        if (which === "from") {
          const base = from ?? new Date();
          onRangeChange?.({ from: combineDateTime(base, t.hours, t.minutes), to });
        } else {
          const base = to ?? from ?? new Date();
          onRangeChange?.({ from, to: combineDateTime(base, t.hours, t.minutes) });
        }
      },
      [value, rangeValue, onChange, onRangeChange]
    );

    const applyPreset = useCallback(
      (preset: SinglePreset | RangePreset) => {
        if (mode === "single") {
          const d = (preset as SinglePreset).getValue();
          onChange?.(d);
          setViewMonth(startOfMonth(d));
          if (!withTime && !(withFooter ?? withTime)) setOpen(false);
        } else {
          const { from, to } = (preset as RangePreset).getValue();
          onRangeChange?.({ from, to });
          setViewMonth(startOfMonth(from));
          setRangeInProgress(false);
          if (!withTime && !(withFooter ?? withTime)) setOpen(false);
        }
      },
      [mode, withTime, withFooter, onChange, onRangeChange]
    );

    const display = displayValue({
      mode,
      value,
      from: rangeValue.from,
      to: rangeValue.to,
      withTime,
      dateFormat,
    });

    const showFooter = withFooter ?? withTime;

    const handleReset = () => {
      if (mode === "single") onChange?.(null);
      else onRangeChange?.({ from: null, to: null });
      setRangeInProgress(false);
      onReset?.();
    };

    const handleConfirm = () => {
      onConfirm?.();
      if (!inline) setOpen(false);
    };

    const panel = (
      <div className={styles.panel} data-with-presets={withPresets || undefined}>
        {withPresets && (
          <div className={styles.presets} role="listbox" aria-label="빠른 선택">
            {activePresets.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                className={styles.presetChip}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}

        <div className={styles.panelMain} data-with-time={withTime || undefined}>
          <Calendar
            mode={mode}
            months={months}
            viewMonth={viewMonth}
            onViewMonthChange={setViewMonth}
            selectedFrom={mode === "single" ? value : rangeValue.from}
            selectedTo={mode === "single" ? null : rangeValue.to}
            hoverDate={hoverDate}
            onHoverDate={setHoverDate}
            rangeInProgress={rangeInProgress}
            onSelectDay={handleSelectDay}
            minDate={minDate}
            maxDate={maxDate}
            weekStartsOn={weekStartsOn}
          />

          {withTime && (
            <div className={styles.timeArea} data-mode={mode}>
              {mode === "single" ? (
                <TimeSelector
                  value={
                    value
                      ? { hours: value.getHours(), minutes: value.getMinutes() }
                      : null
                  }
                  onChange={(t) => handleTimeChange("single", t)}
                />
              ) : (
                <>
                  <TimeSelector
                    label="시작 시간"
                    value={
                      rangeValue.from
                        ? { hours: rangeValue.from.getHours(), minutes: rangeValue.from.getMinutes() }
                        : null
                    }
                    onChange={(t) => handleTimeChange("from", t)}
                  />
                  <TimeSelector
                    label="종료 시간"
                    value={
                      rangeValue.to
                        ? { hours: rangeValue.to.getHours(), minutes: rangeValue.to.getMinutes() }
                        : null
                    }
                    onChange={(t) => handleTimeChange("to", t)}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {showFooter && (
          <div className={styles.footer}>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              {resetLabel}
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    );

    if (inline) {
      return (
        <div className={[styles.inlineWrap, className ?? ""].filter(Boolean).join(" ")} id={id}>
          {panel}
        </div>
      );
    }

    const calendarIcon = <Icon name="calendar-blank" />;

    return (
      <RadixPopover.Root open={open} onOpenChange={setOpen}>
        <RadixPopover.Trigger asChild>
          {trigger ?? (
            <Input
              ref={ref}
              id={id}
              size={size}
              disabled={disabled}
              value={display}
              placeholder={placeholder}
              rightIcon={calendarIcon}
              className={[styles.triggerInput, className ?? ""].filter(Boolean).join(" ")}
              aria-label={ariaLabel ?? placeholder}
              aria-haspopup="dialog"
              role="combobox"
              aria-expanded={open}
              style={{ cursor: "pointer" }}
            />
          )}
        </RadixPopover.Trigger>
        <RadixPopover.Portal>
          <RadixPopover.Content
            className={[styles.popoverContent, "m-float"].join(" ")}
            sideOffset={6}
            align="start"
            collisionPadding={8}
          >
            {panel}
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
    );
  }
);

DatePicker.displayName = "DatePicker";

export type { SinglePreset, RangePreset };
