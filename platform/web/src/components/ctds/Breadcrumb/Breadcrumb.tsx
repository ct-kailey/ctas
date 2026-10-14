"use client";

import {
  Children,
  Fragment,
  cloneElement,
  forwardRef,
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import * as RPopover from "@radix-ui/react-popover";
import { Slot, Slottable } from "@radix-ui/react-slot";

import { Icon, IconAxisProvider, useIconAxis } from "../Icon";
import { MenuItem } from "../MenuItem";
import styles from "./Breadcrumb.module.css";

/** 트리거 내부 아이콘 렌더 사이즈 — Button xs와 동일한 12px. */
const ICON_SIZE = 12;

function sizedIcon(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size: ICON_SIZE });
}

// ────────────────────────────────────────────────────────────
// Root — <nav aria-label="…"> + <ol>. Item 사이에 separator를 자동 삽입.
// ────────────────────────────────────────────────────────────

export interface BreadcrumbProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** 스크린리더용 라벨. 기본 "Breadcrumb". */
  "aria-label"?: string;
  /** 항목 사이 구분자. 기본은 caret-right 아이콘. */
  separator?: ReactNode;
  children: ReactNode;
}

const Root = forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, separator, children, "aria-label": ariaLabel = "Breadcrumb", ...rest }, ref) => {
    const sep = separator ?? <Icon name="caret-right" size={12} />;
    const items = Children.toArray(children).filter(isValidElement);

    return (
      <nav
        ref={ref}
        aria-label={ariaLabel}
        className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        <ol className={styles.list}>
          {items.map((child, i) => (
            <Fragment key={(child as ReactElement).key ?? i}>
              <li className={styles.item}>{child}</li>
              {i < items.length - 1 && (
                <li className={styles.separator} aria-hidden>
                  {sep}
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      </nav>
    );
  },
);
Root.displayName = "Breadcrumb";

// ────────────────────────────────────────────────────────────
// Link — Button xs ghost와 동일한 토큰으로 스타일. asChild로 Next Link 등에 위임 가능.
// ────────────────────────────────────────────────────────────

export interface BreadcrumbLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** 자식 요소로 렌더 (예: Next.js <Link>). */
  asChild?: boolean;
  leftIcon?: ReactNode;
}

const Link = forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ asChild = false, leftIcon, className, children, ...rest }, ref) => {
    const Comp = asChild ? Slot : "a";
    const hasChildren = children !== undefined && children !== null && children !== false;
    // 아이콘 단독 모드 — children 없이 leftIcon만: 원형 hit box + 접근성 라벨은 aria-label에 위임.
    const iconOnly = !hasChildren && leftIcon != null;
    const cls = [styles.link, iconOnly ? styles.linkIconOnly : "", className ?? ""]
      .filter(Boolean)
      .join(" ");
    // asChild일 때 label을 Slottable로 감싸면 Slot이 자식 요소의 children으로 병합.
    return (
      <Comp ref={ref} className={cls} {...rest}>
        {leftIcon && (
          <span className={styles.linkIcon} aria-hidden>
            {sizedIcon(leftIcon)}
          </span>
        )}
        {hasChildren && (
          <Slottable>
            <span className={styles.linkLabel}>{children}</span>
          </Slottable>
        )}
      </Comp>
    );
  },
);
Link.displayName = "Breadcrumb.Link";

// ────────────────────────────────────────────────────────────
// Current — 현재 페이지. 링크 아님. aria-current="page".
// ────────────────────────────────────────────────────────────

export interface BreadcrumbCurrentProps extends HTMLAttributes<HTMLSpanElement> {
  leftIcon?: ReactNode;
}

const Current = forwardRef<HTMLSpanElement, BreadcrumbCurrentProps>(
  ({ className, leftIcon, children, ...rest }, ref) => {
    const hasChildren = children !== undefined && children !== null && children !== false;
    const iconOnly = !hasChildren && leftIcon != null;
    const cls = [styles.current, iconOnly ? styles.linkIconOnly : "", className ?? ""]
      .filter(Boolean)
      .join(" ");
    return (
      <span ref={ref} aria-current="page" className={cls} {...rest}>
        {leftIcon && (
          <span className={styles.linkIcon} aria-hidden>
            {sizedIcon(leftIcon)}
          </span>
        )}
        {hasChildren && <span className={styles.linkLabel}>{children}</span>}
      </span>
    );
  },
);
Current.displayName = "Breadcrumb.Current";

// ────────────────────────────────────────────────────────────
// Shared — Ellipsis·Menu가 공유하는 팝오버 아이템 모델/렌더.
// ────────────────────────────────────────────────────────────

export type BreadcrumbMenuItem = {
  label: ReactNode;
  href?: string;
  onSelect?: () => void;
  leftIcon?: ReactNode;
  disabled?: boolean;
  /** 현재 선택된 항목. 체크 아이콘이 trailingActions에 자동 삽입. */
  active?: boolean;
};

/** 하위 호환 — 기존 Ellipsis.items 타입명. */
export type BreadcrumbEllipsisItem = BreadcrumbMenuItem;

/** Portal 하위에서 IconAxis 재주입 — Radix Portal이 트리 컨텍스트를 끊는다. */
function PopoverMenuContent({
  items,
  sideOffset,
  align = "start",
}: {
  items: BreadcrumbMenuItem[];
  sideOffset: number;
  align?: "start" | "center" | "end";
}) {
  const iconAxis = useIconAxis();
  return (
    <RPopover.Portal>
      <RPopover.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={[styles.popoverContent, "m-float"].join(" ")}
      >
        <IconAxisProvider value={iconAxis}>
          <ul className={styles.popoverList} role="menu">
            {items.map((item, i) => {
              const leading = item.leftIcon
                ? [
                    isValidElement(item.leftIcon) &&
                    (item.leftIcon as ReactElement<{ size?: number | string }>).props.size === undefined
                      ? cloneElement(item.leftIcon as ReactElement<{ size?: number | string }>, {
                          size: 16,
                        })
                      : item.leftIcon,
                  ]
                : undefined;
              const trailing = item.active ? [<Icon key="check" name="check" size={14} />] : undefined;
              const inner = (
                <MenuItem
                  size="sm"
                  disabled={item.disabled}
                  leadingActions={leading}
                  trailingActions={trailing}
                >
                  {item.label}
                </MenuItem>
              );
              return (
                <li key={i} role="none">
                  {item.href ? (
                    <RPopover.Close asChild>
                      <a
                        href={item.href}
                        role="menuitem"
                        aria-current={item.active ? "page" : undefined}
                        className={styles.popoverItemLink}
                        aria-disabled={item.disabled || undefined}
                      >
                        {inner}
                      </a>
                    </RPopover.Close>
                  ) : (
                    <RPopover.Close asChild>
                      <button
                        type="button"
                        role="menuitem"
                        aria-current={item.active ? "page" : undefined}
                        disabled={item.disabled}
                        onClick={() => item.onSelect?.()}
                        className={styles.popoverItemButton}
                      >
                        {inner}
                      </button>
                    </RPopover.Close>
                  )}
                </li>
              );
            })}
          </ul>
        </IconAxisProvider>
      </RPopover.Content>
    </RPopover.Portal>
  );
}

// ────────────────────────────────────────────────────────────
// Ellipsis — 항목이 많을 때 중간 축약. 클릭 시 팝오버로 숨긴 항목 리스트를 연다.
// ────────────────────────────────────────────────────────────

export interface BreadcrumbEllipsisProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> {
  /** 숨긴 항목 리스트. 최소 1개. */
  items: BreadcrumbMenuItem[];
  /** 팝오버 side offset (px). 기본 6. */
  sideOffset?: number;
  /** aria-label. 기본 "Show hidden pages". */
  "aria-label"?: string;
}

const Ellipsis = forwardRef<HTMLButtonElement, BreadcrumbEllipsisProps>(
  (
    {
      className,
      items,
      sideOffset = 6,
      "aria-label": ariaLabel = "Show hidden pages",
      ...rest
    },
    ref,
  ) => {
    return (
      <RPopover.Root>
        <RPopover.Trigger asChild>
          <button
            ref={ref}
            type="button"
            aria-label={ariaLabel}
            className={[styles.ellipsisTrigger, className ?? ""].filter(Boolean).join(" ")}
            {...rest}
          >
            &hellip;
          </button>
        </RPopover.Trigger>
        <PopoverMenuContent items={items} sideOffset={sideOffset} />
      </RPopover.Root>
    );
  },
);
Ellipsis.displayName = "Breadcrumb.Ellipsis";

// ────────────────────────────────────────────────────────────
// Menu — segment 자체가 트리거. ▾ caret으로 형제 전환 UI 노출.
// active=true면 aria-current="page" 유지 (현재 페이지 자리로 쓸 때).
// ────────────────────────────────────────────────────────────

export interface BreadcrumbMenuProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> {
  /** 트리거에 표시할 라벨. 아이콘 단독 모드 지원 안 함 — 메뉴 트리거는 라벨 필수. */
  children: ReactNode;
  /** 라벨 앞 아이콘. */
  leftIcon?: ReactNode;
  /** 메뉴에 넣을 형제/대체 페이지들. */
  items: BreadcrumbMenuItem[];
  /** 현재 페이지 자리에 쓸 때 true. aria-current="page" + fg-strong 톤. */
  active?: boolean;
  /** 팝오버 side offset (px). 기본 6. */
  sideOffset?: number;
}

const Menu = forwardRef<HTMLButtonElement, BreadcrumbMenuProps>(
  ({ className, children, leftIcon, items, active = false, sideOffset = 6, ...rest }, ref) => {
    const cls = [styles.menuTrigger, active ? styles.menuTriggerActive : "", className ?? ""]
      .filter(Boolean)
      .join(" ");
    return (
      <RPopover.Root>
        <RPopover.Trigger asChild>
          <button
            ref={ref}
            type="button"
            aria-current={active ? "page" : undefined}
            aria-haspopup="menu"
            className={cls}
            {...rest}
          >
            {leftIcon && (
              <span className={styles.linkIcon} aria-hidden>
                {sizedIcon(leftIcon)}
              </span>
            )}
            <span className={styles.linkLabel}>{children}</span>
            <span className={styles.menuCaret} aria-hidden>
              <Icon name="caret-down" size={ICON_SIZE} />
            </span>
          </button>
        </RPopover.Trigger>
        <PopoverMenuContent items={items} sideOffset={sideOffset} />
      </RPopover.Root>
    );
  },
);
Menu.displayName = "Breadcrumb.Menu";

// ────────────────────────────────────────────────────────────

type BreadcrumbCompound = typeof Root & {
  Link: typeof Link;
  Current: typeof Current;
  Ellipsis: typeof Ellipsis;
  Menu: typeof Menu;
};

const Breadcrumb = Root as BreadcrumbCompound;
Breadcrumb.Link = Link;
Breadcrumb.Current = Current;
Breadcrumb.Ellipsis = Ellipsis;
Breadcrumb.Menu = Menu;

export { Breadcrumb };
