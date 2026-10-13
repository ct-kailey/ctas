"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Icon } from "../Icon";
import styles from "./Disclosure.module.css";

/**
 * Disclosure — 토글로 열고 닫는 섹션.
 *
 * grid-template-rows: 0fr → 1fr 트릭으로 자연 높이 측정 없이 CSS만으로 애니메이션.
 * caret 180° 회전, body opacity 페이드 동반.
 *
 * 사용:
 *   <Disclosure defaultOpen>
 *     <Disclosure.Trigger>적용 방법</Disclosure.Trigger>
 *     <Disclosure.Body>...</Disclosure.Body>
 *   </Disclosure>
 */

interface DisclosureCtx {
  open: boolean;
  toggle: () => void;
  bodyId: string;
}

const DisclosureContext = createContext<DisclosureCtx | null>(null);

function useDisclosure() {
  const ctx = useContext(DisclosureContext);
  if (!ctx) throw new Error("Disclosure.* must be used inside <Disclosure>");
  return ctx;
}

export interface DisclosureProps extends HTMLAttributes<HTMLDivElement> {
  /** controlled open 상태. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DisclosureRoot = forwardRef<HTMLDivElement, DisclosureProps>(
  function DisclosureRoot(
    { open: openProp, defaultOpen = false, onOpenChange, className, children, ...rest },
    ref,
  ) {
    const [openState, setOpenState] = useState(defaultOpen);
    const open = openProp ?? openState;
    const bodyId = useId();

    const toggle = useCallback(() => {
      const next = !open;
      if (openProp === undefined) setOpenState(next);
      onOpenChange?.(next);
    }, [open, openProp, onOpenChange]);

    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");

    return (
      <DisclosureContext.Provider value={{ open, toggle, bodyId }}>
        <div ref={ref} className={rootClass} data-open={open || undefined} {...rest}>
          {children}
        </div>
      </DisclosureContext.Provider>
    );
  },
);

/* Trigger ────────────────────────────────────────────── */
export interface DisclosureTriggerProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, "onClick"> {
  children?: ReactNode;
}

function DisclosureTrigger({ className, children, ...rest }: DisclosureTriggerProps) {
  const { open, toggle, bodyId } = useDisclosure();
  return (
    <button
      type="button"
      className={[styles.trigger, className ?? ""].filter(Boolean).join(" ")}
      aria-expanded={open}
      aria-controls={bodyId}
      onClick={toggle}
      {...rest}
    >
      <span className={styles.triggerLabel}>{children}</span>
      <Icon name="caret-down" size={12} className={styles.caret} />
    </button>
  );
}

/* Body ────────────────────────────────────────────────── */
export interface DisclosureBodyProps extends HTMLAttributes<HTMLDivElement> {}

function DisclosureBody({ className, children, ...rest }: DisclosureBodyProps) {
  const { open, bodyId } = useDisclosure();
  return (
    <div
      id={bodyId}
      className={[styles.bodyWrap, className ?? ""].filter(Boolean).join(" ")}
      data-open={open || undefined}
      aria-hidden={!open || undefined}
      {...rest}
    >
      <div className={styles.bodyInner}>{children}</div>
    </div>
  );
}

/* Compound export ────────────────────────────────────── */
type DisclosureComponent = typeof DisclosureRoot & {
  Trigger: typeof DisclosureTrigger;
  Body: typeof DisclosureBody;
};

const Disclosure = DisclosureRoot as DisclosureComponent;
Disclosure.Trigger = DisclosureTrigger;
Disclosure.Body = DisclosureBody;

export { Disclosure };
