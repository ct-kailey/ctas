"use client";

import {
  forwardRef,
  useCallback,
  type CSSProperties,
  type InputHTMLAttributes,
} from "react";

import styles from "./Switch.module.css";

export type SwitchSize = "sm" | "md" | "lg";

export type SwitchProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  size?: SwitchSize;
  /**
   * 토글 변경 콜백. 공식 API — 대부분의 경우 이걸 쓴다.
   * 네이티브 `onChange`도 받아낼 수 있는데, 둘 다 쓰면 호출 순서는:
   *   1) onChange(e) — 호출자가 e.preventDefault() 할 수 있는 escape hatch.
   *   2) onChange가 preventDefault 하지 않으면 onCheckedChange(checked).
   */
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  (
    { className, size = "md", onCheckedChange, onChange, style, ...rest },
    ref,
  ) => {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
        if (!e.defaultPrevented) onCheckedChange?.(e.target.checked);
      },
      [onChange, onCheckedChange],
    );

    const cls = [styles.root, styles[`size_${size}`], className ?? ""]
      .filter(Boolean)
      .join(" ");

    return (
      <label className={cls} style={style as CSSProperties}>
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className={styles.input}
          onChange={handleChange}
          {...rest}
        />
        <span className={styles.track} aria-hidden>
          <span className={styles.thumb} />
        </span>
      </label>
    );
  },
);
Switch.displayName = "Switch";

export { Switch };
