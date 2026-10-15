"use client";

import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useMemo,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { Icon } from "../Icon";
import styles from "./Stepper.module.css";

type Orientation = "vertical" | "horizontal";
type Marker = "dot" | "number";
type Variant = "md" | "sm";
type Tone = "primary" | "neutral";
type HintPlacement = "below" | "inline";
type LineStyle = "dashed" | "solid";
type ItemState = "upcoming" | "active" | "done";

type StepperContextValue = {
  orientation: Orientation;
  marker: Marker;
  variant: Variant;
  tone: Tone;
  hintPlacement: HintPlacement;
  activeIndex: number;
  onStepClick?: (index: number) => void;
};


const StepperContext = createContext<StepperContextValue | null>(null);

function useStepperContext(): StepperContextValue {
  const ctx = useContext(StepperContext);
  if (!ctx) {
    throw new Error("Stepper.Item must be used inside <Stepper>.");
  }
  return ctx;
}

// ────────────────────────────────────────────────────────

export type StepperProps = Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  /** 현재 활성 스텝 index (0-based). */
  activeIndex: number;
  /** 세로/가로 배치. 기본 vertical. */
  orientation?: Orientation;
  /** marker 종류. dot(기본) | number. */
  marker?: Marker;
  /**
   * marker 사이즈.
   * - `md` : 24px 동그라미 marker (기본, 01 Stripe 류)
   * - `sm` : 10px 작은 solid dot (02 헤이딜러 류, title 중심)
   */
  variant?: Variant;
  /**
   * 색 톤.
   * - `primary` : done/active 모두 Primary (기본)
   * - `neutral` : done은 모노톤, active만 Primary 혹은 fg-strong
   */
  tone?: Tone;
  /** hint 배치. below(기본) | inline(title 옆). */
  hintPlacement?: HintPlacement;
  /** 스텝 사이 연결선 스타일. dashed(기본) | solid. */
  lineStyle?: LineStyle;
  /** 스텝 클릭 시. 자식 Item에 onClick이 있으면 그쪽이 우선. */
  onStepClick?: (index: number) => void;
  children: ReactNode;
};

const StepperRoot = forwardRef<HTMLDivElement, StepperProps>(
  (
    {
      activeIndex,
      orientation = "vertical",
      marker = "dot",
      variant = "md",
      tone = "primary",
      hintPlacement = "below",
      lineStyle = "dashed",
      onStepClick,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const ctxValue = useMemo<StepperContextValue>(
      () => ({
        orientation,
        marker,
        variant,
        tone,
        hintPlacement,
        activeIndex,
        onStepClick,
      }),
      [
        orientation,
        marker,
        variant,
        tone,
        hintPlacement,
        activeIndex,
        onStepClick,
      ],
    );

    const items = Children.toArray(children).filter(isValidElement);
    const injected = items.map((child, i) =>
      cloneElement(child as ReactElement<StepperItemProps>, {
        index: (child as ReactElement<StepperItemProps>).props.index ?? i,
      }),
    );

    return (
      <StepperContext.Provider value={ctxValue}>
        <div
          ref={ref}
          role="list"
          className={[
            styles.root,
            orientation === "vertical" ? styles.vertical : styles.horizontal,
            className ?? "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-orientation={orientation}
          data-marker={marker}
          data-variant={variant}
          data-tone={tone}
          data-hint-placement={hintPlacement}
          data-line-style={lineStyle}
          {...rest}
        >
          {injected}
        </div>
      </StepperContext.Provider>
    );
  },
);
StepperRoot.displayName = "Stepper";

// ────────────────────────────────────────────────────────

export type StepperItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "title"
> & {
  index?: number;
  title: ReactNode;
  hint?: ReactNode;
  state?: ItemState;
};

const StepperItem = forwardRef<HTMLButtonElement, StepperItemProps>(
  (
    {
      index,
      title,
      hint,
      state: stateProp,
      disabled,
      onClick,
      className,
      children: _children,
      ...rest
    },
    ref,
  ) => {
    const { orientation, marker, variant, activeIndex, onStepClick } =
      useStepperContext();

    const idx = index ?? 0;
    const state: ItemState =
      stateProp ??
      (idx === activeIndex ? "active" : idx < activeIndex ? "done" : "upcoming");

    // marker 내부 렌더링 규칙:
    // ─ sm variant   : 내부 글자/dot 없음 (marker 자체가 작은 solid dot)
    // ─ done         : check 아이콘
    // ─ number marker: 숫자 (active여도 숫자 유지)
    // ─ dot + active : 작은 Primary dot
    const markerContent =
      variant === "sm"
        ? null
        : state === "done"
          ? <Icon name="check" size={10} />
          : marker === "number"
            ? idx + 1
            : state === "active"
              ? <span className={styles.markerInnerDot} />
              : null;

    return (
      <button
        ref={ref}
        type="button"
        role="listitem"
        className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
        data-state={state}
        data-orientation={orientation}
        disabled={disabled}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) onStepClick?.(idx);
        }}
        aria-current={state === "active" ? "step" : undefined}
        {...rest}
      >
        <span className={styles.marker} aria-hidden>
          {markerContent}
        </span>
        <span className={styles.body}>
          <span className={styles.title}>{title}</span>
          {hint != null && <span className={styles.hint}>{hint}</span>}
        </span>
      </button>
    );
  },
);
StepperItem.displayName = "Stepper.Item";

// ────────────────────────────────────────────────────────

type StepperComponent = typeof StepperRoot & {
  Item: typeof StepperItem;
};

const Stepper = StepperRoot as StepperComponent;
Stepper.Item = StepperItem;

export { Stepper };
