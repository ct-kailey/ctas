"use client";

/**
 * Accordion ─ 여러 섹션을 접었다 폈다 하는 구조 컴포넌트.
 *
 * 스택: Radix `@radix-ui/react-accordion` 어댑터.
 * - 열림/닫힘 상태·키보드 네비(↑↓ Home End)·ARIA(aria-expanded/controls)·
 *   콘텐츠 높이 측정은 전부 Radix가 처리.
 * - 시각(Trigger 레이아웃·caret·divider·card variant)만 CTDS가 담당.
 *
 * variant
 * - plain (기본): 테두리 없음, 아이템 사이 hairline만. 설정 그룹·FAQ용.
 * - card: 각 아이템이 테두리 + radius로 독립 블록. 콘텐츠 사이트의 섹션 리스트용.
 *
 * 소비 표면
 *   <Accordion type="single" collapsible defaultValue="general">
 *     <Accordion.Item value="general">
 *       <Accordion.Trigger leadingIcon="gear">일반</Accordion.Trigger>
 *       <Accordion.Content>...</Accordion.Content>
 *     </Accordion.Item>
 *   </Accordion>
 */

import * as RadixAccordion from "@radix-ui/react-accordion";
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

import { Icon, type IconName } from "../Icon";
import styles from "./Accordion.module.css";

export type AccordionSize = "sm" | "md" | "lg";
/**
 * - bare: 선·좌우 여백 전부 없음. 본문 흐름에 가장 투명하게 녹음(툴바·설명 블록 내부).
 * - plain: 테두리 없음, 아이템 사이 hairline, Trigger 좌우 padding 있음. 설정·FAQ 흐름.
 * - card: 각 아이템이 테두리 + radius로 독립 블록. 콘텐츠 섹션 리스트.
 */
export type AccordionVariant = "bare" | "plain" | "card";

export type AccordionAction =
  | ReactNode
  | { node: ReactNode; key?: string };

/* Size·variant context — Trigger가 Root 설정 상속. */
type AccordionContextValue = {
  size: AccordionSize;
  variant: AccordionVariant;
};
const AccordionContext = createContext<AccordionContextValue>({
  size: "sm",
  variant: "plain",
});

/* Root ─────────────────────────────────────────────────────── */

type SingleRootProps = ComponentPropsWithoutRef<typeof RadixAccordion.Root> & {
  type: "single";
};
type MultipleRootProps = ComponentPropsWithoutRef<typeof RadixAccordion.Root> & {
  type: "multiple";
};
export type AccordionProps = (SingleRootProps | MultipleRootProps) & {
  size?: AccordionSize;
  variant?: AccordionVariant;
};

const Root = forwardRef<HTMLDivElement, AccordionProps>(function Accordion(
  { className, size = "sm", variant = "plain", children, ...rest },
  ref,
) {
  return (
    <AccordionContext.Provider value={{ size, variant }}>
      <RadixAccordion.Root
        ref={ref}
        data-size={size}
        data-variant={variant}
        className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
        {...(rest as ComponentPropsWithoutRef<typeof RadixAccordion.Root>)}
      >
        {children}
      </RadixAccordion.Root>
    </AccordionContext.Provider>
  );
});

/* Item ─────────────────────────────────────────────────────── */

const Item = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RadixAccordion.Item>>(
  function AccordionItem({ className, children, ...rest }, ref) {
    return (
      <RadixAccordion.Item
        ref={ref}
        className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        {children}
      </RadixAccordion.Item>
    );
  },
);

/* Trigger ──────────────────────────────────────────────────── */

export interface TriggerProps
  extends Omit<ComponentPropsWithoutRef<typeof RadixAccordion.Trigger>, "children"> {
  /** 좌측 아이콘 이름. leading 슬롯 간결 사용. */
  leadingIcon?: IconName;
  /** 커스텀 좌측 노드 배열. leadingIcon보다 우선. */
  leadingActions?: AccordionAction[];
  /** 우측 메타(배지·숫자 등). caret은 자동으로 가장 끝. */
  trailingActions?: AccordionAction[];
  children?: ReactNode;
}

const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(function AccordionTrigger(
  { className, leadingIcon, leadingActions, trailingActions, children, ...rest },
  ref,
) {
  const leading =
    leadingActions ?? (leadingIcon ? [<Icon key="icon" name={leadingIcon} />] : undefined);
  return (
    <RadixAccordion.Header className={styles.header}>
      <RadixAccordion.Trigger
        ref={ref}
        className={[styles.trigger, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        {leading && leading.length > 0 && (
          <span className={styles.leading} data-slot="leading" aria-hidden>
            {leading.map((a, i) => {
              const key =
                typeof a === "object" && a !== null && "key" in a && a.key
                  ? a.key
                  : String(i);
              const node = typeof a === "object" && a !== null && "node" in a ? a.node : a;
              return (
                <span key={key} className={styles.leadingItem}>
                  {node as ReactNode}
                </span>
              );
            })}
          </span>
        )}
        <span className={styles.label}>{children}</span>
        {trailingActions && trailingActions.length > 0 && (
          <span className={styles.trailing} data-slot="trailing">
            {trailingActions.map((a, i) => {
              const key =
                typeof a === "object" && a !== null && "key" in a && a.key
                  ? a.key
                  : String(i);
              const node = typeof a === "object" && a !== null && "node" in a ? a.node : a;
              return (
                <span key={key} className={styles.trailingItem}>
                  {node as ReactNode}
                </span>
              );
            })}
          </span>
        )}
        <span className={styles.caret} aria-hidden>
          <Icon name="caret-down" />
        </span>
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
});

/* Content ──────────────────────────────────────────────────── */

const Content = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RadixAccordion.Content>>(
  function AccordionContent({ className, children, ...rest }, ref) {
    return (
      <RadixAccordion.Content
        ref={ref}
        className={[styles.content, className ?? ""].filter(Boolean).join(" ")}
        {...rest}
      >
        <div className={styles.contentInner}>{children}</div>
      </RadixAccordion.Content>
    );
  },
);

/* Hook — 내부 Trigger가 size 참조할 때 (현재는 미사용, 향후 확장용) */
export function useAccordionContext() {
  return useContext(AccordionContext);
}

/* Compound export ─────────────────────────────────────────── */

type AccordionComponent = typeof Root & {
  Item: typeof Item;
  Trigger: typeof Trigger;
  Content: typeof Content;
};

const Accordion = Root as AccordionComponent;
Accordion.Item = Item;
Accordion.Trigger = Trigger;
Accordion.Content = Content;

export { Accordion };
