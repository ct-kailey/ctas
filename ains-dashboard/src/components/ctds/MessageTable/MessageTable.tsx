"use client";

import type { HTMLAttributes, ReactNode } from "react";
import styles from "./MessageTable.module.css";

export interface MessageTableProps extends HTMLAttributes<HTMLDivElement> {
  /** children에 <table>...</table> 전달. CTDS가 톤만 입힘. */
  children: ReactNode;
}

/** AIMessage 안의 markdown table을 "AI 응답 톤"으로 감싸는 wrapper.
 *  소비처는 <table><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table> 그대로 전달.
 *  wrapper가 가로 스크롤·hairline·padding 처리. */
export function MessageTable({ children, className, ...rest }: MessageTableProps) {
  const cls = [styles.root, className].filter(Boolean).join(" ");
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
