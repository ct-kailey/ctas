"use client";

/**
 * ContextMenu ─ 우클릭/롱프레스로 열리는 컨텍스트 메뉴.
 * Radix `@radix-ui/react-context-menu` 위에 얇게 얹은 compound 컴포넌트.
 *
 * 구조 원칙
 * - 열림/닫힘·포커스 트랩·화살표 네비·서브메뉴 안전지연·뷰포트 flip은 Radix가 담당.
 * - 시각·슬롯·상태(active/checked/destructive/hoverOnly)는 MenuItem이 담당.
 * - 이 파일은 두 계층을 잇는 얇은 어댑터. 신규 시각 규칙 · 로직 · 상태를 여기서 만들지 않는다.
 *
 * 소비 표면
 *   <ContextMenu>
 *     <ContextMenu.Trigger>...</ContextMenu.Trigger>
 *     <ContextMenu.Content>
 *       <ContextMenu.Label>제목</ContextMenu.Label>
 *       <ContextMenu.Item leadingActions={[<Icon.../>]} shortcut="⌘C" onSelect={...}>
 *         복사
 *       </ContextMenu.Item>
 *       <ContextMenu.Separator />
 *       <ContextMenu.CheckboxItem checked={grid} onCheckedChange={setGrid}>
 *         그리드 표시
 *       </ContextMenu.CheckboxItem>
 *       <ContextMenu.RadioGroup value={view} onValueChange={setView}>
 *         <ContextMenu.RadioItem value="list">리스트</ContextMenu.RadioItem>
 *         <ContextMenu.RadioItem value="grid">그리드</ContextMenu.RadioItem>
 *       </ContextMenu.RadioGroup>
 *       <ContextMenu.Sub>
 *         <ContextMenu.SubTrigger>공유</ContextMenu.SubTrigger>
 *         <ContextMenu.SubContent>...</ContextMenu.SubContent>
 *       </ContextMenu.Sub>
 *       <ContextMenu.Item variant="destructive" onSelect={...}>삭제</ContextMenu.Item>
 *     </ContextMenu.Content>
 *   </ContextMenu>
 */

import * as RCM from "@radix-ui/react-context-menu";
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { Icon, IconAxisProvider, useIconAxis } from "../Icon";
import { MenuItem, type MenuItemAction, type MenuItemSize, type MenuItemVariant } from "../MenuItem";
import styles from "./ContextMenu.module.css";

/* Size context ─────────────────────────────────────────────────────
   Content/SubContent가 하위 Item·CheckboxItem·RadioItem·SubTrigger의 기본 size를 지정.
   개별 아이템의 size prop이 있으면 그 값이 우선.
   페이지에서 컨테이너 한 번만 size를 지정하면 모든 자식이 따라오도록. */
const SizeContext = createContext<MenuItemSize>("md");
function useMenuSize(override?: MenuItemSize): MenuItemSize {
  const ctx = useContext(SizeContext);
  return override ?? ctx;
}

/* Root · Trigger · Portal ─────────────────────────────────────────── */

type RootProps = ComponentPropsWithoutRef<typeof RCM.Root>;
const Root = (props: RootProps) => <RCM.Root {...props} />;

type TriggerProps = ComponentPropsWithoutRef<typeof RCM.Trigger>;
const Trigger = forwardRef<HTMLSpanElement, TriggerProps>(function ContextMenuTrigger(props, ref) {
  return <RCM.Trigger ref={ref} {...props} />;
});

/* Content ─────────────────────────────────────────────────────────── */

export interface ContentProps extends ComponentPropsWithoutRef<typeof RCM.Content> {
  /**
   * Content 안의 모든 Item · CheckboxItem · RadioItem · SubTrigger 기본 size.
   * 개별 아이템에서 size를 지정하면 그 값이 우선.
   */
  size?: MenuItemSize;
}

const Content = forwardRef<HTMLDivElement, ContentProps>(function ContextMenuContent(
  { className, size = "md", collisionPadding = 8, children, ...rest },
  ref,
) {
  /* Radix Portal이 Content를 document.body로 옮기며 React 트리 부모의 Provider가
     흘러가지 않는다. 상위 트리의 Icon 축 값을 캡처해 Portal 하위에 재주입. */
  const iconAxis = useIconAxis();
  return (
    <RCM.Portal>
      <RCM.Content
        ref={ref}
        className={[styles.content, "m-float", className ?? ""].filter(Boolean).join(" ")}
        collisionPadding={collisionPadding}
        data-size={size}
        {...rest}
      >
        <IconAxisProvider value={iconAxis}>
          <SizeContext.Provider value={size}>{children}</SizeContext.Provider>
        </IconAxisProvider>
      </RCM.Content>
    </RCM.Portal>
  );
});

/* SubContent ──────────────────────────────────────────────────────── */

export interface SubContentProps extends ComponentPropsWithoutRef<typeof RCM.SubContent> {
  size?: MenuItemSize;
}

const SubContent = forwardRef<HTMLDivElement, SubContentProps>(function ContextMenuSubContent(
  { className, size, collisionPadding = 8, children, ...rest },
  ref,
) {
  /* SubContent는 별도 지정이 없으면 부모 Content의 size를 그대로 이어받는다.
     서브메뉴만 다른 사이즈를 쓰는 일이 없어 자연스러운 기본. */
  const parentSize = useContext(SizeContext);
  const effective = size ?? parentSize;
  const iconAxis = useIconAxis();
  return (
    <RCM.Portal>
      <RCM.SubContent
        ref={ref}
        className={[styles.content, "m-float", className ?? ""].filter(Boolean).join(" ")}
        collisionPadding={collisionPadding}
        data-size={effective}
        {...rest}
      >
        <IconAxisProvider value={iconAxis}>
          <SizeContext.Provider value={effective}>{children}</SizeContext.Provider>
        </IconAxisProvider>
      </RCM.SubContent>
    </RCM.Portal>
  );
});

/* Label ───────────────────────────────────────────────────────────── */

const Label = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RCM.Label>>(
  function ContextMenuLabel({ className, children, ...rest }, ref) {
    const size = useMenuSize();
    /* MenuItem variant="section"을 감싸서 사이드바 그룹 헤더와 시각 통일.
       Radix Label의 접근성/select 방지는 유지. */
    return (
      <RCM.Label ref={ref} asChild {...rest}>
        <MenuItem variant="section" size={size} className={className}>
          {children}
        </MenuItem>
      </RCM.Label>
    );
  },
);

/* Separator ───────────────────────────────────────────────────────── */

const Separator = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RCM.Separator>>(
  function ContextMenuSeparator({ className, ...rest }, ref) {
    return (
      <RCM.Separator
        ref={ref}
        className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      />
    );
  },
);

/* Group · RadioGroup · Sub ───────────────────────────────────────── */

const Group = RCM.Group;
const RadioGroup = RCM.RadioGroup;
const Sub = RCM.Sub;

/* Item ─────────────────────────────────────────────────────────────
   MenuItem을 Radix ContextMenu.Item에 asChild로 위임한다.
   - Radix가 [data-highlighted]/[data-disabled]를 부여 → MenuItem CSS가 그대로 반응.
   - onSelect(Radix)를 노출: 선택 후 자동 닫힘 + 이벤트 preventDefault로 열림 유지 가능. */

type ItemPassthrough = {
  size?: MenuItemSize;
  variant?: MenuItemVariant;
  leadingActions?: MenuItemAction[];
  trailingActions?: MenuItemAction[];
  shortcut?: string;
  /** 라벨 아래 보조 설명 한 줄. MenuItem.description으로 그대로 전달. */
  description?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
};

export interface ItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RCM.Item>, "asChild" | "children">,
    ItemPassthrough {}

const Item = forwardRef<HTMLDivElement, ItemProps>(function ContextMenuItem(
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
    <RCM.Item asChild disabled={disabled} {...rest}>
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
    </RCM.Item>
  );
});

/* CheckboxItem ────────────────────────────────────────────────────── */

export interface CheckboxItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RCM.CheckboxItem>, "asChild" | "children">,
    ItemPassthrough {}

const CheckboxItem = forwardRef<HTMLDivElement, CheckboxItemProps>(function ContextMenuCheckboxItem(
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
  /* leading 맨 앞에 Checkbox 컴포넌트의 시각 인디케이터를 얹는다.
     Radix CheckboxItem이 상태·포커스·키보드를 이미 관리하므로 여기선 시각만 필요 —
     Checkbox 컴포넌트의 <label><input> 접근성 구조는 중첩되면 방해되므로 재사용하지 않고,
     `.indicator` 스타일만 composes로 가져와 span 하나로 재현한다.
     안에 항상 check Icon을 두되, Checkbox CSS의 `color: transparent → var(--bg)`가
     checked일 때만 색을 드러낸다(data-checked). */
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
    <RCM.CheckboxItem
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
    </RCM.CheckboxItem>
  );
});

/* RadioItem ───────────────────────────────────────────────────────── */

export interface RadioItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RCM.RadioItem>, "asChild" | "children">,
    ItemPassthrough {}

const RadioItem = forwardRef<HTMLDivElement, RadioItemProps>(function ContextMenuRadioItem(
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
  /* leading 맨 앞에 Radio 컴포넌트의 시각 인디케이터를 얹는다.
     Radix RadioItem이 상태·포커스·키보드를 이미 관리하므로 여기선 시각만 필요.
     `.indicator` 스타일만 composes로 가져와 span 하나로 재현. checked 여부는
     Radix가 asChild 대상 MenuItem에 붙이는 data-state="checked"를 CSS 컨텍스트
     셀렉터로 잡아 자손 indicator에 전파한다 (module.css 참고). */
  const composedLeading: MenuItemAction[] = [
    { node: <span className={styles.radioIndicator} aria-hidden />, key: "__radio__" },
    ...leadingActions,
  ];
  return (
    <RCM.RadioItem asChild disabled={disabled} {...rest}>
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
    </RCM.RadioItem>
  );
});

/* SubTrigger ──────────────────────────────────────────────────────── */

export interface SubTriggerProps
  extends Omit<ComponentPropsWithoutRef<typeof RCM.SubTrigger>, "asChild" | "children">,
    Omit<ItemPassthrough, "shortcut"> {}

const SubTrigger = forwardRef<HTMLDivElement, SubTriggerProps>(function ContextMenuSubTrigger(
  { size, variant, leadingActions, trailingActions, description, disabled, children, ...rest },
  ref,
) {
  const effectiveSize = useMenuSize(size);
  return (
    <RCM.SubTrigger asChild disabled={disabled} {...rest}>
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
    </RCM.SubTrigger>
  );
});

/* Compound export ─────────────────────────────────────────────────── */

type ContextMenuComponent = typeof Root & {
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

const ContextMenu = Root as ContextMenuComponent;
ContextMenu.Trigger = Trigger;
ContextMenu.Content = Content;
ContextMenu.Item = Item;
ContextMenu.CheckboxItem = CheckboxItem;
ContextMenu.RadioGroup = RadioGroup;
ContextMenu.RadioItem = RadioItem;
ContextMenu.Separator = Separator;
ContextMenu.Label = Label;
ContextMenu.Group = Group;
ContextMenu.Sub = Sub;
ContextMenu.SubTrigger = SubTrigger;
ContextMenu.SubContent = SubContent;

export { ContextMenu };
