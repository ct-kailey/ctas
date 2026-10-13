"use client";

/**
 * Select ─ 단일 값 선택 콤보. Radix Select 위에 얹은 compound 컴포넌트.
 *
 * 구조 원칙
 * - Trigger 시각은 Input과 완전히 동일한 스타일(variant/size/invalid/label/description/warning)을 공유한다.
 *   실제 클래스도 Input.module.css에서 재사용해 시각 규칙이 두 갈래로 갈라지지 않게 한다.
 * - Content/Item 시각은 ContextMenu와 동일한 팝오버 표면과 MenuItem 어댑터 패턴을 그대로 따른다.
 * - 이 파일은 두 계층을 잇는 얇은 어댑터. 신규 시각 규칙 · 로직 · 상태를 여기서 만들지 않는다.
 *
 * 소비 표면
 *   <Select value={v} onValueChange={setV} label="국가" placeholder="선택하세요">
 *     <Select.Item value="kr">한국</Select.Item>
 *     <Select.Item value="us" leadingActions={[<Icon name="flag" />]}>미국</Select.Item>
 *     <Select.Separator />
 *     <Select.Group>
 *       <Select.Label>유럽</Select.Label>
 *       <Select.Item value="de">독일</Select.Item>
 *     </Select.Group>
 *   </Select>
 */

import * as RS from "@radix-ui/react-select";
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { Icon, IconAxisProvider, useIconAxis } from "../Icon";
import inputStyles from "../Input/Input.module.css";
import { MenuItem, type MenuItemAction, type MenuItemSize } from "../MenuItem";
import styles from "./Select.module.css";

export type SelectSize = "sm" | "md" | "lg";
export type SelectVariant = "outline" | "filled" | "line";
/**
 * 가로 폭 정책 — Input의 InputWidth와 동일 규약. 두 컴포넌트를 폼에서 나란히 놓을 때
 * 폭 문법을 하나로 통일해 인지 부담을 줄인다.
 * - "fill"(기본): 부모 폭 채움
 * - "md" | "lg": --input-w-md=280px · --input-w-lg=400px 토큰에 고정
 * - number: 임의 픽셀
 */
export type SelectWidth = "fill" | "md" | "lg" | number;

/* Size context ─────────────────────────────────────────────────────
   Trigger의 size를 Content 하위 Item들이 이어받도록 공유.
   Trigger는 3단(sm/md/lg)이지만 드롭다운 MenuItem은 조밀하게 여는 게 실전에서 자연스러움 —
   lg 트리거만 md 아이템으로 열고, sm/md 트리거는 모두 sm 아이템으로 연다. */
const menuSizeFor: Record<SelectSize, MenuItemSize> = {
  sm: "sm",
  md: "sm",
  lg: "md",
};

const SizeContext = createContext<SelectSize>("md");
function useSelectSize(): SelectSize {
  return useContext(SizeContext);
}

/* Root ────────────────────────────────────────────────────────────
   Radix Select.Root를 그대로 노출. label/description/warning은 하위 Trigger가 알아야 하므로
   FieldContext로 공유한다. */

type FieldContextValue = {
  size: SelectSize;
  variant: SelectVariant;
  invalid: boolean;
  disabled: boolean;
  width: SelectWidth;
  triggerId: string;
  describedBy?: string;
};
const FieldContext = createContext<FieldContextValue | null>(null);

export interface SelectRootProps
  extends Omit<ComponentPropsWithoutRef<typeof RS.Root>, "children"> {
  size?: SelectSize;
  variant?: SelectVariant;
  /** 폼 검증 실패. warning이 있으면 자동으로 true. */
  invalid?: boolean;
  /** 가로 폭. 기본 "fill" (부모 폭 채움). "md"=280px · "lg"=400px · number=px. */
  width?: SelectWidth;
  /** 라벨 텍스트. 있으면 <label>이 위에 렌더링되고 aria로 자동 연결. */
  label?: ReactNode;
  /** 중립 톤의 설명. 트리거 아래 표시. */
  description?: ReactNode;
  /** 경고 메시지. 있으면 invalid로 취급되어 보더가 destructive로 바뀐다. */
  warning?: ReactNode;
  /** 라벨의 htmlFor를 위한 id (Radix Trigger에 부여). */
  id?: string;
  children?: ReactNode;
}

/** width 값을 CSS width 문자열로 변환. Input의 정책과 완전히 동일. */
function resolveWidth(w: SelectWidth): string | undefined {
  if (w === "fill") return undefined;
  if (w === "md") return "var(--input-w-md)";
  if (w === "lg") return "var(--input-w-lg)";
  return `${w}px`;
}

const Root = ({
  size = "md",
  variant = "outline",
  invalid: invalidProp,
  width = "fill",
  disabled = false,
  label,
  description,
  warning,
  id,
  children,
  ...rest
}: SelectRootProps) => {
  const hasWarning = warning != null && warning !== false;
  const invalid = invalidProp ?? hasWarning;

  const autoId = useId();
  const triggerId = id ?? autoId;
  const descriptionId = description != null ? `${triggerId}-desc` : undefined;
  const warningId = hasWarning ? `${triggerId}-warn` : undefined;
  const describedBy =
    [warningId, descriptionId].filter(Boolean).join(" ") || undefined;

  const field: FieldContextValue = {
    size,
    variant,
    invalid,
    disabled,
    width,
    triggerId,
    describedBy,
  };

  const bare = label == null && description == null && !hasWarning;
  const widthValue = resolveWidth(width);

  return (
    <FieldContext.Provider value={field}>
      <SizeContext.Provider value={size}>
        <RS.Root disabled={disabled} {...rest}>
          {bare ? (
            children
          ) : (
            <div
              className={inputStyles.field}
              data-disabled={disabled || undefined}
              /* field 래퍼도 width를 따라야 label · description · warning 라인이 trigger와 정렬된다.
                 width="fill"이면 style 없음 — .field는 block-level flex라 부모 폭을 자동으로 따른다. */
              style={widthValue ? { width: widthValue } : undefined}
            >
              {label != null && (
                <label
                  htmlFor={triggerId}
                  className={[
                    inputStyles.label,
                    size === "sm"
                      ? inputStyles.labelSm
                      : size === "lg"
                      ? inputStyles.labelLg
                      : inputStyles.labelMd,
                  ].join(" ")}
                >
                  {label}
                  {rest.required && (
                    <span aria-hidden className={inputStyles.requiredMark}>
                      *
                    </span>
                  )}
                </label>
              )}

              {children}

              {hasWarning && (
                <p id={warningId} role="alert" className={inputStyles.errorText}>
                  <span className={inputStyles.messageIcon} aria-hidden>
                    <Icon name="warning-circle" size={14} />
                  </span>
                  {warning}
                </p>
              )}

              {description != null && !hasWarning && (
                <p id={descriptionId} className={inputStyles.description}>
                  <span className={inputStyles.messageIcon} aria-hidden>
                    <Icon name="info" size={14} />
                  </span>
                  {description}
                </p>
              )}
            </div>
          )}
        </RS.Root>
      </SizeContext.Provider>
    </FieldContext.Provider>
  );
};

/* Trigger ─────────────────────────────────────────────────────────
   시각을 Input과 완전히 공유. Input.module.css의 root/variant/size 클래스를 그대로 사용하고,
   내부 텍스트/아이콘 슬롯 시각도 재사용한다. Select 전용 잔여(placeholder 색, chevron 회전 등)만
   Select.module.css에서 정의. */

const sizeClass: Record<SelectSize, string> = {
  sm: inputStyles.sizeSm,
  md: inputStyles.sizeMd,
  lg: inputStyles.sizeLg,
};
const variantClass: Record<SelectVariant, string> = {
  outline: inputStyles.outline,
  filled: inputStyles.filled,
  line: inputStyles.line,
};

export interface TriggerProps
  extends Omit<ComponentPropsWithoutRef<typeof RS.Trigger>, "asChild"> {
  /** placeholder는 Value에서 처리하지만, Trigger에서 직접 지정할 수도 있다. */
  placeholder?: ReactNode;
  /** 왼쪽 슬롯 아이콘 (선택된 값 앞). */
  leftIcon?: ReactNode;
}

const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(function SelectTrigger(
  { className, placeholder, leftIcon, children, ...rest },
  ref
) {
  const field = useContext(FieldContext);
  const size: SelectSize = field?.size ?? "md";
  const variant: SelectVariant = field?.variant ?? "outline";
  const invalid = field?.invalid ?? false;
  const disabled = field?.disabled ?? rest.disabled ?? false;
  const width: SelectWidth = field?.width ?? "fill";
  const widthValue = resolveWidth(width);

  const rootClass = [
    inputStyles.root,
    variantClass[variant],
    sizeClass[size],
    width === "fill" ? inputStyles.fill : "",
    styles.trigger,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <RS.Trigger
      ref={ref}
      id={field?.triggerId}
      className={rootClass}
      style={widthValue ? { width: widthValue } : undefined}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-variant={variant}
      aria-invalid={invalid || undefined}
      aria-describedby={field?.describedBy}
      disabled={disabled}
      {...rest}
    >
      {leftIcon && (
        <span className={inputStyles.icon} aria-hidden>
          {leftIcon}
        </span>
      )}
      <span className={styles.value}>
        {children ?? <RS.Value placeholder={placeholder} />}
      </span>
      <RS.Icon asChild>
        <span className={styles.chevron} data-size={size} aria-hidden>
          <Icon name="caret-down" />
        </span>
      </RS.Icon>
    </RS.Trigger>
  );
});

/* Value ─────────────────────────────────────────────────────────── */

const Value = RS.Value;

/* Content ─────────────────────────────────────────────────────────
   ContextMenu.Content와 동일한 팝오버 표면 시각을 공유하되(같은 토큰 조합), Select 전용의
   position/side-offset 규칙이 있어 스타일은 Select.module.css에서 별도 정의. */

export interface ContentProps
  extends Omit<ComponentPropsWithoutRef<typeof RS.Content>, "asChild"> {}

const Content = forwardRef<HTMLDivElement, ContentProps>(function SelectContent(
  {
    className,
    position = "popper",
    sideOffset = 6,
    collisionPadding = 8,
    children,
    ...rest
  },
  ref
) {
  /* Radix Portal이 Content를 document.body로 옮기며 상위 React Provider가 흘러가지 않는다.
     Icon 축을 캡처해 Portal 하위에 재주입 — 내부 Icon과 Item 아이콘까지 축 스왑 반응. */
  const iconAxis = useIconAxis();
  return (
    <RS.Portal>
      <RS.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={[styles.content, "m-float", className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        <IconAxisProvider value={iconAxis}>
          <RS.ScrollUpButton className={styles.scrollButton}>
            <Icon name="caret-up" />
          </RS.ScrollUpButton>
          <RS.Viewport className={styles.viewport}>{children}</RS.Viewport>
          <RS.ScrollDownButton className={styles.scrollButton}>
            <Icon name="caret-down" />
          </RS.ScrollDownButton>
        </IconAxisProvider>
      </RS.Content>
    </RS.Portal>
  );
});

/* Item ─────────────────────────────────────────────────────────────
   MenuItem을 Radix Select.Item에 asChild로 위임. 드롭다운 아이템은 세 형태만 허용:
     1) 텍스트만
     2) leading 이미지·아이콘(국기 등) — leadingActions로 자유롭게
     3) 복수선택 체크박스 — 이건 별도 컴포넌트 몫(단일 Select는 여기 없음)
   선택 표시는 아이템 안에 checkmark를 얹지 않고, 배경 하이라이트로만 나타낸다.
   Radix가 선택된 Item에 data-state="checked"를 부여 → asChild로 MenuItem 루트에
   전파되어 MenuItem.module.css의 .root[data-state="checked"] 규칙이 배경을 그린다. */

export interface ItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RS.Item>, "asChild" | "children"> {
  leadingActions?: MenuItemAction[];
  trailingActions?: MenuItemAction[];
  children?: ReactNode;
}

const Item = forwardRef<HTMLDivElement, ItemProps>(function SelectItem(
  { leadingActions, trailingActions, children, disabled, ...rest },
  ref
) {
  const size = menuSizeFor[useSelectSize()];

  return (
    <RS.Item asChild disabled={disabled} {...rest}>
      <MenuItem
        ref={ref}
        size={size}
        leadingActions={leadingActions}
        trailingActions={trailingActions}
        disabled={disabled}
        /* role은 asChild 병합에서 자식(MenuItem)이 우선 — 명시적으로 "option"을 넘겨
           Radix Select.Item의 role="option"을 이어받게 한다. 이 role은 MenuItem CSS의
           .root[role="option"][data-state="checked"] 규칙이 선택 상태 배경을 그리는
           스코프 셀렉터로도 쓰인다. */
        role="option"
      >
        <RS.ItemText>{children}</RS.ItemText>
      </MenuItem>
    </RS.Item>
  );
});

/* Group · Label · Separator ─────────────────────────────────────── */

const Group = RS.Group;

const Label = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RS.Label>>(
  function SelectLabel({ className, children, ...rest }, ref) {
    const size = menuSizeFor[useSelectSize()];
    return (
      <RS.Label ref={ref} asChild {...rest}>
        <MenuItem variant="section" size={size} className={className}>
          {children}
        </MenuItem>
      </RS.Label>
    );
  }
);

const Separator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RS.Separator>
>(function SelectSeparator({ className, ...rest }, ref) {
  return (
    <RS.Separator
      ref={ref}
      className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});

/* Compound export ────────────────────────────────────────────────── */

type SelectComponent = typeof Root & {
  Trigger: typeof Trigger;
  Value: typeof Value;
  Content: typeof Content;
  Item: typeof Item;
  Group: typeof Group;
  Label: typeof Label;
  Separator: typeof Separator;
};

const Select = Root as SelectComponent;
Select.Trigger = Trigger;
Select.Value = Value;
Select.Content = Content;
Select.Item = Item;
Select.Group = Group;
Select.Label = Label;
Select.Separator = Separator;

export { Select };
