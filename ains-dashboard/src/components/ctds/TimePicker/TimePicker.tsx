"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import inputStyles from "../Input/Input.module.css";
import { Icon } from "../Icon";
import styles from "./TimePicker.module.css";
import {
  clampStep,
  isSameTime,
  toTotalMinutes,
  type TimeFormat,
  type TimeValue,
} from "./utils";

export type TimePickerSize = "sm" | "md" | "lg";
export type TimePickerVariant = "outline" | "filled" | "line";

export interface TimePickerProps {
  value?: TimeValue | null;
  onChange?: (v: TimeValue | null) => void;

  /** 리스트 간격(분). 5 | 10 | 15 | 30 | 60. 기본 30. */
  step?: number;
  /** 표시 포맷. "24h"(기본) 또는 "12h". */
  format?: TimeFormat;

  /** "HH:MM" (24h). 포함, 이 시간 이전은 비활성. */
  minTime?: string;
  /** "HH:MM" (24h). 포함, 이 시간 이후는 비활성. */
  maxTime?: string;

  disabled?: boolean;
  size?: TimePickerSize;
  variant?: TimePickerVariant;

  /** popover 없이 패널만. */
  inline?: boolean;

  /** 패널 레이아웃.
   *  - "columns"(기본): 시 | 분 세로 스크롤 2열. popover·inline 둘 다 사용.
   *  - "grid": step 간격 전체 슬롯을 격자로 깔아놓음. inline 전제, 예약 슬롯 톤. */
  panelLayout?: "columns" | "grid";

  /** panelLayout="grid"에서 그리드 열 수. 기본 6. */
  gridCols?: 4 | 6 | 8;

  /** panelLayout="grid"에서 오전/오후 섹션 분리. true면 AM/PM 두 섹션으로 자름. */
  splitMeridiem?: boolean;

  /** 상단 상대 시간 칩 노출. ["now", "+15m", "+30m", "+1h"]. 기본 false. */
  quickOptions?: QuickOption[] | boolean;

  className?: string;
  id?: string;
  "aria-label"?: string;
}

type QuickOption =
  | { label: string; minutes: number }
  | "now";

const DEFAULT_QUICK: QuickOption[] = [
  "now",
  { label: "+15m", minutes: 15 },
  { label: "+30m", minutes: 30 },
  { label: "+1h", minutes: 60 },
];

function parseHHMM(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

function clampToRange(
  t: TimeValue,
  minMin: number | null,
  maxMin: number | null
): TimeValue {
  const total = toTotalMinutes(t);
  if (minMin != null && total < minMin) {
    return { hours: Math.floor(minMin / 60), minutes: minMin % 60 };
  }
  if (maxMin != null && total > maxMin) {
    return { hours: Math.floor(maxMin / 60), minutes: maxMin % 60 };
  }
  return t;
}

/* 세그먼트 입력 ─────────────────────────────────────────────
   한 세그먼트는 2자리 숫자(또는 AM/PM 토글). focus 받으면 다음 숫자키 입력에 따라
   buffer를 쌓고, 2자리 완성 or 범위 초과 시 다음 세그먼트로 이동. */

type SegmentKind = "hour" | "minute" | "meridiem";

interface SegmentButtonProps {
  kind: SegmentKind;
  value: number | null; // hour: 0-23 (24h) or 1-12 (12h); minute: 0-59; meridiem: 0=AM 1=PM
  display: string;
  placeholder: string;
  focused: boolean;
  disabled?: boolean;
  onFocus: () => void;
  onKey: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
  "aria-label": string;
}

const SegmentButton = forwardRef<HTMLButtonElement, SegmentButtonProps>(
  function SegmentButton(
    { value, display, placeholder, focused, disabled, onFocus, onKey, ...rest },
    ref
  ) {
    const empty = value == null;
    return (
      <button
        ref={ref}
        type="button"
        role="spinbutton"
        className={[
          styles.segment,
          empty ? styles.segmentPlaceholder : "",
          rest["aria-label"].includes("오전") ? styles.segmentMeridiem : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-focused={focused || undefined}
        disabled={disabled}
        onFocus={onFocus}
        onKeyDown={onKey}
        tabIndex={disabled ? -1 : 0}
        aria-label={rest["aria-label"]}
      >
        {empty ? placeholder : display}
      </button>
    );
  }
);

export const TimePicker = forwardRef<HTMLDivElement, TimePickerProps>(
  (
    {
      value = null,
      onChange,
      step = 30,
      format = "24h",
      minTime,
      maxTime,
      disabled = false,
      size = "md",
      variant = "outline",
      inline = false,
      panelLayout = "columns",
      gridCols = 6,
      splitMeridiem = false,
      quickOptions = false,
      className,
      id,
      "aria-label": ariaLabel,
    },
    ref
  ) => {
    const [open, setOpen] = useState(false);
    const stepMinutes = clampStep(step);
    const minMin = parseHHMM(minTime);
    const maxMin = parseHHMM(maxTime);
    const is12h = format === "12h";

    const autoId = useId();
    const triggerId = id ?? autoId;

    /* 세그먼트 포커스 상태 */
    const [focusedSeg, setFocusedSeg] = useState<SegmentKind | null>(null);
    const hourRef = useRef<HTMLButtonElement>(null);
    const minuteRef = useRef<HTMLButtonElement>(null);
    const meridiemRef = useRef<HTMLButtonElement>(null);

    /* 숫자 타이핑 버퍼 — 세그먼트별로 2자리 완성 추적. */
    const bufferRef = useRef<string>("");
    useEffect(() => {
      bufferRef.current = "";
    }, [focusedSeg]);

    const commit = useCallback(
      (next: TimeValue | null) => {
        if (!next) {
          onChange?.(null);
          return;
        }
        onChange?.(clampToRange(next, minMin, maxMin));
      },
      [onChange, minMin, maxMin]
    );

    const focusSeg = (seg: SegmentKind) => {
      setFocusedSeg(seg);
      bufferRef.current = "";
      if (seg === "hour") hourRef.current?.focus();
      else if (seg === "minute") minuteRef.current?.focus();
      else meridiemRef.current?.focus();
    };

    /* hour/minute 세그먼트 키보드 처리. */
    const handleSegmentKey = (seg: "hour" | "minute") =>
      (e: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        const key = e.key;

        if (/^[0-9]$/.test(key)) {
          e.preventDefault();
          const prevBuf = bufferRef.current;
          const nextBuf = (prevBuf + key).slice(-2);
          bufferRef.current = nextBuf;
          const n = Number(nextBuf);

          const cur = value ?? { hours: 0, minutes: 0 };
          if (seg === "hour") {
            const maxH = is12h ? 12 : 23;
            // 두 자리면 그대로, 한 자리인데 다음 숫자 추가 시 10초과면 한 자리로 즉시 적용
            let h = n;
            if (prevBuf.length === 0 && Number(key) > (is12h ? 1 : 2)) {
              h = Number(key);
              bufferRef.current = "";
              if (is12h) {
                const mer = cur.hours >= 12 ? 12 : 0;
                const h24 = (h % 12) + mer;
                commit({ hours: h24, minutes: cur.minutes });
              } else {
                commit({ hours: h, minutes: cur.minutes });
              }
              focusSeg("minute");
              return;
            }
            if (h > maxH) h = Number(key);
            if (is12h) {
              const mer = cur.hours >= 12 ? 12 : 0;
              const h24 = (h % 12) + mer;
              commit({ hours: h24, minutes: cur.minutes });
            } else {
              commit({ hours: h, minutes: cur.minutes });
            }
            if (bufferRef.current.length === 2) focusSeg("minute");
            return;
          }

          // minute
          let m = n;
          if (prevBuf.length === 0 && Number(key) > 5) {
            m = Number(key);
            bufferRef.current = "";
            commit({ hours: cur.hours, minutes: m });
            if (is12h) focusSeg("meridiem");
            return;
          }
          if (m > 59) m = Number(key);
          commit({ hours: cur.hours, minutes: m });
          if (bufferRef.current.length === 2 && is12h) focusSeg("meridiem");
          return;
        }

        if (key === "ArrowUp" || key === "ArrowDown") {
          e.preventDefault();
          const dir = key === "ArrowUp" ? 1 : -1;
          const cur = value ?? { hours: 0, minutes: 0 };
          if (seg === "hour") {
            const nextH = ((cur.hours + dir) % 24 + 24) % 24;
            commit({ hours: nextH, minutes: cur.minutes });
          } else {
            const stepM = stepMinutes;
            const total = cur.hours * 60 + cur.minutes + dir * stepM;
            const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
            commit({
              hours: Math.floor(wrapped / 60),
              minutes: wrapped % 60,
            });
          }
          return;
        }

        if (key === "ArrowLeft") {
          e.preventDefault();
          if (seg === "minute") focusSeg("hour");
          else if (seg === "hour" && is12h) focusSeg("meridiem");
          return;
        }
        if (key === "ArrowRight") {
          e.preventDefault();
          if (seg === "hour") focusSeg("minute");
          else if (seg === "minute" && is12h) focusSeg("meridiem");
          return;
        }

        if (key === "Backspace" || key === "Delete") {
          e.preventDefault();
          commit(null);
          bufferRef.current = "";
          return;
        }

        if (key === "Enter" || key === " ") {
          e.preventDefault();
          if (!inline) setOpen((o) => !o);
          return;
        }

        if (key === "Escape" && open) {
          e.preventDefault();
          setOpen(false);
        }
      };

    const handleMeridiemKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const key = e.key;
      if (
        key === "a" ||
        key === "A" ||
        key === "p" ||
        key === "P" ||
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === " "
      ) {
        e.preventDefault();
        const cur = value ?? { hours: 0, minutes: 0 };
        const toAM = key === "a" || key === "A";
        const toPM = key === "p" || key === "P";
        let nextMer: "AM" | "PM";
        if (toAM) nextMer = "AM";
        else if (toPM) nextMer = "PM";
        else nextMer = cur.hours >= 12 ? "AM" : "PM";
        const h12 = cur.hours % 12;
        const h24 = nextMer === "PM" ? h12 + 12 : h12;
        commit({ hours: h24, minutes: cur.minutes });
        return;
      }
      if (key === "ArrowLeft") {
        e.preventDefault();
        focusSeg("minute");
        return;
      }
      if (key === "Backspace" || key === "Delete") {
        e.preventDefault();
        commit(null);
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        if (!inline) setOpen((o) => !o);
      }
    };

    /* 표시용 ─────────────────────────────────────────────── */
    const hourDisplay = (() => {
      if (!value) return "";
      if (is12h) {
        const h12 = value.hours % 12 === 0 ? 12 : value.hours % 12;
        return String(h12).padStart(2, "0");
      }
      return String(value.hours).padStart(2, "0");
    })();
    const minuteDisplay = value ? String(value.minutes).padStart(2, "0") : "";
    const meridiemDisplay = value ? (value.hours < 12 ? "am" : "pm") : "";

    /* 그리드 데이터 ─────────────────────────────────────── */
    const hours = (() => {
      if (is12h) return Array.from({ length: 12 }, (_, i) => i + 1);
      return Array.from({ length: 24 }, (_, i) => i);
    })();
    const minutes = Array.from(
      { length: Math.floor(60 / stepMinutes) },
      (_, i) => i * stepMinutes
    );

    const activeMeridiem: "AM" | "PM" | null = value
      ? value.hours >= 12
        ? "PM"
        : "AM"
      : null;

    /* 그리드 셀 선택 */
    const selectHour = (h12or24: number) => {
      const cur = value ?? { hours: 0, minutes: 0 };
      let h24: number;
      if (is12h) {
        const h12 = h12or24 % 12;
        const mer = activeMeridiem ?? (cur.hours >= 12 ? "PM" : "AM");
        h24 = mer === "PM" ? h12 + 12 : h12;
      } else {
        h24 = h12or24;
      }
      commit({ hours: h24, minutes: cur.minutes });
      // hour 선택 후 minute 열로 포커스 유도
      setFocusedSeg("minute");
    };
    const selectMinute = (m: number) => {
      const cur = value ?? { hours: 0, minutes: 0 };
      commit({ hours: cur.hours, minutes: m });
      if (!inline) setOpen(false);
    };
    const selectMeridiem = (mer: "AM" | "PM") => {
      const cur = value ?? { hours: 0, minutes: 0 };
      const h12 = cur.hours % 12;
      const h24 = mer === "PM" ? h12 + 12 : h12;
      commit({ hours: h24, minutes: cur.minutes });
    };

    /* 셀 비활성 판정 */
    const hourDisabled = (hourVal: number): boolean => {
      // 24h: hourVal 그대로, 12h: 현재 meridiem과 결합해 모든 분이 범위 밖일 때만 비활성
      const h24s = is12h
        ? (() => {
            const h12 = hourVal % 12;
            const mer = activeMeridiem ?? "AM";
            return [mer === "PM" ? h12 + 12 : h12];
          })()
        : [hourVal];
      return h24s.every((h) => {
        const start = h * 60;
        const end = h * 60 + 59;
        if (maxMin != null && start > maxMin) return true;
        if (minMin != null && end < minMin) return true;
        return false;
      });
    };
    const minuteDisabled = (mVal: number): boolean => {
      if (!value) return false; // hour 미선택이면 모두 활성
      const total = value.hours * 60 + mVal;
      if (minMin != null && total < minMin) return true;
      if (maxMin != null && total > maxMin) return true;
      return false;
    };

    /* Quick ────────────────────────────────────────────── */
    const quicks = Array.isArray(quickOptions)
      ? quickOptions
      : quickOptions
      ? DEFAULT_QUICK
      : [];

    const applyQuick = (q: QuickOption) => {
      const base = (() => {
        if (q === "now") {
          const d = new Date();
          return { hours: d.getHours(), minutes: d.getMinutes() };
        }
        const cur = value ?? (() => {
          const d = new Date();
          return { hours: d.getHours(), minutes: d.getMinutes() };
        })();
        const total = cur.hours * 60 + cur.minutes + q.minutes;
        const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
        return { hours: Math.floor(wrapped / 60), minutes: wrapped % 60 };
      })();
      commit(base);
    };

    /* 세그먼트 트리거 — Input 시각 토큰 재사용(.root/variant/size) + 전용 .trigger */
    const sizeClass =
      size === "sm"
        ? inputStyles.sizeSm
        : size === "lg"
        ? inputStyles.sizeLg
        : inputStyles.sizeMd;
    const variantClass =
      variant === "filled"
        ? inputStyles.filled
        : variant === "line"
        ? inputStyles.line
        : inputStyles.outline;

    const triggerClass = [
      inputStyles.root,
      variantClass,
      sizeClass,
      styles.trigger,
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const triggerNode = (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        id={triggerId}
        className={triggerClass}
        data-size={size}
        data-disabled={disabled || undefined}
        role="group"
        aria-label={ariaLabel ?? "시간 입력"}
      >
        <div className={styles.segments}>
          <SegmentButton
            ref={hourRef}
            kind="hour"
            value={value?.hours ?? null}
            display={hourDisplay}
            placeholder="HH"
            focused={focusedSeg === "hour"}
            disabled={disabled}
            onFocus={() => setFocusedSeg("hour")}
            onKey={handleSegmentKey("hour")}
            aria-label="시"
          />
          <span className={styles.separator} aria-hidden>
            :
          </span>
          <SegmentButton
            ref={minuteRef}
            kind="minute"
            value={value?.minutes ?? null}
            display={minuteDisplay}
            placeholder="MM"
            focused={focusedSeg === "minute"}
            disabled={disabled}
            onFocus={() => setFocusedSeg("minute")}
            onKey={handleSegmentKey("minute")}
            aria-label="분"
          />
          {is12h && (
            <SegmentButton
              ref={meridiemRef}
              kind="meridiem"
              value={value ? (value.hours >= 12 ? 1 : 0) : null}
              display={meridiemDisplay}
              placeholder="am"
              focused={focusedSeg === "meridiem"}
              disabled={disabled}
              onFocus={() => setFocusedSeg("meridiem")}
              onKey={handleMeridiemKey}
              aria-label="오전 오후"
            />
          )}
        </div>
        {!inline && (
          <RadixPopover.Trigger asChild>
            <button
              type="button"
              className={styles.triggerIconBtn}
              disabled={disabled}
              aria-label="시간 선택 열기"
              aria-haspopup="dialog"
              aria-expanded={open}
            >
              <Icon name="clock" />
            </button>
          </RadixPopover.Trigger>
        )}
      </div>
    );

    const hourLaneRef = useRef<HTMLDivElement>(null);
    const minuteLaneRef = useRef<HTMLDivElement>(null);
    const hourSelectedRef = useRef<HTMLButtonElement>(null);
    const minuteSelectedRef = useRef<HTMLButtonElement>(null);

    useLayoutEffect(() => {
      if (!open && !inline) return;
      ([
        [hourLaneRef, hourSelectedRef],
        [minuteLaneRef, minuteSelectedRef],
      ] as const).forEach(([laneR, cellR]) => {
        const lane = laneR.current;
        const cell = cellR.current;
        if (!lane || !cell) return;
        const target =
          cell.offsetTop - lane.clientHeight / 2 + cell.clientHeight / 2;
        lane.scrollTop = Math.max(0, target);
      });
    }, [open, inline, value, stepMinutes, is12h]);

    const panel = (
      <div className={styles.panel}>
        <div
          className={styles.column}
          data-focus={(!value || focusedSeg === "hour") || undefined}
        >
          <div className={styles.columnLabel}>시</div>
          <div
            ref={hourLaneRef}
            className={`${styles.lane} scroll-fade-y`}
            role="listbox"
            aria-label="시 선택"
          >
            <div className={styles.laneTrack}>
              {hours.map((h) => {
                const selected = (() => {
                  if (!value) return false;
                  if (is12h) {
                    const curH12 = value.hours % 12 === 0 ? 12 : value.hours % 12;
                    return curH12 === h;
                  }
                  return value.hours === h;
                })();
                return (
                  <button
                    key={h}
                    ref={selected ? hourSelectedRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={styles.cell}
                    data-selected={selected || undefined}
                    disabled={hourDisabled(h)}
                    onClick={() => selectHour(h)}
                  >
                    {String(h).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          className={styles.column}
          data-focus={(value && focusedSeg === "minute") || undefined}
        >
          <div className={styles.columnLabel}>분</div>
          <div
            ref={minuteLaneRef}
            className={`${styles.lane} scroll-fade-y`}
            role="listbox"
            aria-label="분 선택"
          >
            <div className={styles.laneTrack}>
              {minutes.map((m) => {
                const selected = isSameTime(value, {
                  hours: value?.hours ?? -1,
                  minutes: m,
                });
                return (
                  <button
                    key={m}
                    ref={selected ? minuteSelectedRef : undefined}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={styles.cell}
                    data-selected={selected || undefined}
                    disabled={minuteDisabled(m)}
                    onClick={() => selectMinute(m)}
                  >
                    {String(m).padStart(2, "0")}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {is12h && (
          <div
            className={`${styles.column} ${styles.meridiemColumn}`}
            data-focus={focusedSeg === "meridiem" || undefined}
          >
            <div className={styles.columnLabel}>&nbsp;</div>
            <div className={styles.lane}>
              <div className={styles.laneTrack}>
                {(["AM", "PM"] as const).map((mer) => {
                  const selected = activeMeridiem === mer;
                  return (
                    <button
                      key={mer}
                      type="button"
                      className={styles.cell}
                      data-selected={selected || undefined}
                      onClick={() => selectMeridiem(mer)}
                    >
                      {mer}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );

    /* Grid panel — step 간격으로 전체 슬롯을 격자. */
    const gridSlots = (() => {
      const list: TimeValue[] = [];
      const total = Math.floor((24 * 60) / stepMinutes);
      for (let i = 0; i < total; i += 1) {
        const t = i * stepMinutes;
        list.push({ hours: Math.floor(t / 60), minutes: t % 60 });
      }
      return list;
    })();

    const renderGridButton = (t: TimeValue) => {
      const total = t.hours * 60 + t.minutes;
      const dis =
        (minMin != null && total < minMin) ||
        (maxMin != null && total > maxMin);
      const selected = isSameTime(value, t);
      const label = (() => {
        if (!is12h) return `${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}`;
        const h12 = t.hours % 12 === 0 ? 12 : t.hours % 12;
        const mm = String(t.minutes).padStart(2, "0");
        const suf = t.hours < 12 ? "AM" : "PM";
        return `${h12}:${mm} ${suf}`;
      })();
      return (
        <button
          key={`${t.hours}:${t.minutes}`}
          type="button"
          className={styles.gridCell}
          data-selected={selected || undefined}
          disabled={dis}
          onClick={() => commit(t)}
        >
          {label}
        </button>
      );
    };

    const gridPanel = splitMeridiem ? (
      <div className={styles.gridWrap}>
        <div className={styles.gridSection}>
          <div className={styles.gridSectionLabel}>오전</div>
          <div className={styles.gridPanel} data-cols={String(gridCols)}>
            {gridSlots.filter((t) => t.hours < 12).map(renderGridButton)}
          </div>
        </div>
        <div className={styles.gridSection}>
          <div className={styles.gridSectionLabel}>오후</div>
          <div className={styles.gridPanel} data-cols={String(gridCols)}>
            {gridSlots.filter((t) => t.hours >= 12).map(renderGridButton)}
          </div>
        </div>
      </div>
    ) : (
      <div className={styles.gridPanel} data-cols={String(gridCols)}>
        {gridSlots.map(renderGridButton)}
      </div>
    );

    const activePanel = panelLayout === "grid" ? gridPanel : panel;

    const panelWithQuick = quicks.length > 0 ? (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div className={styles.quickRow}>
          {quicks.map((q) => (
            <button
              key={typeof q === "string" ? q : q.label}
              type="button"
              className={styles.cell}
              onClick={() => applyQuick(q)}
              style={{ paddingInline: "var(--space-3)" }}
            >
              {typeof q === "string" ? "지금" : q.label}
            </button>
          ))}
        </div>
        {activePanel}
      </div>
    ) : (
      activePanel
    );

    if (inline) {
      // grid 레이아웃은 트리거 없이 패널만.
      if (panelLayout === "grid") {
        return (
          <div
            className={[styles.inlineWrap, className ?? ""].filter(Boolean).join(" ")}
          >
            {panelWithQuick}
          </div>
        );
      }
      return (
        <div
          className={[styles.inlineWrap, className ?? ""].filter(Boolean).join(" ")}
        >
          {triggerNode}
          <div style={{ borderTop: "var(--hairline) solid var(--border)" }}>
            {panelWithQuick}
          </div>
        </div>
      );
    }

    return (
      <RadixPopover.Root open={open} onOpenChange={setOpen}>
        {triggerNode}
        <RadixPopover.Portal>
          <RadixPopover.Content
            className={[styles.popoverContent, "m-float"].join(" ")}
            sideOffset={6}
            align="start"
            collisionPadding={8}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            {panelWithQuick}
          </RadixPopover.Content>
        </RadixPopover.Portal>
      </RadixPopover.Root>
    );
  }
);

TimePicker.displayName = "TimePicker";

export type { TimeValue, TimeFormat };
