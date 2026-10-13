"use client";

import * as RadixToast from "@radix-ui/react-toast";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Icon, type IconName } from "../Icon";
import { IconButton } from "../IconButton";

import styles from "./Toast.module.css";

export type ToastTone = "neutral" | "success" | "warning" | "destructive";
export type ToastSurface = "inverse" | "default";
export type ToastPlacement = "bottom-right" | "top-center";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  surface?: ToastSurface;
  icon?: IconName;
  /** 액션 요소(Button 등). `actionAltText`도 함께 넘겨야 렌더링된다 — 스크린리더용 라벨이 없으면 Radix가 action을 숨긴다. */
  action?: ReactNode;
  /**
   * action을 쓸 때 **필수** — 스크린리더가 action 버튼을 어떻게 안내할지. Toast 사라져도
   * 사용자가 수행할 수 있는 대안 설명(예: "실행 취소", "설정 열기"). 생략 시 action 미렌더.
   */
  actionAltText?: string;
  dismissible?: boolean;
  dismissLabel?: string;
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
  open: boolean;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_STACK = 3;

const toneDefaultIcon: Record<ToastTone, IconName> = {
  neutral: "info",
  success: "check-circle",
  warning: "warning-circle",
  destructive: "warning",
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export interface ToastProviderProps {
  children: ReactNode;
  /** 전역 기본 duration (ms). 기본 4000. */
  duration?: number;
  /** 스왑 제스처로 닫기 임계 거리. 기본 50px. */
  swipeThreshold?: number;
}

export function ToastProvider({
  children,
  duration = 4000,
  swipeThreshold = 50,
}: ToastProviderProps) {
  const [items, setItems] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, open: false } : t)));
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    idRef.current += 1;
    const id = String(idRef.current);
    setItems((prev) => {
      const next = [...prev, { ...opts, id, open: true }];
      if (next.length > MAX_STACK) {
        // 가장 오래된 open 토스트를 닫도록 open=false 처리 (close 애니 재사용)
        const oldestOpenIdx = next.findIndex((t) => t.open);
        if (oldestOpenIdx !== -1) next[oldestOpenIdx] = { ...next[oldestOpenIdx], open: false };
      }
      return next;
    });
    return id;
  }, []);

  const ctxValue = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={ctxValue}>
      <RadixToast.Provider duration={duration} swipeThreshold={swipeThreshold}>
        {children}
        {items.map((t) => (
          <Toast
            key={t.id}
            open={t.open}
            onOpenChange={(open) => {
              if (!open) {
                setItems((prev) =>
                  prev.map((x) => (x.id === t.id ? { ...x, open: false } : x)),
                );
                // Radix는 애니 종료 후 remove 호출 — 안전하게 지연
                window.setTimeout(() => remove(t.id), 400);
              }
            }}
            title={t.title}
            description={t.description}
            tone={t.tone}
            surface={t.surface}
            icon={t.icon}
            action={t.action}
            actionAltText={t.actionAltText}
            dismissible={t.dismissible}
            dismissLabel={t.dismissLabel}
            duration={t.duration}
          />
        ))}
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

export interface ToastViewportProps {
  placement?: ToastPlacement;
  /** 접근성용 라벨 (스크린리더가 영역을 소개). i18n은 부모가 넘긴다. */
  label?: string;
}

export function ToastViewport({
  placement = "bottom-right",
  label,
}: ToastViewportProps) {
  return (
    <RadixToast.Viewport
      className={[styles.viewport, styles[`placement-${placement}`]]
        .filter(Boolean)
        .join(" ")}
      label={label}
      data-placement={placement}
    />
  );
}

export interface ToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  surface?: ToastSurface;
  icon?: IconName;
  action?: ReactNode;
  actionAltText?: string;
  dismissible?: boolean;
  dismissLabel?: string;
  duration?: number;
}

export const Toast = forwardRef<HTMLLIElement, ToastProps>(function Toast(
  {
    open,
    onOpenChange,
    title,
    description,
    tone = "neutral",
    surface = "inverse",
    icon,
    action,
    actionAltText,
    dismissible = true,
    dismissLabel,
    duration,
  },
  ref,
) {
  const resolvedIcon = icon ?? toneDefaultIcon[tone];
  const isAlert = tone === "destructive";

  return (
    <RadixToast.Root
      ref={ref}
      open={open}
      onOpenChange={onOpenChange}
      duration={duration}
      type={isAlert ? "foreground" : "background"}
      className={[
        styles.root,
        styles[`surface-${surface}`],
        styles[`tone-${tone}`],
      ].join(" ")}
    >
      {resolvedIcon && (
        <span className={styles.icon} aria-hidden>
          <Icon name={resolvedIcon} />
        </span>
      )}
      <div className={styles.body}>
        <RadixToast.Title className={styles.title}>{title}</RadixToast.Title>
        {description && (
          <RadixToast.Description className={styles.description}>
            {description}
          </RadixToast.Description>
        )}
      </div>
      {action && actionAltText && (
        <RadixToast.Action
          className={styles.action}
          altText={actionAltText}
          asChild
        >
          {action}
        </RadixToast.Action>
      )}
      {action && !actionAltText && typeof window !== "undefined" && process.env.NODE_ENV !== "production" && (
        <ToastActionWarning />
      )}
      {dismissible && (
        <RadixToast.Close asChild>
          <IconButton
            className={styles.close}
            size="sm"
            variant="ghost"
            icon={<Icon name="x" />}
            aria-label={dismissLabel}
          />
        </RadixToast.Close>
      )}
    </RadixToast.Root>
  );
});

/** dev-only. action은 주고 actionAltText를 빠뜨리면 Radix가 조용히 숨기므로 console로 경고. */
function ToastActionWarning() {
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.warn(
      "[CTDS Toast] `action` prop을 넘겼는데 `actionAltText`가 비어있어요. 스크린리더용 라벨이 없으면 action이 렌더되지 않습니다.",
    );
  }
  return null;
}
