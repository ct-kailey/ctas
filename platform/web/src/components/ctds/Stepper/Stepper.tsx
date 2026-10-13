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
type ItemState = "upcoming" | "active" | "done";

type StepperContextValue = {
  orientation: Orientation;
  marker: Marker;
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
      onStepClick,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const ctxValue = useMemo<StepperContextValue>(
      () => ({ orientation, marker, activeIndex, onStepClick }),
      [orientation, marker, activeIndex, onStepClick],
    );

    // 자식 Item에 index를 자동 주입
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
  /** Stepper가 자동 주입. 수동 override 가능. */
  index?: number;
  title: ReactNode;
  hint?: ReactNode;
  /** 명시적 상태 지정. 미지정이면 activeIndex 기준으로 자동 결정. */
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
    const { orientation, marker, activeIndex, onStepClick } =
      useStepperContext();

    const idx = index ?? 0;
    const state: ItemState =
      stateProp ??
      (idx === activeIndex ? "active" : idx < activeIndex ? "done" : "upcoming");

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
          {state === "done" ? (
            <Icon name="check" size={12} />
          ) : marker === "number" ? (
            idx + 1
          ) : state === "active" ? (
            <span className={styles.markerInnerDot} />
          ) : null}
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
