"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { forwardRef, type ReactNode, type ComponentPropsWithoutRef } from "react";

import { Icon } from "../Icon";
import { IconButton } from "../IconButton";

import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 헤더 좌측 타이틀. 접근성상 필수 — 숨길 땐 titleSrOnly. */
  title: ReactNode;
  /** 타이틀 바로 아래 한두 줄 설명. 헤더 영역 안에서 title과 바짝 붙음. 긴 폼이면 children 쪽으로. */
  description?: ReactNode;
  /** 타이틀을 시각적으로 숨기고 스크린리더에만 노출. 일러스트 중심 모달 등. */
  titleSrOnly?: boolean;
  /** 바디 콘텐츠. input/image/list 등 자유. 헤더(title + description)와 분리된 아래 영역. */
  children?: ReactNode;
  /** 하단 액션 영역. Button들을 넘김. 없으면 footer 자체가 렌더되지 않음. */
  footer?: ReactNode;
  /** 헤더 우측 X 버튼. 기본 true. */
  dismissible?: boolean;
  /** 스크린리더용 X 버튼 라벨. i18n 호출부 책임. */
  dismissLabel?: string;
  /** ESC 키 닫힘 차단. 중요한 확인/저장 중엔 true. */
  disableEscape?: boolean;
  /** AINS compatibility: content width and layout remain token driven. */
  className?: string;
  /** Defaults to false per CTDS; the legacy AINS adapter may opt in. */
  closeOnOutside?: boolean;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof RadixDialog.Content>["onCloseAutoFocus"];
  "data-ctds"?: string;
}

/**
 * 간편 모드 — 가장 흔한 "title + body + footer" 레이아웃을 flat prop으로 넘긴다.
 * 커스터마이즈가 필요하면 compound 모드:
 *   <Modal.Root open onOpenChange={set}>
 *     <Modal.Header title="…" />
 *     <Modal.Body>…</Modal.Body>
 *     <Modal.Footer>…</Modal.Footer>
 *   </Modal.Root>
 */
const ModalComponent = forwardRef<HTMLDivElement, ModalProps>(function Modal(
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
    className,
    closeOnOutside,
    onCloseAutoFocus,
    "data-ctds": ctdsMarker,
  },
  ref,
) {
  return (
    <ModalRoot
      open={open}
      onOpenChange={onOpenChange}
      disableEscape={disableEscape}
      className={className}
      closeOnOutside={closeOnOutside}
      onCloseAutoFocus={onCloseAutoFocus}
      hasDescription={Boolean(description)}
      data-ctds={ctdsMarker}
      ref={ref}
    >
      <ModalHeader
        title={title}
        description={description}
        titleSrOnly={titleSrOnly}
        dismissible={dismissible}
        dismissLabel={dismissLabel}
      />
      {children !== undefined && children !== null && <ModalBody>{children}</ModalBody>}
      {footer && <ModalFooter>{footer}</ModalFooter>}
    </ModalRoot>
  );
});

export interface ModalRootProps {
  hasDescription?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** ESC 키 닫힘 차단. 중요한 확인/저장 중엔 true. */
  disableEscape?: boolean;
  /** AINS compatibility: content width and layout remain token driven. */
  className?: string;
  /** Defaults to false per CTDS; the legacy AINS adapter may opt in. */
  closeOnOutside?: boolean;
  onCloseAutoFocus?: ComponentPropsWithoutRef<typeof RadixDialog.Content>["onCloseAutoFocus"];
  "data-ctds"?: string;
}

export const ModalRoot = forwardRef<HTMLDivElement, ModalRootProps>(function ModalRoot(
  { open, onOpenChange, children, disableEscape, className, closeOnOutside = false, onCloseAutoFocus, hasDescription = false, "data-ctds": ctdsMarker },
  ref,
) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={styles.overlay} />
        <RadixDialog.Content
          ref={ref}
          className={[styles.content, className].filter(Boolean).join(" ")}
          data-ctds={ctdsMarker}
          {...(hasDescription ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(e) => {
            if (disableEscape) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            // CTDS defaults to preserving a decision; AINS can preserve legacy dismiss behavior.
            if (!closeOnOutside) e.preventDefault();
          }}
        >
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
});

export interface ModalHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  titleSrOnly?: boolean;
  eyebrow?: ReactNode;
  dismissible?: boolean;
  dismissLabel?: string;
}

export function ModalHeader({
  title,
  description,
  titleSrOnly,
  eyebrow,
  dismissible = true,
  dismissLabel,
}: ModalHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
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

export function ModalBody({ children }: { children: ReactNode }) {
  return (
    <div className={styles.body}>
      <div className={styles.bodyInner}>{children}</div>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className={styles.footer}>{children}</div>;
}

type ModalCompound = typeof ModalComponent & {
  Root: typeof ModalRoot;
  Header: typeof ModalHeader;
  Body: typeof ModalBody;
  Footer: typeof ModalFooter;
};

export const Modal = Object.assign(ModalComponent, {
  Root: ModalRoot,
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
}) as ModalCompound;
