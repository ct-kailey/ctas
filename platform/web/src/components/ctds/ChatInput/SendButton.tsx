"use client";

import type { MouseEvent } from "react";
import {
  ArrowUp as PhArrowUp,
  Square as PhSquare,
} from "@phosphor-icons/react";
import styles from "./ChatInput.module.css";

interface SendButtonProps {
  /** 입력에 텍스트/첨부가 있어 send 가능한지. */
  active: boolean;
  /** 스트리밍 중 → stop 아이콘. */
  streaming?: boolean;
  disabled?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function SendButton({
  active,
  streaming = false,
  disabled,
  onClick,
}: SendButtonProps) {
  return (
    <button
      type="button"
      className={styles.sendBtn}
      data-active={active || streaming || undefined}
      disabled={disabled}
      onClick={onClick}
      aria-label={streaming ? "중지" : "보내기"}
    >
      {streaming ? (
        <PhSquare className={styles.sendIcon} weight="fill" />
      ) : (
        <PhArrowUp className={styles.sendIcon} weight="bold" />
      )}
    </button>
  );
}
