"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { Bubble, type BubbleFill, type BubbleShape, type BubbleSize } from "@/components/ctds/Bubble";
import {
  MessageActions,
  type MessageAction,
} from "@/components/ctds/MessageActions";
import styles from "./UserMessage.module.css";

export type UserMessageActionsVisibility = "show" | "hover";

export interface UserMessageProps extends HTMLAttributes<HTMLDivElement> {
  /** 메시지 본문. string 또는 ReactNode. */
  children: ReactNode;
  /** 버블 모양. 기본 circular-drop. */
  shape?: BubbleShape;
  /** 버블 fill. 기본 translucent. */
  fill?: BubbleFill;
  /** 버블 size. 기본 md. */
  size?: BubbleSize;
  /** 액션 노출 — "show" 상시 / "hover" 호버 시만. 기본 hover. */
  actionsVisibility?: UserMessageActionsVisibility;
  /** 액션 커스터마이즈. 기본 [copy, edit]. 비우려면 []. */
  actions?: MessageAction[];
  /** 메시지 위에 올라올 첨부(이미지/파일) 등 — 상위에서 자유 조합. */
  before?: ReactNode;
}

const DEFAULT_ACTIONS: MessageAction[] = [
  { kind: "copy" },
  { kind: "edit" },
];

export function UserMessage({
  children,
  shape = "circular-drop",
  fill = "translucent",
  size = "md",
  actionsVisibility = "hover",
  actions = DEFAULT_ACTIONS,
  before,
  className,
  ...rest
}: UserMessageProps) {
  const cls = [styles.root, className].filter(Boolean).join(" ");
  const hasActions = actions.length > 0;

  return (
    <div
      className={cls}
      data-actions-visibility={actionsVisibility}
      {...rest}
    >
      {before ? <div className={styles.before}>{before}</div> : null}
      <Bubble shape={shape} fill={fill} size={size} tail="end" className={styles.bubble}>
        {children}
      </Bubble>
      {hasActions ? (
        <div className={styles.actions}>
          <MessageActions align="end" actions={actions} />
        </div>
      ) : null}
    </div>
  );
}
