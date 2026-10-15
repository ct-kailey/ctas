"use client";

/**
 * ListItem — 3구역(leading / content / trailing) 고정 뼈대 + content 내부 자유 조립.
 *
 * 축:
 *   size       — 세로 여백감. md(기본, 작업/자원 리스트 밀도) | sm (활동 로그·알림 스트림 타이트)
 *   align      — leading 세로 정렬. center(기본) | top (2줄 이상 본문용)
 *   interactive — hover/focus 피드백 (href 또는 onClick 있을 때 자동)
 *
 * chrome 없음 — bg·border·radius 자체 공급 X. 리스트 분리는 부모가 담당.
 * 블록 외형(배경·테두리로 상태 신호)이 필요하면 Callout 사용.
 *
 * content 안에서 쓰는 subcomponents:
 *   ListItem.Title        메인 제목 (앞에 Badge 등 inline 자유)
 *   ListItem.Description  muted 서브 텍스트
 *   ListItem.Meta         하단 meta 라인 (타임스탬프·상태)
 *   ListItem.MetaDivider  hairline 세로 구분자
 *
 * 일정·이벤트처럼 날짜가 leading 아이덴티티인 자리는 [[EventListItem]] 사용.
 */

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import styles from "./ListItem.module.css";

export type ListItemSize = "sm" | "md";
export type ListItemAlign = "center" | "top";

type Common = {
  leading?: ReactNode;
  trailing?: ReactNode;
  size?: ListItemSize;
  align?: ListItemAlign;
  children?: ReactNode;
};

type DivProps = Common &
  Omit<HTMLAttributes<HTMLDivElement>, keyof Common> & { href?: undefined };

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & { href: string };

export type ListItemProps = DivProps | AnchorProps;

const ListItemRoot = forwardRef<HTMLElement, ListItemProps>(function ListItem(
  props,
  ref,
) {
  const {
    leading,
    trailing,
    size = "md",
    align = "center",
    className,
    children,
    ...rest
  } = props as Common & { className?: string } & Record<string, unknown>;

  const isLink = typeof (props as AnchorProps).href === "string";
  const isInteractive =
    isLink || typeof (props as HTMLAttributes<HTMLElement>).onClick === "function";

  const rootClass = [
    styles.root,
    styles[`size-${size}`],
    styles[`align-${align}`],
    isInteractive ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {leading !== undefined && leading !== null && (
        <span className={styles.leading} aria-hidden>
          {leading}
        </span>
      )}
      <span className={styles.content}>{children}</span>
      {trailing !== undefined && trailing !== null && (
        <span className={styles.trailing}>{trailing}</span>
      )}
    </>
  );

  if (isLink) {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={rootClass}
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
      data-size={size}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {content}
    </div>
  );
});

ListItemRoot.displayName = "ListItem";

/* ──────────────────────────────────────────────────────
   content subcomponents
   ──────────────────────────────────────────────────── */

type SpanProps = HTMLAttributes<HTMLSpanElement>;
type DivOnlyProps = HTMLAttributes<HTMLDivElement>;

const Title = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function ListItemTitle({ className, children, ...rest }, ref) {
    return (
      <div
        ref={ref as unknown as Ref<HTMLHeadingElement>}
        className={[styles.title, className ?? ""].filter(Boolean).join(" ")}
        {...(rest as HTMLAttributes<HTMLDivElement>)}
      >
        {children}
      </div>
    );
  },
);
Title.displayName = "ListItem.Title";

const Description = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function ListItemDescription({ className, children, ...rest }, ref) {
    return (
      <p
        ref={ref}
        className={[styles.description, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        {children}
      </p>
    );
  },
);
Description.displayName = "ListItem.Description";

const Meta = forwardRef<HTMLDivElement, DivOnlyProps>(function ListItemMeta(
  { className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={[styles.meta, className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
});
Meta.displayName = "ListItem.Meta";

const MetaDivider = forwardRef<HTMLSpanElement, SpanProps>(function ListItemMetaDivider(
  { className, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      aria-hidden
      className={[styles.metaDivider, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});
MetaDivider.displayName = "ListItem.MetaDivider";

/* ──────────────────────────────────────────────────────
   LeadingIcon — "배경색 + 아이콘" leading 타입. 기존 유지.
   ──────────────────────────────────────────────────── */

export type ListItemLeadingIconSize = "xs" | "sm" | "md" | "lg" | "auto";
export type ListItemLeadingIconTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type ListItemLeadingIconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  size?: ListItemLeadingIconSize;
  tone?: ListItemLeadingIconTone;
  children: ReactNode;
};

const ListItemLeadingIcon = forwardRef<HTMLSpanElement, ListItemLeadingIconProps>(
  function ListItemLeadingIcon(
    { size = "sm", tone = "neutral", className, children, ...rest },
    ref,
  ) {
    const cls = [styles.leadingIcon, styles[`li-${size}`], className ?? ""]
      .filter(Boolean)
      .join(" ");
    return (
      <span ref={ref} aria-hidden {...rest} className={cls} data-tone={tone}>
        {children}
      </span>
    );
  },
);
ListItemLeadingIcon.displayName = "ListItemLeadingIcon";

/* ──────────────────────────────────────────────────────
   compound export
   ──────────────────────────────────────────────────── */

type ListItemCompound = typeof ListItemRoot & {
  Title: typeof Title;
  Description: typeof Description;
  Meta: typeof Meta;
  MetaDivider: typeof MetaDivider;
};

const ListItem = ListItemRoot as ListItemCompound;
ListItem.Title = Title;
ListItem.Description = Description;
ListItem.Meta = Meta;
ListItem.MetaDivider = MetaDivider;

export { ListItem, ListItemLeadingIcon };
