"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { forwardRef, type ReactNode } from "react";

import { Icon } from "../Icon";
import { IconButton } from "../IconButton";

import styles from "./Drawer.module.css";

export type DrawerSide = "right" | "left";
export type DrawerSize = "sm" | "md" | "lg";
export type DrawerBackdrop = "scrim" | "locked" | "none";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 헤더 좌측 타이틀. 접근성상 필수 — 숨길 땐 titleSrOnly. */
  title: ReactNode;
  /** 타이틀 바로 아래 한두 줄 설명. 헤더 영역 안에서 title과 바짝 붙음. */
  description?: ReactNode;
  /** 타이틀을 시각적으로 숨기고 스크린리더에만 노출. */
  titleSrOnly?: boolean;
  /** 바디 콘텐츠. Modal보다 길어도 OK — 세로 스크롤 담당. */
  children?: ReactNode;
  /** 하단 액션 영역. Button들을 넘김. 없으면 footer 자체가 렌더되지 않음. */
  footer?: ReactNode;
  /** 헤더 우측 X 버튼. 기본 true. */
  dismissible?: boolean;
  /** 스크린리더용 X 버튼 라벨. i18n 호출부 책임. */
  dismissLabel?: string;
  /** ESC 키 닫힘 차단. 중요한 확인/저장 중엔 true. */
  disableEscape?: boolean;
  /** 열리는 방향. 기본 right. */
  side?: DrawerSide;
  /** 가로 폭. 기본 md = 뷰포트 50%. 데이터·관리 도구는 sm, 복잡한 편집은 lg. */
  size?: DrawerSize;
  /**
   * backdrop(dim) 정책.
   * - `scrim` (기본): dim O + 바깥 클릭 닫힘.
   * - `locked`: dim O + 바깥 클릭 무시 (실수 유발 방지).
   * - `none`: dim 없음 — non-modal 사이드 패널 느낌. 뒤 영역 계속 조작 가능.
   */
  backdrop?: DrawerBackdrop;
}

/**
 * 간편 모드 — 가장 흔한 "title + body + footer" 레이아웃을 flat prop으로 넘긴다.
 * 커스터마이즈가 필요하면 compound 모드:
 *   <Drawer.Root open onOpenChange={set} side="right" size="md">
 *     <Drawer.Header title="…" />
 *     <Drawer.Body>…</Drawer.Body>
 *     <Drawer.Footer>…</Drawer.Footer>
 *   </Drawer.Root>
 */
const DrawerComponent = forwardRef<HTMLDivElement, DrawerProps>(function Drawer(
  {
    open,
    onOpenChange,
    title,
    description,
    titleSrOnly,
    children,
    footer,
    dismissible = true,
    dismissLabel,
    disableEscape,
    side = "right",
    size = "md",
    backdrop = "scrim",
  },
  ref,
) {
  return (
    <DrawerRoot
      open={open}
      onOpenChange={onOpenChange}
      disableEscape={disableEscape}
      side={side}
      size={size}
      backdrop={backdrop}
      ref={ref}
    >
      <DrawerHeader
        title={title}
        description={description}
        titleSrOnly={titleSrOnly}
        dismissible={dismissible}
        dismissLabel={dismissLabel}
      />
      {children !== undefined && children !== null && <DrawerBody>{children}</DrawerBody>}
      {footer && <DrawerFooter>{footer}</DrawerFooter>}
    </DrawerRoot>
  );
});

export interface DrawerRootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  disableEscape?: boolean;
  side?: DrawerSide;
  size?: DrawerSize;
  backdrop?: DrawerBackdrop;
}

export const DrawerRoot = forwardRef<HTMLDivElement, DrawerRootProps>(function DrawerRoot(
  { open, onOpenChange, children, disableEscape, side = "right", size = "md", backdrop = "scrim" },
  ref,
) {
  const isModal = backdrop !== "none";
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={isModal}>
      <RadixDialog.Portal>
        {backdrop !== "none" && <RadixDialog.Overlay className={styles.overlay} />}
        <RadixDialog.Content
          ref={ref}
          className={styles.content}
          data-side={side}
          data-size={size}
          onEscapeKeyDown={(e) => {
            if (disableEscape) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (backdrop !== "scrim") e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (backdrop === "none") e.preventDefault();
          }}
        >
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
});

export interface DrawerHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  titleSrOnly?: boolean;
  dismissible?: boolean;
  dismissLabel?: string;
}

export function DrawerHeader({
  title,
  description,
  titleSrOnly,
  dismissible = true,
  dismissLabel,
}: DrawerHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <RadixDialog.Title
          className={[styles.title, titleSrOnly && "visually-hidden"]
            .filter(Boolean)
            .join(" ")}
        >
          {title}
        </RadixDialog.Title>
        {description && (
          <RadixDialog.Description className={styles.description}>
            {description}
          </RadixDialog.Description>
        )}
      </div>
      {dismissible && (
        <RadixDialog.Close asChild>
          <IconButton
            className={styles.close}
            variant="ghost"
            icon={<Icon name="x" />}
            aria-label={dismissLabel}
          />
        </RadixDialog.Close>
      )}
    </div>
  );
}

export function DrawerBody({ children }: { children: ReactNode }) {
  return (
    <div className={styles.body}>
      <div className={styles.bodyInner}>{children}</div>
    </div>
  );
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

type DrawerCompound = typeof DrawerComponent & {
  Root: typeof DrawerRoot;
  Header: typeof DrawerHeader;
  Body: typeof DrawerBody;
  Footer: typeof DrawerFooter;
};

export const Drawer = Object.assign(DrawerComponent, {
  Root: DrawerRoot,
  Header: DrawerHeader,
  Body: DrawerBody,
  Footer: DrawerFooter,
}) as DrawerCompound;
