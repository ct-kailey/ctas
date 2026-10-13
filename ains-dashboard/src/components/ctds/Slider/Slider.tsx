"use client";

import {
  forwardRef,
  useCallback,
  useMemo,
  type CSSProperties,
  type InputHTMLAttributes,
} from "react";

import styles from "./Slider.module.css";

export type SliderSize = "sm" | "md" | "lg";

export type SliderProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "value" | "defaultValue"
> & {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  size?: SliderSize;
  onValueChange?: (value: number) => void;
};

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  (
    {
      className,
      value,
      defaultValue,
      min = 0,
      max = 100,
      step = 1,
      size = "md",
      onValueChange,
      onChange,
      style,
      ...rest
    },
    ref,
  ) => {
    const current = value ?? defaultValue ?? min;
    const denom = max - min || 1;
    const pct = useMemo(
      () => Math.max(0, Math.min(100, ((current - min) / denom) * 100)),
      [current, min, denom],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
        if (!e.defaultPrevented) onValueChange?.(Number(e.target.value));
      },
      [onChange, onValueChange],
    );

    const cls = [styles.root, styles[`size_${size}`], className ?? ""]
      .filter(Boolean)
      .join(" ");

    const mergedStyle: CSSProperties = {
      ...style,
      ["--slider-pct" as string]: `${pct}%`,
    };

    return (
      <input
        ref={ref}
        type="range"
        className={cls}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        min={min}
        max={max}
        step={step}
        onChange={handleChange}
        style={mergedStyle}
        {...rest}
      />
    );
  },
);
Slider.displayName = "Slider";

export { Slider };
