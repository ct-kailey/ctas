"use client";

import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import {
  Copy as PhCopy,
  PencilSimple as PhPencil,
  ArrowClockwise as PhArrowClockwise,
  ShareNetwork as PhShare,
  TrashSimple as PhTrash,
  ThumbsUp as PhThumbsUp,
  ThumbsDown as PhThumbsDown,
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ctds/Tooltip";
import styles from "./MessageActions.module.css";

export type MessageActionKind =
  | "copy"
  | "edit"
  | "regenerate"
  | "share"
  | "delete"
  | "like"
  | "dislike";

const ICON: Record<MessageActionKind, React.ComponentType<any>> = {
  copy: PhCopy,
  edit: PhPencil,
  regenerate: PhArrowClockwise,
  share: PhShare,
  delete: PhTrash,
  like: PhThumbsUp,
  dislike: PhThumbsDown,
};

const LABEL: Record<MessageActionKind, string> = {
  copy: "복사",
  edit: "수정",
  regenerate: "다시 생성",
  share: "공유",
  delete: "삭제",
  like: "좋아요",
  dislike: "싫어요",
};

export interface MessageAction {
  kind: MessageActionKind;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** label override. 기본은 kind에 매핑된 한국어. */
  label?: string;
  /** 커스텀 아이콘 — kind가 알 수 없는 액션일 때. */
  icon?: ReactNode;
}

export interface MessageActionsProps extends HTMLAttributes<HTMLDivElement> {
  actions: MessageAction[];
  /** 메시지 아래 왼/오른 정렬. UserMessage=end, AIMessage=start. */
  align?: "start" | "end";
}

export function MessageActions({
  actions,
  align = "start",
  className,
  ...rest
}: MessageActionsProps) {
  const cls = [styles.root, className].filter(Boolean).join(" ");

  return (
    <div
      className={cls}
      data-align={align}
      role="toolbar"
      aria-label="메시지 액션"
      {...rest}
    >
      {actions.map((a, i) => {
        const Icon = ICON[a.kind] ?? null;
        const label = a.label ?? LABEL[a.kind] ?? a.kind;
        return (
          <Tooltip key={`${a.kind}-${i}`} content={label}>
            <button
              type="button"
              className={styles.btn}
              onClick={a.onClick}
              aria-label={label}
            >
              {a.icon ?? (Icon ? <Icon className={styles.icon} weight="regular" aria-hidden /> : null)}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
