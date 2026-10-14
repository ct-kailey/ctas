"use client";

/**
 * CommandPalette ─ ⌘K 스타일 전역 명령 검색 창.
 *
 * 조립
 * - Radix Dialog: 쉘(open/portal/overlay/focus trap/ESC)
 * - cmdk: 검색 입력·결과 리스트·fuzzy 필터·↑↓ 네비게이션·role 매핑
 * - MenuItem: 결과 아이템의 시각 (DropdownMenu·ContextMenu와 동일 어댑터)
 *
 * 소비 표면
 *   <CommandPalette open={open} onOpenChange={setOpen}>
 *     <CommandPalette.Input placeholder="검색..." />
 *     <CommandPalette.List>
 *       <CommandPalette.Empty>결과 없음</CommandPalette.Empty>
 *       <CommandPalette.Group heading="페이지">
 *         <CommandPalette.Item onSelect={...} leadingIcon="house">대시보드</CommandPalette.Item>
 *       </CommandPalette.Group>
 *     </CommandPalette.List>
 *   </CommandPalette>
 *
 * Modal과 다른 점
 * - 위치: 상단 쪽(top 20vh). 리스트가 아래로 자라야 하므로.
 * - dismiss: 바깥 클릭 허용. 가벼운 상호작용.
 * - 포커스: 열리면 Input 자동 포커스 → ↑↓로 리스트 네비.
 */

import * as RadixDialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { Icon, IconAxisProvider, useIconAxis, type IconName } from "../Icon";
import { MenuItem, type MenuItemAction, type MenuItemSize } from "../MenuItem";
import styles from "./CommandPalette.module.css";

/* Size context — Content가 Item 기본 size 결정. 메뉴들과 동일 패턴. */
const SizeContext = createContext<MenuItemSize>("md");

/* Root ─────────────────────────────────────────────────────────── */

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 리스트 아이템 밀도. 기본 md. */
  size?: MenuItemSize;
  /** 스크린리더 라벨. 시각적으로 숨겨진 다이얼로그 타이틀. */
  label?: string;
  children?: ReactNode;
}

const Root = forwardRef<HTMLDivElement, CommandPaletteProps>(function CommandPalette(
  { open, onOpenChange, size = "md", label = "명령 검색", children },
  ref,
) {
  const iconAxis = useIconAxis();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          ref={ref}
          className={styles.content}
          aria-label={label}
        >
          <RadixDialog.Title className="visually-hidden">{label}</RadixDialog.Title>
          <IconAxisProvider value={iconAxis}>
            <SizeContext.Provider value={size}>
              <Command className={styles.command} label={label}>
                {children}
              </Command>
            </SizeContext.Provider>
          </IconAxisProvider>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
});

/* Input ────────────────────────────────────────────────────────── */

export interface InputProps
  extends Omit<ComponentPropsWithoutRef<typeof Command.Input>, "ref"> {
  /** 좌측 아이콘. 기본 search. null이면 숨김. */
  leadingIcon?: IconName | null;
}

const InputCmd = forwardRef<HTMLInputElement, InputProps>(function CommandPaletteInput(
  { className, leadingIcon = "search", placeholder = "검색...", ...rest },
  ref,
) {
  return (
    <div className={styles.inputRow}>
      {leadingIcon && (
        <span className={styles.inputIcon} aria-hidden>
          <Icon name={leadingIcon} />
        </span>
      )}
      <Command.Input
        ref={ref}
        placeholder={placeholder}
        className={[styles.input, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      />
    </div>
  );
});

/* List ─────────────────────────────────────────────────────────── */

const List = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Command.List>>(
  function CommandPaletteList({ className, children, ...rest }, ref) {
    return (
      <Command.List
        ref={ref}
        className={[styles.list, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        {children}
      </Command.List>
    );
  },
);

/* Empty ────────────────────────────────────────────────────────── */

const Empty = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Command.Empty>>(
  function CommandPaletteEmpty({ className, children, ...rest }, ref) {
    return (
      <Command.Empty
        ref={ref}
        className={[styles.empty, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        {children ?? "결과가 없어요"}
      </Command.Empty>
    );
  },
);

/* Group ────────────────────────────────────────────────────────── */

export interface GroupProps
  extends Omit<ComponentPropsWithoutRef<typeof Command.Group>, "heading"> {
  heading?: ReactNode;
}

const Group = forwardRef<HTMLDivElement, GroupProps>(function CommandPaletteGroup(
  { className, heading, children, ...rest },
  ref,
) {
  const size = useContext(SizeContext);
  return (
    <Command.Group
      ref={ref}
      className={[styles.group, className ?? ""].filter(Boolean).join(" ")}
      heading={
        heading ? (
          <MenuItem variant="section" size={size} className={styles.groupHeading}>
            {heading}
          </MenuItem>
        ) : undefined
      }
      {...rest}
    >
      {children}
    </Command.Group>
  );
});

/* Separator ────────────────────────────────────────────────────── */

const Separator = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Command.Separator>>(
  function CommandPaletteSeparator({ className, ...rest }, ref) {
    return (
      <Command.Separator
        ref={ref}
        className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      />
    );
  },
);

/* Item ─────────────────────────────────────────────────────────── */

export interface ItemProps
  extends Omit<ComponentPropsWithoutRef<typeof Command.Item>, "children"> {
  /** 좌측 아이콘 이름. leading 슬롯 간결 사용. */
  leadingIcon?: IconName;
  /** 커스텀 좌측 노드. leadingIcon보다 우선. */
  leadingActions?: MenuItemAction[];
  /** 우측 메타(배지·숫자 등). */
  trailingActions?: MenuItemAction[];
  /** 오른쪽 끝 단축키 (예: "⌘N"). */
  shortcut?: string;
  /** 라벨 아래 보조 설명 한 줄. */
  description?: ReactNode;
  size?: MenuItemSize;
  children?: ReactNode;
}

const Item = forwardRef<HTMLDivElement, ItemProps>(function CommandPaletteItem(
  {
    leadingIcon,
    leadingActions,
    trailingActions,
    shortcut,
    description,
    size,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const ctxSize = useContext(SizeContext);
  const effectiveSize = size ?? ctxSize;
  const leading: MenuItemAction[] | undefined =
    leadingActions ?? (leadingIcon ? [<Icon key="icon" name={leadingIcon} />] : undefined);
  return (
    <Command.Item disabled={disabled} {...rest} asChild>
      <MenuItem
        ref={ref}
        size={effectiveSize}
        leadingActions={leading}
        trailingActions={trailingActions}
        shortcut={shortcut}
        description={description}
        disabled={disabled}
      >
        {children}
      </MenuItem>
    </Command.Item>
  );
});

/* Compound export ──────────────────────────────────────────────── */

type CommandPaletteComponent = typeof Root & {
  Input: typeof InputCmd;
  List: typeof List;
  Empty: typeof Empty;
  Group: typeof Group;
  Separator: typeof Separator;
  Item: typeof Item;
};

const CommandPalette = Root as CommandPaletteComponent;
CommandPalette.Input = InputCmd;
CommandPalette.List = List;
CommandPalette.Empty = Empty;
CommandPalette.Group = Group;
CommandPalette.Separator = Separator;
CommandPalette.Item = Item;

export { CommandPalette };
