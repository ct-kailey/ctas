"use client";

import type { HTMLAttributes, MouseEvent } from "react";
import { DownloadSimple as PhDownload } from "@phosphor-icons/react";
import { Spinner } from "@/components/ctds/Spinner";
import { Tooltip } from "@/components/ctds/Tooltip";
import styles from "./GeneratedImage.module.css";

export type GeneratedImageAspect = "square" | "portrait" | "landscape";

export interface GeneratedImageProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** 생성된 이미지 URL. 없거나 loading이면 placeholder. */
  src?: string;
  alt?: string;
  /** 가로세로 비율. portrait=3/4(기본, 레퍼런스), square=1/1, landscape=4/3. */
  aspect?: GeneratedImageAspect;
  /** 생성 중 — placeholder + sparkle breathe 애니. */
  loading?: boolean;
  /** 다운로드 버튼 클릭. 미지정 시 버튼 숨김. */
  onDownload?: (e: MouseEvent<HTMLButtonElement>) => void;
}

const aspectClass: Record<GeneratedImageAspect, string> = {
  square: styles.aspectSquare,
  portrait: styles.aspectPortrait,
  landscape: styles.aspectLandscape,
};

export function GeneratedImage({
  src,
  alt = "",
  aspect = "portrait",
  loading = false,
  onDownload,
  className,
  ...rest
}: GeneratedImageProps) {
  const cls = [
    styles.root,
    aspectClass[aspect],
    loading ? styles.loading : src ? styles.hasImage : styles.placeholder,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} {...rest}>
      {loading || !src ? (
        <Spinner variant="lottie-image-gen" size="lg" className={styles.spinner} />
      ) : (
        <img src={src} alt={alt} className={styles.img} />
      )}

      {onDownload && src && !loading ? (
        <Tooltip content="다운로드">
          <button
            type="button"
            className={styles.downloadBtn}
            onClick={onDownload}
            aria-label="이미지 다운로드"
          >
            <PhDownload className={styles.downloadIcon} weight="regular" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
