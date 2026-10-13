"use client";

import type { HTMLAttributes, ReactNode } from "react";
import styles from "./MessageQuote.module.css";

export type MessageQuoteVariant = "plain" | "blockquote";

export interface MessageQuoteProps extends HTMLAttributes<HTMLQuoteElement> {
  children: ReactNode;
  /** plain — 그냥 글. blockquote — 왼쪽 vertical bar 리더. 기본 blockquote. */
  variant?: MessageQuoteVariant;
}

export function MessageQuote({
  children,
  variant = "blockquote",
  className,
  ...rest
}: MessageQuoteProps) {
  const cls = [
    styles.root,
    variant === "blockquote" ? styles.blockquote : styles.plain,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <blockquote className={cls} {...rest}>
      {children}
    </blockquote>
  );
}
