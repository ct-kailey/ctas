"use client";

/**
 * DropdownMenu ─ 버튼 클릭으로 열리는 메뉴.
 * Radix `@radix-ui/react-dropdown-menu` 위에 얇게 얹은 compound 컴포넌트.
 *
 * ContextMenu와의 관계
 * - 시각 표면(.surface) · MenuItem 어댑터 패턴 · Checkbox/Radio 인디케이터 전부 동일.
 * - 차이는 "트리거 방식"뿐: ContextMenu는 우클릭, DropdownMenu는 좌클릭/스페이스/엔터.
 * - 두 컴포넌트의 Content·Item·CheckboxItem·RadioItem·SubTrigger API는 1:1 미러.
 *
 * 소비 표면
 *   <DropdownMenu>
 *     <DropdownMenu.Trigger asChild>
 *       <Button>Open</Button>
 *     </DropdownMenu.Trigger>
 *     <DropdownMenu.Content>
 *       <DropdownMenu.Item onSelect={...}>복사</DropdownMenu.Item>
 *       <DropdownMenu.Separator />
 *       <DropdownMenu.CheckboxItem checked={grid} onCheckedChange={setGrid}>
 *         그리드
 *       </DropdownMenu.CheckboxItem>
 *     </DropdownMenu.Content>
 *   </DropdownMenu>
 */

import * as RDM from "@radix-ui/react-dropdown-menu";
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { Icon, IconAxisProvider, useIconAxis } from "../Icon";
import { MenuItem, type MenuItemAction, type MenuItemSize, type MenuItemVariant } from "../MenuItem";
import styles from "./DropdownMenu.module.css";

/* Size context — Content가 하위 Item 기본 size 지정. 개별 아이템 size가 우선. */
const SizeContext = createContext<MenuItemSize>("md");
function useMenuSize(override?: MenuItemSize): MenuItemSize {
  const ctx = useContext(SizeContext);
  return override ?? ctx;
}

/* Root · Trigger ─────────────────────────────────────────── */

type RootProps = ComponentPropsWithoutRef<typeof RDM.Root>;
const Root = (props: RootProps) => <RDM.Root {...props} />;

type TriggerProps = ComponentPropsWithoutRef<typeof RDM.Trigger>;
const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(function DropdownMenuTrigger(
  props,
  ref,
) {
  return <RDM.Trigger ref={ref} {...props} />;
});

/* Content ─────────────────────────────────────────────────────────── */

export interface ContentProps extends ComponentPropsWithoutRef<typeof RDM.Content> {
  size?: MenuItemSize;
}

const Content = forwardRef<HTMLDivElement, ContentProps>(function DropdownMenuContent(
  { className, size = "md", collisionPadding = 8, sideOffset = 6, children, ...rest },
  ref,
) {
  const iconAxis = useIconAxis();
  return (
    <RDM.Portal>
      <RDM.Content
        ref={ref}
        className={[styles.content, "m-float", className ?? ""].filter(Boolean).join(" ")}
        collisionPadding={collisionPadding}
        sideOffset={sideOffset}
        data-size={size}
        {...rest}
      >
        <IconAxisProvider value={iconAxis}>
          <SizeContext.Provider value={size}>{children}</SizeContext.Provider>
        </IconAxisProvider>
      </RDM.Content>
    </RDM.Portal>
  );
});

/* SubContent ──────────────────────────────────────────────────────── */

export interface SubContentProps extends ComponentPropsWithoutRef<typeof RDM.SubContent> {
  size?: MenuItemSize;
}

const SubContent = forwardRef<HTMLDivElement, SubContentProps>(function DropdownMenuSubContent(
  { className, size, collisionPadding = 8, children, ...rest },
  ref,
) {
  const parentSize = useContext(SizeContext);
  const effective = size ?? parentSize;
  const iconAxis = useIconAxis();
  return (
    <RDM.Portal>
      <RDM.SubContent
        ref={ref}
        className={[styles.content, "m-float", className ?? ""].filter(Boolean).join(" ")}
        collisionPadding={collisionPadding}
        data-size={effective}
        {...rest}
      >
        <IconAxisProvider value={iconAxis}>
          <SizeContext.Provider value={effective}>{children}</SizeContext.Provider>
        </IconAxisProvider>
      </RDM.SubContent>
    </RDM.Portal>
  );
});

/* Label ───────────────────────────────────────────────────────────── */

const Label = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RDM.Label>>(
  function DropdownMenuLabel({ className, children, ...rest }, ref) {
    const size = useMenuSize();
    return (
      <RDM.Label ref={ref} asChild {...rest}>
        <MenuItem variant="section" size={size} className={className}>
          {children}
        </MenuItem>
      </RDM.Label>
    );
  },
);

/* Separator ───────────────────────────────────────────────────────── */

const Separator = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RDM.Separator>>(
  function DropdownMenuSeparator({ className, ...rest }, ref) {
    return (
      <RDM.Separator
        ref={ref}
        className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      />
    );
  },
);

/* Group · RadioGroup · Sub ───────────────────────────────────────── */

const Group = RDM.Group;
const RadioGroup = RDM.RadioGroup;
const Sub = RDM.Sub;

/* Item ───────────────────────────────────────────────────────────── */

type ItemPassthrough = {
  size?: MenuItemSize;
  variant?: MenuItemVariant;
  leadingActions?: MenuItemAction[];
  trailingActions?: MenuItemAction[];
  shortcut?: string;
  description?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
};

export interface ItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RDM.Item>, "asChild" | "children">,
    ItemPassthrough {}

const Item = forwardRef<HTMLDivElement, ItemProps>(function DropdownMenuItem(
  {
    size,
    variant,
    leadingActions,
    trailingActions,
    shortcut,
    description,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const effectiveSize = useMenuSize(size);
  return (
    <RDM.Item asChild disabled={disabled} {...rest}>
      <MenuItem
        ref={ref}
        size={effectiveSize}
        variant={variant}
        leadingActions={leadingActions}
        trailingActions={trailingActions}
        shortcut={shortcut}
        description={description}
        disabled={disabled}
      >
        {children}
      </MenuItem>
    </RDM.Item>
  );
});

/* CheckboxItem ────────────────────────────────────────────────────── */

export interface CheckboxItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RDM.CheckboxItem>, "asChild" | "children">,
    ItemPassthrough {}

const CheckboxItem = forwardRef<HTMLDivElement, CheckboxItemProps>(function DropdownMenuCheckboxItem(
  {
    size,
    variant,
    leadingActions = [],
    trailingActions,
    shortcut,
    description,
    disabled,
    checked,
    onCheckedChange,
    children,
    ...rest
  },
  ref,
) {
  const effectiveSize = useMenuSize(size);
  const indicatorSlot: MenuItemAction = {
    node: (
      <span
        className={styles.checkIndicator}
        data-checked={checked === true ? "true" : undefined}
        aria-hidden
      >
        <Icon name="check" />
      </span>
    ),
    key: "__checkbox__",
  };
  const composedLeading: MenuItemAction[] = [indicatorSlot, ...leadingActions];
  return (
    <RDM.CheckboxItem
      asChild
      disabled={disabled}
      checked={checked}
      onCheckedChange={onCheckedChange}
      {...rest}
    >
      <MenuItem
        ref={ref}
        size={effectiveSize}
        variant={variant}
        leadingActions={composedLeading}
        trailingActions={trailingActions}
        shortcut={shortcut}
        description={description}
        disabled={disabled}
      >
        {children}
      </MenuItem>
    </RDM.CheckboxItem>
  );
});

/* RadioItem ───────────────────────────────────────────────────────── */

export interface RadioItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RDM.RadioItem>, "asChild" | "children">,
    ItemPassthrough {}

const RadioItem = forwardRef<HTMLDivElement, RadioItemProps>(function DropdownMenuRadioItem(
  {
    size,
    variant,
    leadingActions = [],
    trailingActions,
    shortcut,
    description,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const effectiveSize = useMenuSize(size);
  const composedLeading: MenuItemAction[] = [
    { node: <span className={styles.radioIndicator} aria-hidden />, key: "__radio__" },
    ...leadingActions,
  ];
  return (
    <RDM.RadioItem asChild disabled={disabled} {...rest}>
      <MenuItem
        ref={ref}
        size={effectiveSize}
        variant={variant}
        leadingActions={composedLeading}
        trailingActions={trailingActions}
        shortcut={shortcut}
        description={description}
        disabled={disabled}
      >
        {children}
      </MenuItem>
    </RDM.RadioItem>
  );
});

/* SubTrigger ──────────────────────────────────────────────────────── */

export interface SubTriggerProps
  extends Omit<ComponentPropsWithoutRef<typeof RDM.SubTrigger>, "asChild" | "children">,
    Omit<ItemPassthrough, "shortcut"> {}

const SubTrigger = forwardRef<HTMLDivElement, SubTriggerProps>(function DropdownMenuSubTrigger(
  { size, variant, leadingActions, trailingActions, description, disabled, children, ...rest },
  ref,
) {
  const effectiveSize = useMenuSize(size);
  return (
    <RDM.SubTrigger asChild disabled={disabled} {...rest}>
      <MenuItem
        ref={ref}
        size={effectiveSize}
        variant={variant}
        leadingActions={leadingActions}
        trailingActions={trailingActions}
        description={description}
        hasSubmenu
        disabled={disabled}
      >
        {children}
      </MenuItem>
    </RDM.SubTrigger>
  );
});

/* Compound export ─────────────────────────────────────────────────── */

type DropdownMenuComponent = typeof Root & {
  Trigger: typeof Trigger;
  Content: typeof Content;
  Item: typeof Item;
  CheckboxItem: typeof CheckboxItem;
  RadioGroup: typeof RadioGroup;
  RadioItem: typeof RadioItem;
  Separator: typeof Separator;
  Label: typeof Label;
  Group: typeof Group;
  Sub: typeof Sub;
  SubTrigger: typeof SubTrigger;
  SubContent: typeof SubContent;
};

const DropdownMenu = Root as DropdownMenuComponent;
DropdownMenu.Trigger = Trigger;
DropdownMenu.Content = Content;
DropdownMenu.Item = Item;
DropdownMenu.CheckboxItem = CheckboxItem;
DropdownMenu.RadioGroup = RadioGroup;
DropdownMenu.RadioItem = RadioItem;
DropdownMenu.Separator = Separator;
DropdownMenu.Label = Label;
DropdownMenu.Group = Group;
DropdownMenu.Sub = Sub;
DropdownMenu.SubTrigger = SubTrigger;
DropdownMenu.SubContent = SubContent;

export { DropdownMenu };
