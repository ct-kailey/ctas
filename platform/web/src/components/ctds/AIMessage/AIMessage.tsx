"use client";

import type { HTMLAttributes, ReactNode } from "react";
import {
  MessageActions,
  type MessageAction,
} from "@/components/ctds/MessageActions";
import {
  MessageSources,
  type MessageSource,
} from "@/components/ctds/MessageSources";
import { Spinner } from "@/components/ctds/Spinner";
import styles from "./AIMessage.module.css";

export type AIMessageActionsVisibility = "show" | "hover";

export interface AIMessageProps extends HTMLAttributes<HTMLDivElement> {
  /** 메시지 본문 — markdown 또는 콘텐츠 블록 조합. */
  children: ReactNode;
  /** 메시지 위 작은 라벨 ("LongText", "Code Block" 등). 없으면 숨김. */
  label?: ReactNode;
  /** 액션 노출. 기본 hover. */
  actionsVisibility?: AIMessageActionsVisibility;
  /** 액션 커스터마이즈. 기본 [copy, regenerate]. 비우려면 []. */
  actions?: MessageAction[];
  /** 소스 목록 — 액션바 옆에 inline chip으로 노출. */
  sources?: MessageSource[];
  /** sources chip 클릭 시 (popover 열기 등). */
  onSourcesClick?: () => void;
  /** 생성 중이면 액션 숨김. */
  isGenerating?: boolean;
}

const DEFAULT_ACTIONS: MessageAction[] = [
  { kind: "copy" },
  { kind: "regenerate" },
];

function renderBouncingText(text: string) {
  const chars = Array.from(text);
  return chars.map((ch, i) => {
    if (ch === " ") {
      return (
        <span key={i} className={styles.bounceSpace}>
          {" "}
        </span>
      );
    }
    return (
      <span
        key={i}
        className={styles.bounceChar}
        style={{ animationDelay: `calc(${i} * var(--duration-base))` }}
      >
        {ch}
      </span>
    );
  });
}

export function AIMessage({
  children,
  label,
  actionsVisibility = "hover",
  actions = DEFAULT_ACTIONS,
  sources,
  onSourcesClick,
  isGenerating = false,
  className,
  ...rest
}: AIMessageProps) {
  const cls = [styles.root, className].filter(Boolean).join(" ");
  const hasSources = sources && sources.length > 0 && !isGenerating;
  const hasActions = (actions.length > 0 || hasSources) && !isGenerating;

  return (
    <div
      className={cls}
      data-actions-visibility={actionsVisibility}
      data-generating={isGenerating ? "true" : undefined}
      {...rest}
    >
      {label ? <div className={styles.label}>{label}</div> : null}
      <div className={styles.body}>
        {isGenerating ? (
          <>
            <Spinner variant="lottie-dots" size="sm" className={styles.generatingSpinner} />
            <span className={styles.generatingText}>
              {typeof children === "string" ? renderBouncingText(children) : children}
            </span>
          </>
        ) : (
          children
        )}
      </div>
      {hasActions ? (
        <div className={styles.actions}>
          <MessageActions align="start" actions={actions} />
          {hasSources ? (
            <MessageSources sources={sources!} onClick={onSourcesClick} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
