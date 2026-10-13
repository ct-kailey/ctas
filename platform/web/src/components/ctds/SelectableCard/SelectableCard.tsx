"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../Icon";

import styles from "./SelectableCard.module.css";

export type SelectableCardMode = "radio" | "checkbox" | "icon";

export type SelectableCardProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "title"
> & {
  /**
   * radio: 단일 선택. 좌측에 라디오 인디케이터.
   * checkbox: 다중 선택. 좌측에 체크 인디케이터.
   * icon: 단일 선택. 좌측에 icon prop이 렌더된다. icon 필수.
   */
  mode?: SelectableCardMode;
  title: ReactNode;
  description?: ReactNode;
  /** mode="icon"일 때 좌측 슬롯에 렌더. */
  icon?: IconName;
};

const SelectableCard = forwardRef<HTMLInputElement, SelectableCardProps>(
  (
    {
      className,
      mode = "radio",
      title,
      description,
      icon,
      disabled,
      ...rest
    },
    ref,
  ) => {
    const rootClass = [styles.root, styles[mode], className ?? ""]
      .filter(Boolean)
      .join(" ");
    const inputType = mode === "checkbox" ? "checkbox" : "radio";

    return (
      <label className={rootClass} data-disabled={disabled ? "true" : "false"}>
        <input
          ref={ref}
          type={inputType}
          className={`${styles.input} visually-hidden`}
          disabled={disabled}
          {...rest}
        />
        <span className={styles.surface} aria-hidden />
        <span className={styles.content}>
          <span className={styles.leading} aria-hidden>
            {mode === "radio" && <span className={styles.radioDot} />}
            {mode === "checkbox" && (
              <span className={styles.checkBox}>
                <Icon name="check" />
              </span>
            )}
            {mode === "icon" && icon && (
              <span className={styles.icon}>
                <Icon name={icon} />
              </span>
            )}
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{title}</span>
            {description && (
              <span className={styles.description}>{description}</span>
            )}
          </span>
        </span>
      </label>
    );
  },
);

SelectableCard.displayName = "SelectableCard";

export { SelectableCard };
