"use client";

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";

import { Icon } from "../Icon";
import { Shortcut } from "../Shortcut";
import styles from "./MenuItem.module.css";

export type MenuItemSize = "sm" | "md";
export type MenuItemVariant = "default" | "destructive" | "section";
/**
 * active=true일 때의 시각 강조 방식.
 * - fill: 표면 채움(hover 배경 + fg-strong). Notion·Docs 스타일. **기본.**
 * - accent-bar: 배경 투명 + 좌측 primary 세로 바 + fg-strong. Linear·Slack 스타일.
 * Shell 프리셋에 따라 컨테이너 단위로 지정하는 걸 권장.
 */
export type MenuItemActiveStyle = "fill" | "accent-bar";

/**
 * 왼쪽/오른쪽 슬롯에 넣을 수 있는 항목.
 * 그냥 ReactNode를 넣으면 항상 노출.
 * { node, hoverOnly: true }로 감싸면 MenuItem hover/focus 시에만 드러남 (Notion/Linear/VSCode 패턴).
 */
export type MenuItemAction =
  | ReactNode
  | { node: ReactNode; hoverOnly?: boolean; key?: string };

export type MenuItemProps = Omit<HTMLAttributes<HTMLDivElement>, "onClick"> & {
  size?: MenuItemSize;
  variant?: MenuItemVariant;

  /** 왼쪽 슬롯. 아이콘 / IconButton / 배지 등 무엇이든. checked=true면 이 배열 맨 앞에 checkmark 자동 삽입. */
  leadingActions?: MenuItemAction[];
  /** 오른쪽 슬롯. 카운트 / 메타 / ⋯메뉴 / hoverOnly 액션 등. shortcut/hasSubmenu는 이 배열 앞뒤에 자동 삽입. */
  trailingActions?: MenuItemAction[];

  /** 오른쪽 끝 단축키 텍스트 (예: "⌘K"). 내부에서 trailingActions 맨 앞에 자동 삽입. */
  shortcut?: string;
  /**
   * 라벨 아래 보조 설명 한 줄. 지정 시 아이템이 2줄 레이아웃이 되고
   * leading 아이콘은 첫 줄 베이스라인에 맞춰 상단 정렬된다.
   * GPT/Claude/Gemini 선택처럼 모델·옵션에 짧은 특징을 덧붙이는 자리.
   */
  description?: ReactNode;
  /** true면 오른쪽 끝에 caret-right 인디케이터. 내부에서 trailingActions 맨 뒤에 자동 삽입. */
  hasSubmenu?: boolean;

  /** 체크박스/라디오 메뉴의 선택 상태. true면 leadingActions 맨 앞에 checkmark. */
  checked?: boolean;
  /** 현재 라우트/선택 아이템 강조. Sidebar에서 주로 사용. */
  active?: boolean;
  /**
   * active 상태의 시각 강조 방식. 미지정 시 부모 컨테이너의 CSS 변수
   * `--menu-active-style`을 따르고, 그것도 없으면 fill.
   */
  activeStyle?: MenuItemActiveStyle;
  /** 비활성. click 무시 + fg-disabled. */
  disabled?: boolean;
  /** Radix Slot 패턴 — 상위 프리미티브(<Link>, Radix DropdownMenu.Item 등)에 위임. */
  asChild?: boolean;

  /**
   * variant="section"일 때만 유효. true면 caret 붙고 클릭 가능한 접힘 헤더가 됨.
   * open 상태(controlled 또는 defaultOpen)를 결합해 caret 방향/토글이 자동 처리.
   */
  collapsible?: boolean;
  /** variant="section" + collapsible에서 controlled open 상태. */
  open?: boolean;
  /** variant="section" + collapsible에서 uncontrolled 초기 open. 기본 true. */
  defaultOpen?: boolean;
  /** open 변경 콜백. 사용처는 이 값을 받아 자식 항목을 조건부 렌더. */
  onOpenChange?: (open: boolean) => void;

  /**
   * icon-only 정사각 축소 모드. Sidebar 등에서 rail 형태로 접힐 때 사용.
   * - leadingActions의 첫 아이콘만 남기고 나머지 leading·label·trailing 전부 숨김.
   * - 아이콘이 없으면 children 문자열의 첫 글자로 대체 (fallback).
   * - 둘 다 없으면(아이콘 X + 문자열 라벨 X) 축소 무시 — 표시할 근거가 없기 때문.
   * 축소된 root는 정사각형(width = min-height)으로 padding-inline 0.
   */
  collapsed?: boolean;

  /**
   * root click 핸들러. leadingActions/trailingActions 내부 요소에서 발생한 클릭은
   * 자동으로 무시되지 않으므로, 하위 액션은 e.stopPropagation()을 스스로 호출해야 한다.
   * (일반적으로 IconButton onClick 안에서 처리.)
   */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;

  children?: ReactNode;
};

const sizeClass: Record<MenuItemSize, string> = {
  sm: styles.sm,
  md: styles.md,
};

const variantClass: Record<MenuItemVariant, string> = {
  default: styles.default,
  destructive: styles.destructive,
  section: styles.section,
};

const ICON_SIZE: Record<MenuItemSize, number> = {
  sm: 14,
  md: 16,
};

// Submenu caret은 방향 인디케이터라 leading 아이콘보다 한 단계 작게 — 시각 부피가 라벨을 밀지 않도록.
const CARET_SIZE: Record<MenuItemSize, number> = {
  sm: 10,
  md: 12,
};

/* 슬롯 자식에 픽셀 size를 주입하는 건 우리 Icon 컴포넌트에 한정한다.
   Badge·Chip 같은 컴포넌트는 자체 size 토큰("sm"|"md")을 갖고 있어
   숫자를 꽂아 넣으면 그 컴포넌트의 size 매핑을 부수기 때문(클래스 미부착 → 스타일 실종).
   Icon만 화이트리스트로 처리 — 그 외는 원본 그대로 두고 자식 컴포넌트가 스스로 사이즈 결정. */
function sizedIcon(node: ReactNode, size: number): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.type !== Icon) return el;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size });
}

/** 축소 모드에서 leading 자리에 세울 아이콘이 있는지 판별 —
 *  checked면 자동 checkmark가 붙으므로 그것도 유효 아이콘으로 취급. */
function findCollapsedLeading(
  leadingActions: MenuItemAction[],
  checked: boolean,
  iconSize: number,
): ReactNode | null {
  if (checked) return <Icon name="check" size={iconSize} />;
  for (let i = 0; i < leadingActions.length; i++) {
    const { node } = normalizeAction(leadingActions[i], i);
    if (node === null || node === undefined || node === false) continue;
    return node;
  }
  return null;
}

/** children이 순수 문자열/숫자로 환산되면 그 첫 글자를 리턴, 아니면 null.
 *  이모지·서로게이트 페어까지 안전하게 하나의 grapheme으로 자르기 위해 Array.from 사용. */
function firstCharOfChildren(children: ReactNode): string | null {
  let text = "";
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      text += String(child);
    }
  });
  const trimmed = text.trim();
  if (!trimmed) return null;
  return Array.from(trimmed)[0] ?? null;
}

/** MenuItemAction을 { node, hoverOnly } 튜플로 정규화. */
function normalizeAction(
  action: MenuItemAction,
  idx: number,
): { node: ReactNode; hoverOnly: boolean; key: string } {
  if (
    action !== null &&
    typeof action === "object" &&
    !isValidElement(action) &&
    "node" in (action as { node: ReactNode })
  ) {
    const a = action as { node: ReactNode; hoverOnly?: boolean; key?: string };
    return { node: a.node, hoverOnly: !!a.hoverOnly, key: a.key ?? String(idx) };
  }
  return { node: action as ReactNode, hoverOnly: false, key: String(idx) };
}

function renderActionSlot(
  actions: MenuItemAction[],
  iconSize: number,
  slotClass: string,
): ReactNode {
  return actions.map((raw, i) => {
    const { node, hoverOnly, key } = normalizeAction(raw, i);
    if (node === null || node === undefined || node === false) return null;
    return (
      <span
        key={key}
        className={hoverOnly ? `${slotClass} ${styles.hoverOnly}` : slotClass}
      >
        {sizedIcon(node, iconSize)}
      </span>
    );
  });
}

/* Section 헤더 — variant="section" 전용 내부 컴포넌트.
   collapsible=true면 caret 붙고 hover/press 반응 + 토글 콜백. */
type SectionHeaderProps = {
  rootClass: string;
  size: MenuItemSize;
  collapsible: boolean;
  openProp?: boolean;
  defaultOpen: boolean;
  onOpenChange?: (open: boolean) => void;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children?: ReactNode;
  rest: Record<string, unknown>;
};

const SectionHeader = forwardRef<HTMLDivElement, SectionHeaderProps>(
  function SectionHeader(
    {
      rootClass,
      size,
      collapsible,
      openProp,
      defaultOpen,
      onOpenChange,
      onClick,
      children,
      rest,
    },
    ref,
  ) {
    const [openState, setOpenState] = useState(defaultOpen);
    const open = openProp ?? openState;

    if (!collapsible) {
      return (
        <div ref={ref} className={rootClass} role="presentation" {...rest}>
          <span className={styles.label}>{children}</span>
        </div>
      );
    }

    const toggle = (e: React.MouseEvent<HTMLDivElement>) => {
      const next = !open;
      setOpenState(next);
      onOpenChange?.(next);
      onClick?.(e);
    };

    return (
      <div
        ref={ref}
        className={rootClass}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        data-open={open || undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            (e.currentTarget as HTMLElement).click();
          }
        }}
        {...rest}
      >
        <span className={styles.label}>
          {children}
          <Icon
            name="caret-down"
            size={CARET_SIZE[size]}
            data-open={open || undefined}
            className={styles.sectionCaret}
          />
        </span>
      </div>
    );
  },
);

const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
  (
    {
      className,
      size = "md",
      variant = "default",
      leadingActions = [],
      trailingActions = [],
      shortcut,
      description,
      hasSubmenu = false,
      checked = false,
      active = false,
      activeStyle,
      disabled = false,
      asChild = false,
      collapsed = false,
      collapsible = false,
      open: openProp,
      defaultOpen = true,
      onOpenChange,
      onClick,
      children,
      role,
      tabIndex,
      onKeyDown,
      ...rest
    },
    ref,
  ) => {
    /* root를 <div role="menuitem">으로 하는 이유:
       leadingActions/trailingActions에 <button>(IconButton 등)이 들어갈 수 있는데
       nested <button>은 HTML 스펙 위반. div면 자식 인터랙션이 자유롭다.
       대신 키보드 접근을 위해 tabIndex + Enter/Space 핸들러를 직접 세팅. */
    const Comp = asChild ? Slot : "div";
    const iconSize = ICON_SIZE[size];

    /* leading: checked면 맨 앞에 자동 checkmark */
    const leadingComposed: MenuItemAction[] = checked
      ? [{ node: <Icon name="check" size={iconSize} />, key: "__check__" }, ...leadingActions]
      : leadingActions;

    /* trailing: shortcut → [...trailingActions] → submenu caret 순서.
       shortcut prop은 Shortcut 컴포넌트로 렌더 — 사이즈는 MenuItem 사이즈에 짝지음. */
    const trailingComposed: MenuItemAction[] = [
      ...(shortcut ? [{ node: <Shortcut size={size}>{shortcut}</Shortcut>, key: "__shortcut__" }] : []),
      ...trailingActions,
      ...(hasSubmenu ? [{ node: <Icon name="caret-right" size={CARET_SIZE[size]} />, key: "__caret__" }] : []),
    ];

    /* collapsed 결정 —
       icon(있는 첫 leading action) 또는 문자열 라벨의 첫 글자 중 하나라도 있어야
       축소가 성립. 표시할 근거가 없으면 collapsed 요청을 무시(빈 정사각 방지). */
    const collapsedLeadingIcon = collapsed
      ? findCollapsedLeading(leadingActions, checked, iconSize)
      : null;
    const collapsedFallbackChar =
      collapsed && !collapsedLeadingIcon ? firstCharOfChildren(children) : null;
    const effectiveCollapsed =
      collapsed && (collapsedLeadingIcon !== null || collapsedFallbackChar !== null);

    /* collapsed일 땐 leading 하나만 남기고 trailing/label 전부 비움. */
    const finalLeading: MenuItemAction[] = effectiveCollapsed
      ? [
          collapsedLeadingIcon !== null
            ? { node: collapsedLeadingIcon, key: "__collapsed-icon__" }
            : {
                node: (
                  <span aria-hidden="true" className={styles.collapsedChar}>
                    {collapsedFallbackChar}
                  </span>
                ),
                key: "__collapsed-char__",
              },
        ]
      : leadingComposed;
    const finalTrailing: MenuItemAction[] = effectiveCollapsed ? [] : trailingComposed;

    const hasLeading = finalLeading.length > 0;
    const hasTrailing = finalTrailing.length > 0;

    /* description은 collapsed 상태에선 의미 없음 — 아이콘만 남는 자리에 보조 설명은 숨긴다. */
    const hasDescription = !effectiveCollapsed && description != null && description !== false;

    const rootClass = [
      styles.root,
      sizeClass[size],
      variantClass[variant],
      active ? styles.active : "",
      hasLeading ? styles.hasLeading : "",
      hasDescription ? styles.hasDescription : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClick?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented || disabled) return;
      /* Enter/Space로 root 클릭 트리거. 단, 내부 button/link에서 시작된 이벤트는 통과. */
      if ((e.key === "Enter" || e.key === " ") && e.currentTarget === e.target) {
        e.preventDefault();
        (e.currentTarget as HTMLElement).click();
      }
    };

    /* section variant — 그룹 헤더. label만 렌더.
       collapsible=false(기본): 클릭·포커스 불가한 정적 라벨.
       collapsible=true: caret 자동, hover/press 반응, open 상태 토글. */
    if (variant === "section") {
      return (
        <SectionHeader
          ref={ref as React.Ref<HTMLDivElement>}
          rootClass={rootClass}
          size={size}
          collapsible={collapsible}
          openProp={openProp}
          defaultOpen={defaultOpen}
          onOpenChange={onOpenChange}
          onClick={onClick}
          rest={rest}
        >
          {children}
        </SectionHeader>
      );
    }

    return (
      <Comp
        ref={ref}
        className={rootClass}
        role={role ?? "menuitem"}
        tabIndex={tabIndex ?? (disabled ? -1 : 0)}
        aria-disabled={disabled || undefined}
        data-active={active || undefined}
        data-active-style={active && activeStyle ? activeStyle : undefined}
        data-checked={checked || undefined}
        data-disabled={disabled || undefined}
        data-has-submenu={hasSubmenu || undefined}
        data-collapsed={effectiveCollapsed || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {hasLeading && (
          <span className={styles.leading}>
            {renderActionSlot(finalLeading, iconSize, styles.leadingItem)}
          </span>
        )}
        {asChild ? (
          /* collapsed면 사용자의 children(라벨 텍스트)은 접어두고 leading만 남긴다.
             asChild(예: <Link>Home</Link>)에서도 링크는 유지되며 내용만 아이콘으로 대체.
             asChild는 Link 등으로 전체를 감싸는 패턴이라 description은 지원하지 않는다. */
          <Slottable>{effectiveCollapsed ? null : children}</Slottable>
        ) : (
          !effectiveCollapsed &&
          (hasDescription ? (
            <span className={styles.labelStack}>
              <span className={styles.label}>{children}</span>
              <span className={styles.description}>{description}</span>
            </span>
          ) : (
            <span className={styles.label}>{children}</span>
          ))
        )}
        {hasTrailing && (
          <span className={styles.trailing}>
            {renderActionSlot(finalTrailing, iconSize, styles.trailingItem)}
          </span>
        )}
      </Comp>
    );
  },
);

MenuItem.displayName = "MenuItem";

/* MenuSection ─────────────────────────────────────────
   섹션 헤더 + 접힘 가능한 자식 패널을 한 세트로 묶는다.
   <MenuItem variant="section" collapsible>을 직접 쓰던 사용처가 자식 렌더링과
   open 상태를 각자 처리하다 보니 열림/닫힘 애니메이션이 붙을 자리가 없었다.
   이 컴포넌트는 자식 컨테이너에 data-open을 걸어 grid-template-rows 트릭으로
   CSS-only height + fade 트랜지션을 자동 적용한다.

   heading-only(자식 없음)면 애니메이션 슬롯을 만들지 않고 헤더만 렌더 —
   비접힘 정적 라벨로도 사용 가능하도록. */
export type MenuSectionProps = {
  /** 헤더 라벨. 문자열 또는 임의 ReactNode. */
  title: ReactNode;
  size?: MenuItemSize;
  /** 접힘 지원. 기본 true. false면 헤더만 렌더되고 자식은 항상 표시. */
  collapsible?: boolean;
  /** controlled open. */
  open?: boolean;
  /** uncontrolled 초기 open. 기본 true. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 헤더에 붙일 클래스. */
  headerClassName?: string;
  /** 자식 패널에 붙일 클래스. */
  panelClassName?: string;
  children?: ReactNode;
};

function MenuSection({
  title,
  size = "sm",
  collapsible = true,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  headerClassName,
  panelClassName,
  children,
}: MenuSectionProps) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;

  const handleOpenChange = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  const hasChildren = children !== undefined && children !== null && children !== false;
  const showPanel = hasChildren && collapsible;

  return (
    <>
      <MenuItem
        variant="section"
        size={size}
        collapsible={collapsible && hasChildren}
        open={collapsible && hasChildren ? open : undefined}
        defaultOpen={defaultOpen}
        onOpenChange={collapsible && hasChildren ? handleOpenChange : undefined}
        className={headerClassName}
      >
        {title}
      </MenuItem>
      {showPanel ? (
        <div
          className={[styles.sectionPanel, panelClassName ?? ""].filter(Boolean).join(" ")}
          data-open={open || undefined}
          aria-hidden={!open || undefined}
        >
          <div className={styles.sectionPanelInner}>{children}</div>
        </div>
      ) : (
        hasChildren && children
      )}
    </>
  );
}

MenuSection.displayName = "MenuItem.Section";

const MenuItemWithSection = MenuItem as typeof MenuItem & { Section: typeof MenuSection };
MenuItemWithSection.Section = MenuSection;

export { MenuItemWithSection as MenuItem, MenuSection };
