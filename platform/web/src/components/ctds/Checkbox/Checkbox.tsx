"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { Icon } from "../Icon";
import styles from "./Checkbox.module.css";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  children?: ReactNode;
  /** A span wrapper preserves valid markup inside an existing form label. */
  as?: "label" | "span";
};

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, disabled, children, as: Wrapper = "label", ...rest }, ref) => {
    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");

    return (
      <Wrapper className={rootClass} data-ctds="checkbox" data-unlabelled={Wrapper === "span" || undefined} data-disabled={disabled ? "true" : "false"}>
        <input
          ref={ref}
          type="checkbox"
          className={`${styles.input} visually-hidden`}
          disabled={disabled}
          data-ctds-control="checkbox"
          {...rest}
        />
        <span className={styles.indicator} data-ctds="checkbox-indicator" aria-hidden>
          <Icon name="check" family="lucide" />
        </span>
        {children != null && <span>{children}</span>}
      </Wrapper>
    );
  },
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
