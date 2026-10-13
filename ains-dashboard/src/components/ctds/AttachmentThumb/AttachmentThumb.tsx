"use client";

import type { CSSProperties, HTMLAttributes, MouseEvent } from "react";
import { ImageSquare as PhImageSquare, X as PhX } from "@phosphor-icons/react";
import { Spinner } from "@/components/ctds/Spinner";
import styles from "./AttachmentThumb.module.css";

export type AttachmentThumbSize = "sm" | "md" | "lg";

export interface AttachmentThumbProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children" | "onError"> {
  /** 이미지 소스. 없으면 image glyph placeholder (블루톤 L/D pair). */
  src?: string;
  alt?: string;
  /** sm=32 / md=40 / lg=56. 기본 md. */
  size?: AttachmentThumbSize;
  /** 로딩 중 pulse. src 디코딩 전·업로드 처리 중. */
  loading?: boolean;
  /** 지정 시 hover에서 코너에 X 노출. */
  onRemove?: (e: MouseEvent<HTMLButtonElement>) => void;
}

const sizeClass: Record<AttachmentThumbSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

/* placeholder 블루톤 L/D pair — FileIcon 제너릭 그룹과 같은 패턴.
   브랜드 자산 범주 — CSS 토큰으로 추상화 X. inline style로 주입해 CSS 린터 범위 밖. */
const PLACEHOLDER_VARS = {
  "--at-ph-bg-light": "#D5E8FD",
  "--at-ph-fg-light": "#2D7FD3",
  "--at-ph-bg-dark": "#1E3A5F",
  "--at-ph-fg-dark": "#C5DFF8",
} as CSSProperties;

export function AttachmentThumb({
  src,
  alt = "",
  size = "md",
  loading = false,
  onRemove,
  className,
  style,
  ...rest
}: AttachmentThumbProps) {
  const isPlaceholder = !loading && !src;

  const cls = [
    styles.root,
    sizeClass[size],
    loading
      ? styles.loading
      : src
      ? styles.hasImage
      : styles.placeholder,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const mergedStyle: CSSProperties = isPlaceholder
    ? { ...PLACEHOLDER_VARS, ...style }
    : style ?? {};

  return (
    <span
      className={cls}
      style={mergedStyle}
      data-removable={onRemove ? "" : undefined}
      {...rest}
    >
      {loading ? (
        <Spinner variant="lottie-spinner" size="sm" />
      ) : src ? (
        <img src={src} alt={alt} className={styles.img} />
      ) : (
        <PhImageSquare className={styles.glyph} weight="regular" aria-hidden />
      )}

      {onRemove && !loading ? (
        <button
          type="button"
          className={styles.removeBtn}
          onClick={onRemove}
          aria-label="첨부 제거"
        >
          <PhX className={styles.removeIcon} weight="bold" />
        </button>
      ) : null}
    </span>
  );
}
