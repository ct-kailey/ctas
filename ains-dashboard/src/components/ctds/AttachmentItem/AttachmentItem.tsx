"use client";

import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from "react";
import {
  DotsThree as PhDotsThree,
  DownloadSimple as PhDownload,
  X as PhX,
} from "@phosphor-icons/react";
import { FileIcon, type FileIconSize } from "@/components/ctds/FileIcon";
import { IconButton, type IconButtonSize } from "@/components/ctds/IconButton";
import { Spinner } from "@/components/ctds/Spinner";
import styles from "./AttachmentItem.module.css";

export type AttachmentItemSize = "sm" | "md" | "lg";
export type AttachmentItemState = "idle" | "loading";

export interface AttachmentItemProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "onError"> {
  /** 파일명. 확장자가 FileIcon 색/라벨을 결정. */
  filename: string;
  /** sm/md=1줄, lg=2줄(파일명 위 / meta 아래). 폭은 전부 400px 고정. */
  size?: AttachmentItemSize;
  /** loading이면 좌측 뱃지가 Spinner(lottie-dots)로 교체. */
  state?: AttachmentItemState;
  /** sm/md: 파일명 옆 inline 보조 영역. lg: 파일명 아래 2번째 줄.
   *  문자열이면 muted 라벨로, ReactNode면 그대로 렌더 (ex. Button ghost xs). */
  meta?: ReactNode;
  /** 지정 시 우측 X. */
  onRemove?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** 지정 시 우측 다운로드 아이콘. */
  onDownload?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** 지정 시 우측 '더보기' 아이콘. */
  onMore?: (e: MouseEvent<HTMLButtonElement>) => void;
}

const sizeClass: Record<AttachmentItemSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

/** 좌측 FileIcon 크기 — sm=sm(16), md=md(24), lg=lg(32). */
const FILE_ICON_SIZE: Record<AttachmentItemSize, FileIconSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

/** trailing IconButton 크기 — sm/md=sm(20), lg=md(24). IconButton 공식 사이즈만 사용. */
const ACTION_BTN_SIZE: Record<AttachmentItemSize, IconButtonSize> = {
  sm: "sm",
  md: "sm",
  lg: "md",
};

/** loading 자리의 Spinner 크기 — loadingSlot(=FileIcon 치수) 16/24/32와 일치시켜야
 *  lottie 내부 scale/offset 계산이 안 깨짐. slot 치수를 그대로 --loader-size로 override. */
const SPINNER_LOADER_SIZE: Record<AttachmentItemSize, string> = {
  sm: "var(--space-4)",
  md: "var(--space-6)",
  lg: "var(--space-8)",
};

/** middle ellipsis — 폭 400px 안에서 충분히 들어가는 글자 수.
 *  확장자는 항상 끝에 남긴다. CSS text-overflow:ellipsis가 뒤에서
 *  확장자를 다시 자르지 않도록 폭 cap은 CSS와 함께 넉넉히 잡는다. */
function middleEllipsis(filename: string, max: number): string {
  if (filename.length <= max) return filename;
  const dot = filename.lastIndexOf(".");
  const extLen = filename.length - dot;
  if (dot <= 0 || extLen > 8 || extLen >= max - 4) {
    return filename.slice(0, Math.max(1, max - 3)) + "...";
  }
  const ext = filename.slice(dot);
  const head = filename.slice(0, Math.max(1, max - ext.length - 3));
  return head + "..." + ext;
}

export function AttachmentItem({
  filename,
  size = "md",
  state = "idle",
  meta,
  onRemove,
  onDownload,
  onMore,
  className,
  ...rest
}: AttachmentItemProps) {
  const cls = [
    styles.root,
    sizeClass[size],
    state === "loading" ? styles.isLoading : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const maxChars = size === "lg" ? 44 : size === "md" ? 40 : 36;
  const label = middleEllipsis(filename, maxChars);

  const leading =
    state === "loading" ? (
      <span className={styles.loadingSlot} aria-hidden>
        <Spinner
          variant="lottie-dots"
          label="업로드 중"
          style={{ "--loader-size": SPINNER_LOADER_SIZE[size] } as CSSProperties}
        />
      </span>
    ) : (
      <FileIcon ext={filename} size={FILE_ICON_SIZE[size]} />
    );

  const actionSize = ACTION_BTN_SIZE[size];

  return (
    <div className={cls} {...rest}>
      {leading}

      <span className={styles.text}>
        <span className={styles.label} title={filename}>
          {label}
        </span>
        {meta != null && meta !== "" ? (
          <span className={styles.meta}>{meta}</span>
        ) : null}
      </span>

      {(onDownload || onMore || onRemove) && (
        <span className={styles.actions}>
          {onDownload ? (
            <IconButton
              size={actionSize}
              variant="ghost"
              onClick={onDownload}
              aria-label="첨부 다운로드"
              icon={<PhDownload />}
            />
          ) : null}
          {onMore ? (
            <IconButton
              size={actionSize}
              variant="ghost"
              onClick={onMore}
              aria-label="첨부 메뉴 열기"
              aria-haspopup="menu"
              icon={<PhDotsThree weight="bold" />}
            />
          ) : null}
          {onRemove ? (
            <IconButton
              size={actionSize}
              variant="ghost"
              onClick={onRemove}
              aria-label="첨부 제거"
              icon={<PhX />}
            />
          ) : null}
        </span>
      )}
    </div>
  );
}
