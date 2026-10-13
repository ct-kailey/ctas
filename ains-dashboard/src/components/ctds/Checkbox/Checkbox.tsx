"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { Icon } from "../Icon";
import styles from "./Checkbox.module.css";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  children?: ReactNode;
};

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, disabled, children, ...rest }, ref) => {
    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");

    return (
      <label className={rootClass} data-disabled={disabled ? "true" : "false"}>
        <input
          ref={ref}
          type="checkbox"
          className={`${styles.input} visually-hidden`}
          disabled={disabled}
          {...rest}
        />
        <span className={styles.indicator} aria-hidden>
          <Icon name="check" family="lucide" />
        </span>
        {children != null && <span>{children}</span>}
      </label>
    );
  },
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
