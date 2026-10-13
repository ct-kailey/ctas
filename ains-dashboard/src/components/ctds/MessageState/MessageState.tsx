"use client";

import type { HTMLAttributes, ReactNode } from "react";
import {
  MagnifyingGlass as PhSearch,
  PencilSimple as PhPencil,
  Image as PhImage,
  VideoCamera as PhVideo,
  File as PhFile,
  Check as PhCheck,
} from "@phosphor-icons/react";
import { Spinner } from "@/components/ctds/Spinner";
import styles from "./MessageState.module.css";

export type MessageStateKind =
  | "generating"
  | "searching"
  | "memory"
  | "image"
  | "video"
  | "file"
  | "custom";

export interface MessageStateProps extends HTMLAttributes<HTMLDivElement> {
  kind?: MessageStateKind;
  /** 활성 상태 라벨 override. 미지정 시 kind별 기본("…ing…"). */
  message?: ReactNode;
  /** 완료 상태 라벨 override. 미지정 시 kind별 done 기본("…ed"). */
  doneMessage?: ReactNode;
  /** 완료 상태 — true면 spinner 자리에 ✓, 라벨 통통거림 멈춤, doneMessage로 전환. */
  done?: boolean;
  /** 커스텀 아이콘 — kind="custom"이거나 override 하고 싶을 때. */
  icon?: ReactNode;
}

const DEFAULT_MESSAGE: Record<MessageStateKind, string> = {
  generating: "응답 생성 중…",
  searching: "Searching the web…",
  memory: "Updating memory…",
  image: "Looking at the image…",
  video: "Reviewing the video…",
  file: "Processing file…",
  custom: "",
};

/** 완료 상태 라벨 — done=true일 때 message prop이 없으면 이걸 사용. */
const DEFAULT_DONE_MESSAGE: Record<MessageStateKind, string> = {
  generating: "응답 완료",
  searching: "Searched the web",
  memory: "Updated saved memory",
  image: "Looked at the image",
  video: "Reviewed the video",
  file: "Processed file",
  custom: "",
};

const KIND_ICON: Record<MessageStateKind, React.ComponentType<any> | null> = {
  generating: null, // Spinner만
  searching: PhSearch,
  memory: PhPencil,
  image: PhImage,
  video: PhVideo,
  file: PhFile,
  custom: null,
};

function renderBouncingText(text: string) {
  const chars = Array.from(text);
  return chars.map((ch, i) => {
    if (ch === " ") {
      return (
        <span key={i} className={styles.bounceSpace}>
          {" "}
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

export function MessageState({
  kind = "generating",
  message,
  doneMessage,
  done = false,
  icon,
  className,
  ...rest
}: MessageStateProps) {
  const label = done
    ? doneMessage ?? DEFAULT_DONE_MESSAGE[kind]
    : message ?? DEFAULT_MESSAGE[kind];
  const KindIcon = KIND_ICON[kind];

  const cls = [styles.root, className].filter(Boolean).join(" ");

  const leadIcon = done ? (
    <PhCheck className={styles.leadIcon} weight="bold" aria-hidden />
  ) : icon ? (
    <span className={styles.leadIcon}>{icon}</span>
  ) : KindIcon ? (
    <KindIcon className={styles.leadIcon} weight="regular" aria-hidden />
  ) : (
    <Spinner variant="lottie-dots" size="sm" className={styles.leadSpinner} />
  );

  const labelStr = typeof label === "string" ? label : null;

  return (
    <div className={cls} data-done={done || undefined} {...rest}>
      {leadIcon}
      <span className={styles.label}>
        {done || !labelStr ? label : renderBouncingText(labelStr)}
      </span>
    </div>
  );
}
