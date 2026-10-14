"use client";

/**
 * useCommandPaletteHotkey ─ Command Palette 토글 전역 단축키 훅.
 * 기본값 ⌘K / Ctrl+K. 입력 요소에서도 동작한다(검색 창은 어디서든 열려야 함).
 *
 * 사용
 *   const [open, setOpen] = useState(false);
 *   useCommandPaletteHotkey(() => setOpen((v) => !v));
 *
 * 커스텀 키
 *   useCommandPaletteHotkey(toggle, { key: "p", mod: true, shift: true }); // ⌘⇧P
 */

import { useEffect } from "react";

export type HotkeyOptions = {
  /** 단일 문자 키 (소문자). 기본 "k". */
  key?: string;
  /** Meta(⌘)/Ctrl 필수 여부. 기본 true. */
  mod?: boolean;
  /** Shift 필수 여부. 기본 false. */
  shift?: boolean;
  /** Alt 필수 여부. 기본 false. */
  alt?: boolean;
  /** 비활성 플래그. 조건부 활성 때 유용. */
  disabled?: boolean;
};

export function useCommandPaletteHotkey(
  callback: () => void,
  options: HotkeyOptions = {},
): void {
  const { key = "k", mod = true, shift = false, alt = false, disabled = false } = options;
  useEffect(() => {
    if (disabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      if (mod && !(e.metaKey || e.ctrlKey)) return;
      if (!mod && (e.metaKey || e.ctrlKey)) return;
      if (shift !== e.shiftKey) return;
      if (alt !== e.altKey) return;
      e.preventDefault();
      callback();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [callback, key, mod, shift, alt, disabled]);
}
