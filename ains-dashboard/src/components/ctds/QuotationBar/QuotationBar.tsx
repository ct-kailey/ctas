"use client";

import type { HTMLAttributes, MouseEvent } from "react";
import {
  ArrowBendDownRight as PhArrowBendDownRight,
  X as PhX,
} from "@phosphor-icons/react";
import styles from "./QuotationBar.module.css";

export interface QuotationBarProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onError"> {
  /** 인용 본문. 1줄 ellipsis — 긴 글은 자동 생략. */
  text: string;
  /** 지정 시 우측 X 노출, 클릭 시 호출. */
  onRemove?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function QuotationBar({
  text,
  onRemove,
  className,
  ...rest
}: QuotationBarProps) {
  const cls = [styles.root, className].filter(Boolean).join(" ");

  return (
    <div className={cls} {...rest}>
      <PhArrowBendDownRight
        className={styles.leadIcon}
        weight="regular"
        aria-hidden
      />
      <span className={styles.text} title={text}>
        {text}
      </span>
      {onRemove ? (
        <button
          type="button"
          className={styles.removeBtn}
          onClick={onRemove}
          aria-label="인용 제거"
        >
          <PhX className={styles.removeIcon} weight="regular" />
        </button>
      ) : null}
    </div>
  );
}
