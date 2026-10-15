"use client";

/**
 * Kanban — 가로 트랙(Board) + 컬럼(Column) + 카드(Card)의 3-레벨 compound.
 *
 * 레벨별 축:
 *   Kanban (board)
 *     columnWidth  — 컬럼 1장 width. 기본 var(--kanban-column-width) = 320px
 *     gap          — 컬럼 사이 가로 간격. 기본 space-3
 *     scroll       — 가로 스크롤 on/off. 기본 true. false면 flex-wrap으로 반응형.
 *
 *   Kanban.Column
 *     chrome       — line (border) | filled (bg-muted) | plain (chrome 없음)
 *     accent       — none | dot | bar. 상태 색 신호 위치.
 *     tone         — neutral | primary | success | warning | danger | info
 * *     layout       — stack (기본) | wrap
 *                    · stack(권장): header만 자체 chrome을 가지고 카드 스택은
 *                      chrome 없이 그 아래 자유롭게 쌓이는 "얹어진" 형태.
 *                    · wrap(비권장): header와 카드가 한 쉘 안에 함께 들어있는
 *                      "감싸는" 형태. 전통적 칸반이지만 카드가 그릇에 갇혀 답답함.
 *
 *   Kanban.Card
 *     content은 Card.Cover · Card.Header · Card.Title · Card.Description
 *                  · Card.Meta · Card.Footer slot으로 자유 조립.
 *     interactive  — href/onClick 자동 hover (ListItem과 동일)
 *
 * DnD는 호출부가 바깥에서 dnd-kit로 감싸는 opt-in. 시각 먼저, 상호작용은 선택.
 */

import {
  forwardRef,
  type AnchorHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import styles from "./Kanban.module.css";

/* ──────────────────────────────────────────────────────
   Kanban (board)
   ──────────────────────────────────────────────────── */

export type KanbanProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  /** 컬럼 1장 width. CSS 길이 문자열(e.g. "280px", "320px"). */
  columnWidth?: string;
  /** 컬럼 사이 가로 간격. CSS 길이. 기본 var(--space-3). */
  gap?: string;
  /** 가로 스크롤. 기본 true. false면 flex-wrap으로 반응형. */
  scroll?: boolean;
  children?: ReactNode;
};

const KanbanRoot = forwardRef<HTMLDivElement, KanbanProps>(function Kanban(
  { columnWidth, gap, scroll = true, className, style, children, ...rest },
  ref,
) {
  const rootClass = [
    styles.board,
    scroll ? styles.scroll : styles.noscroll,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const cssVars: Record<string, string> = {};
  if (columnWidth) cssVars["--kanban-column-width"] = columnWidth;
  if (gap) cssVars["--kanban-column-gap"] = gap;

  return (
    <div
      ref={ref}
      className={rootClass}
      style={{ ...cssVars, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
});
KanbanRoot.displayName = "Kanban";

/* ──────────────────────────────────────────────────────
   Column
   ──────────────────────────────────────────────────── */

export type KanbanColumnChrome = "line" | "filled" | "plain";
export type KanbanColumnAccent = "none" | "dot";
export type KanbanColumnTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";
export type KanbanColumnLayout = "wrap" | "stack";

export type KanbanColumnProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  count?: number | string;
  action?: ReactNode;
  footer?: ReactNode;
  chrome?: KanbanColumnChrome;
  accent?: KanbanColumnAccent;
  tone?: KanbanColumnTone;
  layout?: KanbanColumnLayout;
  children?: ReactNode;
};

const Column = forwardRef<HTMLElement, KanbanColumnProps>(function KanbanColumn(
  {
    title,
    count,
    action,
    footer,
    chrome = "line",
    accent = "none",
    tone = "neutral",
    layout = "stack",
    className,
    children,
    ...rest
  },
  ref,
) {
  const cls = [
    styles.column,
    styles[`layout-${layout}`],
    styles[`chrome-${chrome}`],
    styles[`accent-${accent}`],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const showHeader =
    title !== undefined ||
    count !== undefined ||
    accent !== "none" ||
    action !== undefined;

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cls}
      data-tone={tone}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {showHeader && (
        <div className={styles.columnHeader}>
          {accent !== "none" && (
            <span className={styles.accentMark} aria-hidden data-accent={accent} />
          )}
          {title !== undefined && (
            <span className={styles.columnTitle}>{title}</span>
          )}
          {count !== undefined && (
            <span className={styles.columnCount}>{count}</span>
          )}
          {action !== undefined && (
            <span className={styles.columnAction}>{action}</span>
          )}
        </div>
      )}
      <div className={styles.columnBody}>{children}</div>
      {footer !== undefined && (
        <div className={styles.columnFooter}>{footer}</div>
      )}
    </div>
  );
});
Column.displayName = "Kanban.Column";

/* ──────────────────────────────────────────────────────
   Card
   ──────────────────────────────────────────────────── */

type CardCommon = {
  children?: ReactNode;
};

type CardDivProps = CardCommon &
  Omit<HTMLAttributes<HTMLDivElement>, keyof CardCommon> & { href?: undefined };

type CardAnchorProps = CardCommon &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CardCommon> & {
    href: string;
  };

export type KanbanCardProps = CardDivProps | CardAnchorProps;

const Card = forwardRef<HTMLElement, KanbanCardProps>(function KanbanCard(
  props,
  ref,
) {
  const {
    className,
    children,
    ...rest
  } = props as CardCommon & { className?: string } & Record<string, unknown>;

  const isLink = typeof (props as CardAnchorProps).href === "string";
  const isInteractive =
    isLink ||
    typeof (props as HTMLAttributes<HTMLElement>).onClick === "function";

  const cls = [
    styles.card,
    isInteractive ? styles.cardInteractive : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isLink) {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={cls}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        href={(props as CardAnchorProps).href}
      >
        {children}
      </a>
    );
  }

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={cls}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </div>
  );
});
Card.displayName = "Kanban.Card";

/* ── Card slots ─────────────────────────────────────── */

type DivProps = HTMLAttributes<HTMLDivElement>;

const CardCover = forwardRef<HTMLDivElement, DivProps>(function KanbanCardCover(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[styles.cover, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
CardCover.displayName = "Kanban.Card.Cover";

const CardHeader = forwardRef<HTMLDivElement, DivProps>(function KanbanCardHeader(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[styles.cardHeader, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
CardHeader.displayName = "Kanban.Card.Header";

const CardTitle = forwardRef<HTMLDivElement, DivProps>(function KanbanCardTitle(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[styles.cardTitle, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
CardTitle.displayName = "Kanban.Card.Title";

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function KanbanCardDescription({ className, children, ...rest }, ref) {
    return (
      <p
        ref={ref}
        className={[styles.cardDescription, className ?? ""]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {children}
      </p>
    );
  },
);
CardDescription.displayName = "Kanban.Card.Description";

const CardMeta = forwardRef<HTMLDivElement, DivProps>(function KanbanCardMeta(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[styles.cardMeta, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
CardMeta.displayName = "Kanban.Card.Meta";

const CardFooter = forwardRef<HTMLDivElement, DivProps>(function KanbanCardFooter(
  { className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[styles.cardFooter, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
CardFooter.displayName = "Kanban.Card.Footer";

/* ──────────────────────────────────────────────────────
   compound export
   ──────────────────────────────────────────────────── */

type CardCompound = typeof Card & {
  Cover: typeof CardCover;
  Header: typeof CardHeader;
  Title: typeof CardTitle;
  Description: typeof CardDescription;
  Meta: typeof CardMeta;
  Footer: typeof CardFooter;
};

const KanbanCard = Card as CardCompound;
KanbanCard.Cover = CardCover;
KanbanCard.Header = CardHeader;
KanbanCard.Title = CardTitle;
KanbanCard.Description = CardDescription;
KanbanCard.Meta = CardMeta;
KanbanCard.Footer = CardFooter;

type KanbanCompound = typeof KanbanRoot & {
  Column: typeof Column;
  Card: typeof KanbanCard;
};

const Kanban = KanbanRoot as KanbanCompound;
Kanban.Column = Column;
Kanban.Card = KanbanCard;

export { Kanban };
