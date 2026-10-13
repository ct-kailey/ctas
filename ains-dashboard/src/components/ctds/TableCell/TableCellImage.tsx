import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import styles from "./TableCell.module.css";

export type TableCellImageProps = HTMLAttributes<HTMLSpanElement> & {
  src?: string;
  alt?: string;
  /** px 단위 정사각 썸네일 크기. 기본 24. 셀 min-height 안쪽에 들어가도록 상위에서 조정. */
  size?: number;
  /** 모양 — square(기본, radius-sm) / rounded(radius-md) / circle. */
  shape?: "square" | "rounded" | "circle";
  /** src 없을 때 또는 로드 실패 폴백 노드. 미지정 시 빈 회색박스(bg-muted). */
  fallback?: ReactNode;
  /** 썸네일 오른쪽 라벨 — 파일명·설명 등. */
  label?: ReactNode;
};

const shapeRadius: Record<NonNullable<TableCellImageProps["shape"]>, string> = {
  square: "var(--radius-sm)",
  rounded: "var(--radius-md)",
  /* circle은 전용 토큰 경유 — Shape soft 축에서 2xl로 캡된다(완전 원 과함 방지). */
  circle: "var(--radius-image-circle)",
};

export const TableCellImage = forwardRef<HTMLSpanElement, TableCellImageProps>(
  function TableCellImage(
    { className, src, alt, size = 24, shape = "square", fallback, label, ...rest },
    ref,
  ) {
    const cls = [styles.base, styles.imageCell, className ?? ""].filter(Boolean).join(" ");
    const thumbStyle = {
      width: size,
      height: size,
      borderRadius: shapeRadius[shape],
    };
    return (
      <span ref={ref} className={cls} {...rest}>
        <span className={styles.image} style={thumbStyle} aria-hidden={!alt || undefined}>
          {src ? (
            <img className={styles.imageImg} src={src} alt={alt ?? ""} />
          ) : (
            fallback
          )}
        </span>
        {label != null && <span className={styles.text}>{label}</span>}
      </span>
    );
  },
);
