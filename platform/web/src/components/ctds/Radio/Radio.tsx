"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import styles from "./Radio.module.css";

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> & {
  children?: ReactNode;
  /** A span wrapper preserves valid markup inside an existing form label. */
  as?: "label" | "span";
};

const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, disabled, children, as: Wrapper = "label", ...rest }, ref) => {
    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");

    return (
      <Wrapper className={rootClass} data-ctds="radio" data-unlabelled={Wrapper === "span" || undefined} data-disabled={disabled ? "true" : "false"}>
        <input
          ref={ref}
          type="radio"
          className={`${styles.input} visually-hidden`}
          disabled={disabled}
          data-ctds-control="radio"
          {...rest}
        />
        <span className={styles.indicator} data-ctds="radio-indicator" aria-hidden />
        {children != null && <span>{children}</span>}
      </Wrapper>
    );
  },
);

Radio.displayName = "Radio";

export { Radio };
