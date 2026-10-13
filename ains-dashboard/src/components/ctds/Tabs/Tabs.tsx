"use client";

import {
  cloneElement,
  createContext,
  forwardRef,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import styles from "./Tabs.module.css";

export type TabsVariant = "underline" | "segmented" | "text";
export type TabsSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

type TabsContextValue = {
  value: string | undefined;
  setValue: (v: string) => void;
  variant: TabsVariant;
  size: TabsSize;
  baseId: string;
  registerTrigger: (value: string, node: HTMLButtonElement | null) => void;
  focusNext: (currentValue: string, dir: 1 | -1) => void;
  focusEdge: (edge: "first" | "last") => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`${component} must be rendered inside <Tabs>`);
  }
  return ctx;
}

/** 트리거 아이콘 렌더 사이즈 — 사이즈가 커질수록 아이콘도 따라 커짐. */
const ICON_SIZE: Record<TabsSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 28,
};

function sizedIcon(node: ReactNode, size: number): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size });
}

// ────────────────────────────────────────────────────────────
// Root
// ────────────────────────────────────────────────────────────

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  variant?: TabsVariant;
  size?: TabsSize;
  /** controlled */
  value?: string;
  /** uncontrolled 초기값 */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
}

const Root = forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      className,
      variant = "underline",
      size = "md",
      value: valueProp,
      defaultValue,
      onValueChange,
      children,
      ...rest
    },
    ref,
  ) => {
    const baseId = useId();
    const [uncontrolled, setUncontrolled] = useState<string | undefined>(defaultValue);
    const isControlled = valueProp !== undefined;
    const value = isControlled ? valueProp : uncontrolled;

    const triggersRef = useRef<Map<string, HTMLButtonElement>>(new Map());

    const registerTrigger = useCallback(
      (v: string, node: HTMLButtonElement | null) => {
        if (node) triggersRef.current.set(v, node);
        else triggersRef.current.delete(v);
      },
      [],
    );

    const setValue = useCallback(
      (v: string) => {
        if (!isControlled) setUncontrolled(v);
        onValueChange?.(v);
      },
      [isControlled, onValueChange],
    );

    const orderedTriggers = useCallback(() => {
      const nodes = Array.from(triggersRef.current.values());
      nodes.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      );
      return nodes;
    }, []);

    const focusNext = useCallback(
      (currentValue: string, dir: 1 | -1) => {
        const enabled = orderedTriggers().filter((n) => !n.disabled);
        if (enabled.length === 0) return;
        const idx = enabled.findIndex((n) => n.dataset.value === currentValue);
        if (idx === -1) return;
        const nextIdx = (idx + dir + enabled.length) % enabled.length;
        enabled[nextIdx].focus();
      },
      [orderedTriggers],
    );

    const focusEdge = useCallback(
      (edge: "first" | "last") => {
        const nodes = orderedTriggers().filter((n) => !n.disabled);
        if (nodes.length === 0) return;
        (edge === "first" ? nodes[0] : nodes[nodes.length - 1]).focus();
      },
      [orderedTriggers],
    );

    const ctx = useMemo<TabsContextValue>(
      () => ({ value, setValue, variant, size, baseId, registerTrigger, focusNext, focusEdge }),
      [value, setValue, variant, size, baseId, registerTrigger, focusNext, focusEdge],
    );

    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");

    return (
      <TabsContext.Provider value={ctx}>
        <div ref={ref} className={rootClass} data-variant={variant} data-size={size} {...rest}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  },
);
Root.displayName = "Tabs";

// ────────────────────────────────────────────────────────────
// List — 슬라이딩 인디케이터/pill이 여기서 렌더됨.
//   underline: 하단 라인이 활성 트리거 위치로 슬라이드
//   segmented: 흰 pill이 활성 트리거 위치로 슬라이드
//   text: 인디케이터 없음
// ────────────────────────────────────────────────────────────

export type TabsListProps = HTMLAttributes<HTMLDivElement>;

const List = forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...rest }, ref) => {
    const { variant, size, value } = useTabsContext("Tabs.List");
    const listRef = useRef<HTMLDivElement | null>(null);
    // "다음 렌더에 transition 끄기" — 마운트/리사이즈 시 순간이동해야 함.
    const [ready, setReady] = useState(false);
    const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        listRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
      },
      [ref],
    );

    // 활성 트리거 위치 측정. layout effect로 paint 전에 값 확정.
    useLayoutEffect(() => {
      if (variant === "text") return;
      const list = listRef.current;
      if (!list) return;
      const active = list.querySelector<HTMLButtonElement>(
        'button[role="tab"][data-state="active"]',
      );
      if (!active) {
        setIndicator(null);
        return;
      }
      const listRect = list.getBoundingClientRect();
      const rect = active.getBoundingClientRect();
      setIndicator({ x: rect.left - listRect.left, w: rect.width });
    }, [variant, value, size]);

    // 초기 위치 배치 후 다음 프레임부터 transition 활성화.
    useEffect(() => {
      if (indicator && !ready) {
        const id = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(id);
      }
    }, [indicator, ready]);

    // 리사이즈/폰트 로드 시 재측정.
    useEffect(() => {
      if (variant === "text") return;
      const list = listRef.current;
      if (!list) return;
      const ro = new ResizeObserver(() => {
        const active = list.querySelector<HTMLButtonElement>(
          'button[role="tab"][data-state="active"]',
        );
        if (!active) return;
        const listRect = list.getBoundingClientRect();
        const rect = active.getBoundingClientRect();
        setIndicator({ x: rect.left - listRect.left, w: rect.width });
      });
      ro.observe(list);
      list.querySelectorAll('button[role="tab"]').forEach((el) => ro.observe(el));
      return () => ro.disconnect();
    }, [variant]);

    const variantClass =
      variant === "segmented"
        ? styles.listSegmented
        : variant === "text"
          ? styles.listText
          : styles.listUnderline;
    const sizeClass = styles[`size_${size}`];
    const cls = [styles.list, variantClass, sizeClass, className ?? ""]
      .filter(Boolean)
      .join(" ");

    const indicatorStyle =
      indicator != null
        ? ({
            "--tab-indicator-x": `${indicator.x}px`,
            "--tab-indicator-w": `${indicator.w}px`,
          } as React.CSSProperties)
        : undefined;

    return (
      <div
        ref={setRefs}
        className={cls}
        role="tablist"
        aria-orientation="horizontal"
        data-ready={ready ? "true" : undefined}
        style={indicatorStyle}
        {...rest}
      >
        {variant !== "text" && indicator != null && (
          <span
            aria-hidden
            className={variant === "segmented" ? styles.pill : styles.underlineBar}
          />
        )}
        {children}
      </div>
    );
  },
);
List.displayName = "Tabs.List";

// ────────────────────────────────────────────────────────────
// Trigger
// ────────────────────────────────────────────────────────────

export interface TabsTriggerProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const Trigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, leadingIcon, trailingIcon, children, onClick, onKeyDown, disabled, ...rest }, ref) => {
    const {
      value: selected,
      setValue,
      variant,
      size,
      baseId,
      registerTrigger,
      focusNext,
      focusEdge,
    } = useTabsContext("Tabs.Trigger");
    const isActive = selected === value;

    const setRef = useCallback(
      (node: HTMLButtonElement | null) => {
        registerTrigger(value, node);
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as { current: HTMLButtonElement | null }).current = node;
      },
      [ref, registerTrigger, value],
    );

    const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          focusNext(value, 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          focusNext(value, -1);
          break;
        case "Home":
          e.preventDefault();
          focusEdge("first");
          break;
        case "End":
          e.preventDefault();
          focusEdge("last");
          break;
      }
    };

    const variantClass =
      variant === "segmented"
        ? styles.triggerSegmented
        : variant === "text"
          ? styles.triggerText
          : styles.triggerUnderline;
    const cls = [styles.trigger, variantClass, className ?? ""].filter(Boolean).join(" ");

    return (
      <button
        ref={setRef}
        type="button"
        role="tab"
        id={`${baseId}-tab-${value}`}
        aria-selected={isActive}
        aria-controls={`${baseId}-panel-${value}`}
        tabIndex={isActive ? 0 : -1}
        data-value={value}
        data-state={isActive ? "active" : "inactive"}
        disabled={disabled}
        className={cls}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) setValue(value);
        }}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {leadingIcon && (
          <span className={styles.icon} aria-hidden>
            {sizedIcon(leadingIcon, ICON_SIZE[size])}
          </span>
        )}
        <span className={styles.label}>{children}</span>
        {trailingIcon && (
          <span className={styles.icon} aria-hidden>
            {sizedIcon(trailingIcon, ICON_SIZE[size])}
          </span>
        )}
      </button>
    );
  },
);
Trigger.displayName = "Tabs.Trigger";

// ────────────────────────────────────────────────────────────
// Panel
// ────────────────────────────────────────────────────────────

export interface TabsPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  /** true면 비활성 패널도 DOM 유지 (탭 전환 시 상태 보존) */
  keepMounted?: boolean;
}

const Panel = forwardRef<HTMLDivElement, TabsPanelProps>(
  ({ className, value, keepMounted, children, ...rest }, ref) => {
    const { value: selected, baseId } = useTabsContext("Tabs.Panel");
    const isActive = selected === value;
    if (!isActive && !keepMounted) return null;
    const cls = [styles.panel, className ?? ""].filter(Boolean).join(" ");
    return (
      <div
        ref={ref}
        role="tabpanel"
        id={`${baseId}-panel-${value}`}
        aria-labelledby={`${baseId}-tab-${value}`}
        hidden={!isActive}
        className={cls}
        tabIndex={0}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
Panel.displayName = "Tabs.Panel";

// ────────────────────────────────────────────────────────────

type TabsCompound = typeof Root & {
  List: typeof List;
  Trigger: typeof Trigger;
  Panel: typeof Panel;
};

const Tabs = Root as TabsCompound;
Tabs.List = List;
Tabs.Trigger = Trigger;
Tabs.Panel = Panel;

export { Tabs };
