"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import styles from "./Radio.module.css";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  children?: ReactNode;
};

const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, disabled, children, ...rest }, ref) => {
    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");

    return (
      <label className={rootClass} data-disabled={disabled ? "true" : "false"}>
        <input
          ref={ref}
          type="radio"
          className={`${styles.input} visually-hidden`}
          disabled={disabled}
          {...rest}
        />
        <span className={styles.indicator} aria-hidden />
        {children != null && <span>{children}</span>}
      </label>
    );
  },
);

Radio.displayName = "Radio";

export { Radio };
