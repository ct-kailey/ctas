"use client";

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import styles from "./GalleryItem.module.css";

/**
 * GalleryItem — 갤러리뷰 콘텐츠 카드.
 *
 * layout:
 *   vertical   — media 위, body 아래 (기본). 그리드형 갤러리.
 *   horizontal — media 왼쪽(고정 폭), body 오른쪽. 세로 리스트형.
 *
 * chrome 없음: 투명 bg, 테두리 없음. 썸네일 radius가 유일한 경계.
 * 선택 상태 없음. 선택이 필요하면 ChoiceCard/SelectableCard.
 * 수치 카드가 필요하면 MetricCard.
 */
export type GalleryItemLayout = "vertical" | "horizontal";
export type GalleryItemAspect = "16/9" | "4/3" | "1/1" | "3/4";
export type GalleryItemActionPosition = "footer" | "overlay";
/**
 * hover 피드백 방식.
 * - float: 카드 전체가 translateY(-1px)로 들림 + 썸네일 shadow-sm + hover 틴트. 기본.
 * - tint: 썸네일에 hover 틴트만, 카드 자체는 가만. 밀집 그리드에서 조용한 피드백 원할 때.
 */
export type GalleryItemHover = "float" | "tint";

type Common = {
  /** 썸네일/이미지 슬롯. img·video·커스텀 그래픽 등. 필수. */
  media: ReactNode;
  /** 세로(그리드) vs 가로(리스트) 레이아웃. 기본 vertical. */
  layout?: GalleryItemLayout;
  /** media 비율. 기본 16/9. 세로형이 필요하면 3/4. */
  aspect?: GalleryItemAspect;
  title: ReactNode;
  description?: ReactNode;
  /** 하단 메타 라인. Badge·날짜 텍스트 자유 조합. 색은 자동 muted. */
  meta?: ReactNode;
  /**
   * 액션 슬롯. IconButton 또는 Button(sm, ghost/outline) 전용.
   * actionPosition에 따라 footer(title 우측) 또는 overlay(media 우상단) 배치.
   */
  actions?: ReactNode;
  actionPosition?: GalleryItemActionPosition;
  /** hover 피드백 방식. 기본 float. interactive 아닐 땐 무시. */
  hover?: GalleryItemHover;
  disabled?: boolean;
};

type DivProps = Common &
  Omit<HTMLAttributes<HTMLDivElement>, keyof Common> & {
    href?: undefined;
  };

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & {
    href: string;
  };

export type GalleryItemProps = DivProps | AnchorProps;

const layoutClass: Record<GalleryItemLayout, string> = {
  vertical: styles.vertical,
  horizontal: styles.horizontal,
};

const GalleryItem = forwardRef<HTMLElement, GalleryItemProps>((props, ref) => {
  const {
    className,
    media,
    layout = "vertical",
    aspect = "16/9",
    title,
    description,
    meta,
    actions,
    actionPosition = "footer",
    hover = "float",
    disabled = false,
    ...rest
  } = props as Common & { className?: string } & Record<string, unknown>;

  const isLink = typeof (props as AnchorProps).href === "string" && !disabled;
  const interactive =
    isLink || typeof (props as DivProps).onClick === "function";

  const rootClass = [
    styles.root,
    layoutClass[layout],
    interactive ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const hoverAttr = interactive ? hover : undefined;

  const overlay = actions && actionPosition === "overlay" ? (
    <span className={styles.overlayActions}>{actions}</span>
  ) : null;

  const footerActions = actions && actionPosition === "footer" ? (
    <span className={styles.footerActions}>{actions}</span>
  ) : null;

  const content = (
    <>
      <div className={styles.media} data-aspect={aspect}>
        {media}
        {overlay}
      </div>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div className={styles.titleBlock}>
            <span className={styles.title}>{title}</span>
            {description && (
              <span className={styles.description}>{description}</span>
            )}
          </div>
          {footerActions}
        </div>
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
    </>
  );

  if (isLink) {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={rootClass}
        data-disabled={disabled ? "true" : "false"}
        data-hover={hoverAttr}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        href={(props as AnchorProps).href}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={rootClass}
      data-disabled={disabled ? "true" : "false"}
      data-hover={hoverAttr}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {content}
    </div>
  );
});

GalleryItem.displayName = "GalleryItem";

export { GalleryItem };
