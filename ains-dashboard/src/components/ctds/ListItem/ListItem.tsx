"use client";

/**
 * ListItem — 앞에 아바타/아이콘이 달린 리스트 한 줄 단위. 피드·알림·인박스·활동 로그를 포괄.
 *
 * anatomy 고정: [leading] [from (body | verb+target+surface)] [meta/trailing] [hoverActions]
 * 자체 chrome(border/padding/bg) 없음 — 리스트 분리는 부모 레이아웃이 담당.
 *
 * 서술 모드 배타:
 *   (A) body            — "회계팀 — 외주비 결재 요청"
 *   (B) verb+target     — "박지훈 · 댓글 남김 · ERP 2.0 사이드바"
 *
 * variant는 default만 바꾼다 (anatomy는 공통):
 *   activity      — 과거 서술. unread false 기본
 *   notification  — 처리 필요. unread true 기본
 *   mention       — 멘션/댓글. unread true 기본
 *   system        — 사람 아닌 서비스 이벤트
 */

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { Slot } from "@radix-ui/react-slot";

import styles from "./ListItem.module.css";

export type ListItemVariant = "activity" | "notification" | "mention" | "system";
export type ListItemLayout = "inline" | "stacked";

type Common = {
  // 왼쪽
  leading?: ReactNode;
  /**
   * 읽음/안읽음 신호.
   * - undefined (default): 중립 톤. 리드/언리드 개념 없는 자리(활동 로그·히스토리).
   * - true: 안 읽음. body/from 강조 + meta primary.
   * - false: 읽음. 전체 톤 한두 단계 다운.
   */
  unread?: boolean;

  // 본문
  from?: ReactNode;
  body?: ReactNode;
  verb?: ReactNode;
  target?: ReactNode;
  surface?: ReactNode;

  // 메타
  meta?: ReactNode;
  trailing?: ReactNode;
  hoverActions?: ReactNode;

  // 레이아웃·상호작용
  variant?: ListItemVariant;
  layout?: ListItemLayout;
  asChild?: boolean;
};

type DivProps = Common &
  Omit<HTMLAttributes<HTMLDivElement>, keyof Common> & {
    href?: undefined;
  };

type AnchorProps = Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & {
    href: string;
  };

export type ListItemProps = DivProps | AnchorProps;

/* unread는 명시적으로 넘긴 경우에만 신호. variant는 default를 강제하지 않는다 — 리드/언리드 개념이 없는 자리에서도 자유롭게 쓰기 위함. */

const ListItem = forwardRef<HTMLElement, ListItemProps>(function ListItem(
  props,
  ref,
) {
  const {
    leading,
    unread,
    from,
    body,
    verb,
    target,
    surface,
    meta,
    trailing,
    hoverActions,
    variant = "activity",
    layout = "inline",
    asChild,
    className,
    ...rest
  } = props as Common & { className?: string } & Record<string, unknown>;

  const isActionMode = verb !== undefined || target !== undefined;
  const isLink = typeof (props as AnchorProps).href === "string";
  const isInteractive = isLink || typeof (props as HTMLAttributes<HTMLElement>).onClick === "function";

  // read-state class — unread 명시적으로 넘겼을 때만 신호. undefined면 중립.
  const readStateClass =
    unread === true ? styles.unread : unread === false ? styles.read : "";

  const rootClass = [
    styles.root,
    styles[variant],
    layout === "stacked" ? styles.stacked : styles.inline,
    readStateClass,
    isInteractive ? styles.interactive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const leadingNode = leading ? (
    <span className={styles.leading} aria-hidden>
      {leading}
    </span>
  ) : null;

  // 본문 — 서술 모드 배타. verb/target이 하나라도 있으면 action 모드.
  // layout=stacked이면 두 줄로 분리: 1줄째 from(+verb+target+surface), 2줄째 body
  const isStacked = layout === "stacked";
  const bodyNode = isActionMode ? (
    isStacked ? (
      <>
        <span className={styles.actionBody}>
          {from && <span className={styles.from}>{from}</span>}
          {verb && <span className={styles.verb}>{verb}</span>}
          {target && <span className={styles.target}>{target}</span>}
          {surface && <span className={styles.surface}>{surface}</span>}
        </span>
        {body && <span className={styles.body}>{body}</span>}
      </>
    ) : (
      <span className={styles.actionBody}>
        {from && <span className={styles.from}>{from}</span>}
        {verb && <span className={styles.verb}>{verb}</span>}
        {target && <span className={styles.target}>{target}</span>}
        {surface && <span className={styles.surface}>{surface}</span>}
      </span>
    )
  ) : isStacked ? (
    <>
      {from && <span className={styles.from}>{from}</span>}
      {body && <span className={styles.body}>{body}</span>}
    </>
  ) : (
    <span className={styles.narrativeBody}>
      {from && <span className={styles.from}>{from}</span>}
      {body && <span className={styles.body}>{body}</span>}
    </span>
  );

  // trailing: 명시 trailing 우선, 없으면 meta
  const trailingNode = trailing !== undefined ? (
    <span className={styles.trailing}>{trailing}</span>
  ) : meta !== undefined ? (
    <span className={styles.meta}>{meta}</span>
  ) : null;

  // hoverActions: 배열이면 간격 유지하며 렌더
  const hoverNode = hoverActions ? (
    <span className={styles.hoverActions}>
      {Children.map(hoverActions, (child) =>
        isValidElement(child) ? child : child,
      )}
    </span>
  ) : null;

  const content = (
    <>
      {leadingNode}
      <span className={styles.content}>{bodyNode}</span>
      {hoverNode}
      {trailingNode}
    </>
  );

  if (asChild) {
    const only = Children.only(rest.children) as ReactElement<HTMLAttributes<HTMLElement>>;
    return cloneElement(only, { className: rootClass, ...rest }, content);
  }

  if (isLink) {
    const { children, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={rootClass}
        {...anchorRest}
        href={(props as AnchorProps).href}
      >
        {content}
      </a>
    );
  }

  const { children, ...divRest } = rest as HTMLAttributes<HTMLDivElement>;
  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={rootClass}
      data-variant={variant}
      {...divRest}
    >
      {content}
    </div>
  );
});

ListItem.displayName = "ListItem";

export { ListItem };

/* ──────────────────────────────────────────────────────
   ListItemLeadingIcon — "배경색 + 아이콘" leading 타입.

   Avatar/Icon 사이에 섞어도 정렬이 흔들리지 않도록 같은 사이즈 트랙(xs/sm/md/lg)에 올림.
   tone 프리셋으로 bg/fg 쌍을 한 번에, 혹은 CSS 변수(--leading-icon-bg / --leading-icon-fg)로
   세밀 조절. 아이콘 자체는 자식으로 받아 Icon/커스텀 노드 모두 허용.
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
  function ListItemLeadingIcon({ size = "sm", tone = "neutral", className, children, ...rest }, ref) {
    const cls = [styles.leadingIcon, styles[size], className ?? ""].filter(Boolean).join(" ");
    return (
      <span ref={ref} aria-hidden {...rest} className={cls} data-tone={tone}>
        {children}
      </span>
    );
  },
);

ListItemLeadingIcon.displayName = "ListItemLeadingIcon";

export { ListItemLeadingIcon };

// Slot export (asChild 패턴 지원이 필요한 경우 상위에서 사용)
export const ListItemSlot = Slot;
