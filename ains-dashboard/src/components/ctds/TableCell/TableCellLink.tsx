"use client";

import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

import { Button } from "../Button";
import { Icon } from "../Icon";

export type TableCellLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children?: ReactNode;
  /** 외부 링크 — target="_blank"·external 아이콘 자동 추가. */
  external?: boolean;
};

/* 셀 안쪽 inline 링크. Button(ghost·xs) + asChild로 anchor를 감싸 — 셀의 "작은 액션"
   형태를 유지하면서 Button 토큰(hover·focus·ring)을 그대로 받는다.
   xs size는 ghost 전용 제약 준수.
   asChild 모드의 Slot은 자식이 정확히 하나여야 해서 Button의 rightIcon prop을 쓸 수 없음.
   external 아이콘은 anchor 내부에 직접 꽂아 single child 조건을 지킨다.
   ⚠ Navigate 모드 TableRow(href·onClick 있음) 안에서는 쓰지 않는다 — nested interactive. */
export const TableCellLink = forwardRef<HTMLAnchorElement, TableCellLinkProps>(
  function TableCellLink({ children, external, href, target, rel, ...rest }, ref) {
    const resolvedTarget = external ? (target ?? "_blank") : target;
    const resolvedRel = external ? (rel ?? "noreferrer noopener") : rel;
    return (
      <Button asChild size="xs" variant="ghost">
        <a ref={ref} href={href} target={resolvedTarget} rel={resolvedRel} {...rest}>
          {children}
          {external && <Icon name="arrow-square-out" aria-hidden />}
        </a>
      </Button>
    );
  },
);
