"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import {
  Infinity as PhInfinity,
  CaretDown as PhCaretDown,
} from "@phosphor-icons/react";
import styles from "./ChatInput.module.css";

interface ModelSelectorProps extends ComponentPropsWithoutRef<"button"> {
  label: string;
  /** true면 라벨 숨기고 아이콘만 (SingleLine에서 공간 부족할 때). */
  compact?: boolean;
}

/* forwardRef — DropdownMenu.Trigger asChild 위임을 위해 ref·props 전달 가능해야. */
export const ModelSelector = forwardRef<HTMLButtonElement, ModelSelectorProps>(
  function ModelSelector({ label, compact = false, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={styles.modelBtn}
        data-compact={compact || undefined}
        aria-label={compact ? `모델: ${label}` : undefined}
        {...rest}
      >
        <PhInfinity className={styles.modelLead} weight="regular" aria-hidden />
        {!compact ? <span className={styles.modelLabel}>{label}</span> : null}
        {!compact ? (
          <PhCaretDown className={styles.modelCaret} weight="bold" aria-hidden />
        ) : null}
      </button>
    );
  },
);
