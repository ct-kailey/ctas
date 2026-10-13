"use client";

import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Bubble.module.css";

export type BubbleShape = "rounded" | "circular-drop" | "circular" | "square";
export type BubbleFill = "none" | "solid" | "translucent" | "outline";
export type BubbleSize = "md" | "lg";
export type BubbleTail = "start" | "end";

export interface BubbleProps extends HTMLAttributes<HTMLDivElement> {
  shape?: BubbleShape;
  fill?: BubbleFill;
  size?: BubbleSize;
  /** circular-drop에서 각지는 코너의 방향. UserMessage=end, AIMessage/Quote=start. */
  tail?: BubbleTail;
  children: ReactNode;
}

const shapeClass: Record<BubbleShape, string> = {
  rounded: styles.shapeRounded,
  "circular-drop": styles.shapeCircularDrop,
  circular: styles.shapeCircular,
  square: styles.shapeSquare,
};

const fillClass: Record<BubbleFill, string> = {
  none: styles.fillNone,
  solid: styles.fillSolid,
  translucent: styles.fillTranslucent,
  outline: styles.fillOutline,
};

const sizeClass: Record<BubbleSize, string> = {
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

export function Bubble({
  shape = "rounded",
  fill = "translucent",
  size = "md",
  tail = "end",
  className,
  children,
  ...rest
}: BubbleProps) {
  const cls = [
    styles.root,
    shapeClass[shape],
    fillClass[fill],
    sizeClass[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} data-tail={shape === "circular-drop" ? tail : undefined} {...rest}>
      {children}
    </div>
  );
}
