"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "../_cn";
import styles from "./AppFrame.module.css";

export type AppFrameVariant = "outlined" | "floating" | "flat";
export type AppFrameLayout = "sidebar-first" | "topbar-first";

export interface AppFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** 컨테이너 표현(bg/border/shadow). 기본 outlined. */
  variant?: AppFrameVariant;
  /**
   * 레이아웃 구조.
   * - sidebar-first: 사이드바가 세로 전체, 탑바는 오른쪽 영역 위에만. Linear/Slack.
   * - topbar-first: 탑바가 가로 전체, 사이드바는 아래 왼쪽에만. Jira/Vercel.
   * 기본 sidebar-first.
   */
  layout?: AppFrameLayout;
}

/* Slots ────────────────────────────────────────────────
   grid-area 배정용 얇은 wrapper. */
function AppFrameSidebar({ children }: { children: ReactNode }) {
  return <div className={styles.sidebarSlot}>{children}</div>;
}

function AppFrameTopbar({ children }: { children: ReactNode }) {
  return <div className={styles.topbarSlot}>{children}</div>;
}

function AppFrameTabs({ children }: { children: ReactNode }) {
  return <div className={styles.tabsSlot}>{children}</div>;
}

function AppFrameContent({ children }: { children: ReactNode }) {
  return <div className={styles.contentSlot}>{children}</div>;
}

/* Root ─────────────────────────────────────────────────
   children을 훑어 어떤 슬롯이 들어왔는지 감지. 비어있는 슬롯이 있으면
   data-has-* attribute로 CSS에게 알려 grid-template을 조정하게 한다. */
const AppFrameRoot = forwardRef<HTMLDivElement, AppFrameProps>(function AppFrameRoot(
  { variant = "outlined", layout = "sidebar-first", className, children, ...rest },
  ref,
) {
  let hasSidebar = false;
  let hasTopbar = false;
  let hasTabs = false;
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === AppFrameSidebar) hasSidebar = true;
    else if (child.type === AppFrameTopbar) hasTopbar = true;
    else if (child.type === AppFrameTabs) hasTabs = true;
  });

  return (
    <div
      ref={ref}
      className={cn(styles.root, className)}
      data-variant={variant}
      data-layout={layout}
      data-has-sidebar={hasSidebar || undefined}
      data-has-topbar={hasTopbar || undefined}
      data-has-tabs={hasTabs || undefined}
      {...rest}
    >
      {children}
    </div>
  );
});

type AppFrameComponent = typeof AppFrameRoot & {
  Sidebar: typeof AppFrameSidebar;
  Topbar: typeof AppFrameTopbar;
  Tabs: typeof AppFrameTabs;
  Content: typeof AppFrameContent;
};

const AppFrame = AppFrameRoot as AppFrameComponent;
AppFrame.Sidebar = AppFrameSidebar;
AppFrame.Topbar = AppFrameTopbar;
AppFrame.Tabs = AppFrameTabs;
AppFrame.Content = AppFrameContent;

export { AppFrame };
