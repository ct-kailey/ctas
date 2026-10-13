"use client";

import type { HTMLAttributes } from "react";
import {
  File as PhFile,
  FileZip as PhFileZip,
  MusicNote as PhMusicNote,
} from "@phosphor-icons/react";
import styles from "./FileIcon.module.css";
import { resolveFileIcon } from "./fileExtMap";

export type FileIconSize = "sm" | "md" | "lg";

export interface FileIconProps extends HTMLAttributes<HTMLSpanElement> {
  /** 확장자 또는 파일명. 'psd' / '.psd' / 'report.psd' 다 허용. */
  ext: string;
  /** 16 / 24 / 32. 기본 md=24. */
  size?: FileIconSize;
}

const sizeClass: Record<FileIconSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

const PHOSPHOR = {
  file: PhFile,
  "file-zip": PhFileZip,
  "music-note": PhMusicNote,
} as const;

export function FileIcon({
  ext,
  size = "md",
  className,
  style,
  ...rest
}: FileIconProps) {
  const spec = resolveFileIcon(ext);

  const root = [styles.root, sizeClass[size], className]
    .filter(Boolean)
    .join(" ");

  if (spec.kind === "brand") {
    return (
      <span
        className={root}
        style={{
          background: spec.bg,
          color: spec.fg,
          ...style,
        }}
        data-kind="brand"
        aria-hidden
        {...rest}
      >
        <span className={styles.label}>{spec.label}</span>
      </span>
    );
  }

  // 제너릭 — L/D pair. CSS 변수로 내보내서 data-mode에 CSS가 반응.
  const Ph = PHOSPHOR[spec.icon];
  const vars = {
    "--fi-bg-light": spec.light.bg,
    "--fi-fg-light": spec.light.fg,
    "--fi-bg-dark": spec.dark.bg,
    "--fi-fg-dark": spec.dark.fg,
  } as React.CSSProperties;

  return (
    <span
      className={`${root} ${styles.generic}`}
      style={{ ...vars, ...style }}
      data-kind="generic"
      aria-hidden
      {...rest}
    >
      <Ph className={styles.glyph} weight="regular" />
    </span>
  );
}
