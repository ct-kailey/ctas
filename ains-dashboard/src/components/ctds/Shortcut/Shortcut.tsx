import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import {
  Command as PhCommand,
  ArrowFatUp as PhShift,
  Option as PhOption,
  Control as PhControl,
  ArrowElbowDownLeft as PhReturn,
  Backspace as PhBackspace,
  ArrowElbowDownRight as PhTab,
  ArrowUp as PhArrowUp,
  ArrowDown as PhArrowDown,
  ArrowLeft as PhArrowLeft,
  ArrowRight as PhArrowRight,
  type Icon as PhIcon,
} from "@phosphor-icons/react";

import styles from "./Shortcut.module.css";

export type ShortcutSize = "sm" | "md";

/**
 * 각 키 토큰. 문자열이면 아래 규칙으로 렌더:
 *   - 심볼 매핑에 걸리면 phosphor 아이콘
 *   - 다글자 이름("cmd", "shift", "enter", "esc", "space" 등)도 매핑에 걸리면 아이콘
 *   - 그 외(단일 알파벳/숫자/문장부호/미매핑)는 텍스트 그대로
 * 완전 자유가 필요하면 ReactNode 전달.
 */
export type ShortcutKey = string | ReactNode;

export type ShortcutProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  size?: ShortcutSize;
  /**
   * 단축키. 사용법:
   *   "⌘K"          → [⌘][K]  (심볼 단위로 자동 분해)
   *   "⌘⇧P"         → [⌘][⇧][P]
   *   ["cmd", "K"]  → 이름으로 명시 (다글자 별칭 지원)
   *   ["ctrl", "shift", "P"]
   * 매핑 없는 문자열은 그대로 텍스트("esc", "space", "del", 알파벳/숫자 등).
   */
  children: string | ShortcutKey[] | ReactNode;
};

const sizeClass: Record<ShortcutSize, string> = {
  sm: styles.sm,
  md: styles.md,
};

/* 심볼/별칭 → phosphor 아이콘.
   Icon axis와 무관하게 phosphor로 고정 (한 페이지 = 한 family 원칙의 예외 —
   단축키는 시스템 관례 심볼이라 라이브러리 스왑 대상이 아님). */
const iconMap: Record<string, PhIcon> = {
  // Command
  "⌘": PhCommand,
  cmd: PhCommand,
  command: PhCommand,
  meta: PhCommand,
  // Shift
  "⇧": PhShift,
  shift: PhShift,
  // Option / Alt
  "⌥": PhOption,
  opt: PhOption,
  option: PhOption,
  alt: PhOption,
  // Control
  "⌃": PhControl,
  ctrl: PhControl,
  control: PhControl,
  // Return / Enter
  "⏎": PhReturn,
  "↵": PhReturn,
  enter: PhReturn,
  return: PhReturn,
  // Backspace / Delete
  "⌫": PhBackspace,
  backspace: PhBackspace,
  // Tab
  "⇥": PhTab,
  tab: PhTab,
  // Arrows
  "↑": PhArrowUp,
  up: PhArrowUp,
  "↓": PhArrowDown,
  down: PhArrowDown,
  "←": PhArrowLeft,
  left: PhArrowLeft,
  "→": PhArrowRight,
  right: PhArrowRight,
};

const ICON_SIZE: Record<ShortcutSize, number> = {
  sm: 11,
  md: 12,
};

/* 문자열 → 키 토큰 배열.
   Array.from으로 code point 단위 분해 (⌘·⇧ 같은 심볼도 안전).
   공백은 무시. */
function splitToKeys(input: string): string[] {
  return Array.from(input).filter((ch) => ch !== " ");
}

function renderKey(
  key: ShortcutKey,
  size: ShortcutSize,
  idx: number,
): ReactNode {
  if (typeof key !== "string") {
    return (
      <span key={idx} className={styles.key}>
        {key}
      </span>
    );
  }
  const lower = key.toLowerCase();
  const IconComp = iconMap[key] ?? iconMap[lower];
  if (IconComp) {
    return (
      <span key={idx} className={`${styles.key} ${styles.keyIcon}`}>
        <IconComp size={ICON_SIZE[size]} />
      </span>
    );
  }
  return (
    <span key={idx} className={styles.key}>
      {key}
    </span>
  );
}

const Shortcut = forwardRef<HTMLElement, ShortcutProps>(
  ({ className, size = "sm", children, ...rest }, ref) => {
    const cls = [styles.root, sizeClass[size], className ?? ""]
      .filter(Boolean)
      .join(" ");

    let content: ReactNode;
    if (typeof children === "string") {
      content = splitToKeys(children).map((k, i) => renderKey(k, size, i));
    } else if (Array.isArray(children)) {
      content = (children as ShortcutKey[]).map((k, i) => renderKey(k, size, i));
    } else {
      content = children;
    }

    return (
      <kbd ref={ref} className={cls} {...rest}>
        {content}
      </kbd>
    );
  },
);

Shortcut.displayName = "Shortcut";

export { Shortcut };
