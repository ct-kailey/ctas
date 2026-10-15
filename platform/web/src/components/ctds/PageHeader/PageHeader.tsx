"use client";

import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../_cn";
import styles from "./PageHeader.module.css";

/* Root ─────────────────────────────────────────────────
   페이지 body 첫 블록의 head. "이 페이지가 뭔지"를 담는 자리.
   Topbar(chrome)와 역할이 다르다 — Topbar는 지금 어디(breadcrumb)·공용 액션,
   PageHeader는 h1·eyebrow·lead·메타·페이지 액션.

   레이아웃은 수직 스택이지만 Actions가 들어오면 Title과 같은 가로줄로
   자동 분리 (가장 흔한 패턴). Lead/Meta는 Title 아래에 계속 수직. */

export type PageHeaderSize = "sm" | "md" | "lg";

export interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  size?: PageHeaderSize;
}

const PageHeaderRoot = forwardRef<HTMLElement, PageHeaderProps>(function PageHeaderRoot(
  { size = "md", className, children, ...rest },
  ref,
) {
  return (
    <header
      ref={ref}
      className={cn(styles.root, className)}
      data-size={size}
      {...rest}
    >
      {children}
    </header>
  );
});

/* Eyebrow — 선택. 작은 상단 라벨("Overview · Billing" 같은 카테고리 표시).
   uppercase + wide tracking 조합은 금지, muted 색 + 작은 사이즈로만. */
const PageHeaderEyebrow = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageHeaderEyebrow({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={cn(styles.eyebrow, className)} {...rest}>
        {children}
      </div>
    );
  },
);

/* Title — 필수. <h1> 자동.
   Actions가 같은 부모 안에 있으면 titleRow에 묶여 가로 분리된다. */
const PageHeaderTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function PageHeaderTitle({ className, children, ...rest }, ref) {
    return (
      <h1 ref={ref} className={cn(styles.title, className)} {...rest}>
        {children}
      </h1>
    );
  },
);

/* Lead — 선택. muted 본문 1~2문장. em dash·ellipsis 금지. */
const PageHeaderLead = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function PageHeaderLead({ className, children, ...rest }, ref) {
    return (
      <p ref={ref} className={cn(styles.lead, className)} {...rest}>
        {children}
      </p>
    );
  },
);

/* Meta — 선택. Badge·날짜·author 등 작은 메타 조각 가로 묶음.
   gap은 space-2 (meta 토큰 사이는 작은 컴포넌트 사이가 아니라 '정보 묶음' 사이). */
const PageHeaderMeta = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageHeaderMeta({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={cn(styles.meta, className)} {...rest}>
        {children}
      </div>
    );
  },
);

/* Actions — 선택. Title과 같은 줄로 오른쪽 끝에 pin.
   자식 사이 gap은 작은 컴포넌트 간 규칙대로 space-1. */
const PageHeaderActions = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function PageHeaderActions({ className, children, ...rest }, ref) {
    return (
      <div ref={ref} className={cn(styles.actions, className)} {...rest}>
        {children}
      </div>
    );
  },
);

type PageHeaderComponent = typeof PageHeaderRoot & {
  Eyebrow: typeof PageHeaderEyebrow;
  Title: typeof PageHeaderTitle;
  Lead: typeof PageHeaderLead;
  Meta: typeof PageHeaderMeta;
  Actions: typeof PageHeaderActions;
};

const PageHeader = PageHeaderRoot as PageHeaderComponent;
PageHeader.Eyebrow = PageHeaderEyebrow;
PageHeader.Title = PageHeaderTitle;
PageHeader.Lead = PageHeaderLead;
PageHeader.Meta = PageHeaderMeta;
PageHeader.Actions = PageHeaderActions;

export { PageHeader };
