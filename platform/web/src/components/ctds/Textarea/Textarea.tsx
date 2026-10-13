"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import { Icon } from "../Icon";
import styles from "./Textarea.module.css";

export type TextareaSize = "sm" | "md" | "lg";
export type TextareaVariant = "outline" | "filled" | "line";
/**
 * 가로 폭 정책 — Input과 동일.
 * "fill"(기본) 부모 폭 채움 · "md"=280px · "lg"=400px · number=px.
 */
export type TextareaWidth = "fill" | "md" | "lg" | number;

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size" | "width"> {
  size?: TextareaSize;
  variant?: TextareaVariant;
  /** 폼 검증 실패. warning이 있으면 자동으로 true. */
  invalid?: boolean;
  /** 가로 폭. 기본 "fill". */
  width?: TextareaWidth;
  /** 라벨 텍스트. */
  label?: ReactNode;
  /** 중립 톤 도움말. */
  description?: ReactNode;
  /** 경고 메시지. 있으면 invalid로 취급. */
  warning?: ReactNode;
  /**
   * 내용에 맞춰 자동으로 높이 조정.
   * true면 사용자 리사이즈 핸들은 감춰지고, maxRows에 도달하면 스크롤이 붙는다.
   */
  autoResize?: boolean;
  /** autoResize 하한. 기본 rows(=3). */
  minRows?: number;
  /**
   * autoResize 상한(줄 수). 넘으면 세로 스크롤.
   * autoResize 없이 minRows/rows만 있으면 커스텀 핸들로 드래그해서 늘릴 수 있다.
   */
  maxRows?: number;
  /** 글자수 카운터 노출. maxLength가 있으면 "n / max" 포맷. */
  showCount?: boolean;
}

const sizeClass: Record<TextareaSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

const variantClass: Record<TextareaVariant, string> = {
  outline: styles.outline,
  filled: styles.filled,
  line: styles.line,
};

const labelSizeClass: Record<TextareaSize, string> = {
  sm: styles.labelSm,
  md: styles.labelMd,
  lg: styles.labelLg,
};

/* line-height + padding + border 합산해 chrome 높이(px)를 얻는다. */
function computeMetrics(el: HTMLTextAreaElement) {
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  const pt = parseFloat(cs.paddingTop);
  const pb = parseFloat(cs.paddingBottom);
  const bt = parseFloat(cs.borderTopWidth);
  const bb = parseFloat(cs.borderBottomWidth);
  return { lh, chrome: pt + pb + bt + bb };
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      size = "md",
      variant = "outline",
      invalid: invalidProp,
      width = "fill",
      label,
      description,
      warning,
      autoResize = true,
      minRows,
      maxRows,
      showCount = false,
      rows = 3,
      disabled,
      readOnly,
      required,
      value,
      defaultValue,
      onChange,
      maxLength,
      id,
      ...props
    },
    ref
  ) => {
    const innerRef = useRef<HTMLTextAreaElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const hasWarning = warning != null && warning !== false;
    const invalid = invalidProp ?? hasWarning;

    const autoId = useId();
    const textareaId = id ?? autoId;
    const descriptionId = description != null ? `${textareaId}-desc` : undefined;
    const warningId = hasWarning ? `${textareaId}-warn` : undefined;
    const describedBy =
      [warningId, descriptionId].filter(Boolean).join(" ") || undefined;

    const [uncontrolledValue, setUncontrolledValue] = useState<string>(
      String(defaultValue ?? "")
    );

    const isControlled = value !== undefined;
    const currentValue = isControlled ? String(value ?? "") : uncontrolledValue;

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLTextAreaElement>) => {
        if (!isControlled) setUncontrolledValue(e.target.value);
        onChange?.(e);
      },
      [isControlled, onChange]
    );

    /* autoResize: 컨텐츠 높이 → element.style.height 반영.
       max에 도달하면 overflow-y=auto 로 스크롤. */
    useLayoutEffect(() => {
      if (!autoResize) return;
      const el = innerRef.current;
      if (!el) return;

      const { lh, chrome } = computeMetrics(el);
      const minR = minRows ?? rows ?? 3;
      const minH = lh * minR + chrome;
      const maxH = maxRows != null ? lh * maxRows + chrome : Infinity;

      el.style.height = "auto";
      const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
    }, [autoResize, currentValue, minRows, maxRows, rows, size]);

    /* Manual 모드 — rows + minRows/maxRows로 min/max height를 계산해두고,
       핸들 드래그로 el.style.height를 갱신. */
    const [dragging, setDragging] = useState(false);
    const dragState = useRef<{
      startY: number;
      startH: number;
      minH: number;
      maxH: number;
    } | null>(null);

    const applyManualBounds = useCallback(() => {
      if (autoResize) return;
      const el = innerRef.current;
      if (!el) return;
      const { lh, chrome } = computeMetrics(el);
      const minR = minRows ?? rows ?? 3;
      el.style.minHeight = `${lh * minR + chrome}px`;
      if (maxRows != null) {
        el.style.maxHeight = `${lh * maxRows + chrome}px`;
      } else {
        el.style.maxHeight = "";
      }
    }, [autoResize, minRows, maxRows, rows]);

    useLayoutEffect(() => {
      applyManualBounds();
    }, [applyManualBounds, size]);

    const onHandlePointerDown = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const el = innerRef.current;
        if (!el || autoResize || disabled || readOnly) return;
        e.preventDefault();
        const { lh, chrome } = computeMetrics(el);
        const minR = minRows ?? rows ?? 3;
        const minH = lh * minR + chrome;
        const maxH = maxRows != null ? lh * maxRows + chrome : Infinity;
        dragState.current = {
          startY: e.clientY,
          startH: el.offsetHeight,
          minH,
          maxH,
        };
        setDragging(true);
        document.body.classList.add("textarea-resizing");
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      },
      [autoResize, disabled, readOnly, minRows, maxRows, rows]
    );

    const onHandlePointerMove = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const state = dragState.current;
        const el = innerRef.current;
        if (!state || !el) return;
        const dy = e.clientY - state.startY;
        const next = Math.min(
          Math.max(state.startH + dy, state.minH),
          state.maxH
        );
        el.style.height = `${next}px`;
      },
      []
    );

    const onHandlePointerUp = useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!dragState.current) return;
        dragState.current = null;
        setDragging(false);
        document.body.classList.remove("textarea-resizing");
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* pointer가 이미 해제된 경우 */
        }
      },
      []
    );

    /* 키보드 조작 — Arrow Up/Down으로 한 줄씩. 접근성. */
    const onHandleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        const el = innerRef.current;
        if (!el || autoResize || disabled || readOnly) return;
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const { lh, chrome } = computeMetrics(el);
        const minR = minRows ?? rows ?? 3;
        const minH = lh * minR + chrome;
        const maxH = maxRows != null ? lh * maxRows + chrome : Infinity;
        const step = lh;
        const cur = el.offsetHeight;
        const next = Math.min(
          Math.max(cur + (e.key === "ArrowDown" ? step : -step), minH),
          maxH
        );
        el.style.height = `${next}px`;
      },
      [autoResize, disabled, readOnly, minRows, maxRows, rows]
    );

    useEffect(() => {
      return () => {
        document.body.classList.remove("textarea-resizing");
      };
    }, []);

    /* ref 병합 */
    useEffect(() => {
      if (typeof ref === "function") ref(innerRef.current);
      else if (ref)
        (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current =
          innerRef.current;
    }, [ref]);

    const widthStyle: string | undefined =
      width === "fill"
        ? undefined
        : width === "md"
        ? "var(--input-w-md)"
        : width === "lg"
        ? "var(--input-w-lg)"
        : `${width}px`;

    const rootClass = [
      styles.root,
      variantClass[variant],
      sizeClass[size],
      width === "fill" ? styles.fill : "",
      autoResize ? styles.autoResize : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const rootStyle: React.CSSProperties | undefined = widthStyle
      ? { width: widthStyle }
      : undefined;

    const count = currentValue.length;
    const over = maxLength != null && count > maxLength;

    const showHandle = !autoResize && !disabled && !readOnly;

    const control = (
      <div
        ref={rootRef}
        className={rootClass}
        style={rootStyle}
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        data-readonly={readOnly || undefined}
        onClick={(e) => {
          /* 핸들 클릭까지 focus로 넘기지 않도록 */
          if ((e.target as HTMLElement).dataset.textareaHandle) return;
          innerRef.current?.focus();
        }}
      >
        <textarea
          ref={innerRef}
          id={textareaId}
          className={styles.textarea}
          rows={rows}
          value={isControlled ? currentValue : undefined}
          defaultValue={isControlled ? undefined : defaultValue}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          maxLength={maxLength}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...props}
        />

        {showHandle && (
          <div
            className={styles.handle}
            data-textarea-handle="true"
            data-active={dragging || undefined}
            role="separator"
            aria-orientation="horizontal"
            aria-label="높이 조절"
            tabIndex={0}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            onKeyDown={onHandleKeyDown}
          />
        )}
      </div>
    );

    const footer = showCount ? (
      <div
        className={[styles.footer, over ? styles.countOver : ""]
          .filter(Boolean)
          .join(" ")}
      >
        {maxLength != null ? `${count} / ${maxLength}` : count}
      </div>
    ) : null;

    if (label == null && description == null && !hasWarning && !footer) {
      return (
        <>
          {control}
          {footer}
        </>
      );
    }

    const fieldStyle: React.CSSProperties | undefined = widthStyle
      ? { width: widthStyle }
      : undefined;

    return (
      <div
        className={styles.field}
        style={fieldStyle}
        data-disabled={disabled || undefined}
      >
        {label != null && (
          <label
            htmlFor={textareaId}
            className={[styles.label, labelSizeClass[size]].join(" ")}
          >
            {label}
            {required && (
              <span aria-hidden className={styles.requiredMark}>
                *
              </span>
            )}
          </label>
        )}

        {control}

        {footer}

        {hasWarning && (
          <p id={warningId} role="alert" className={styles.errorText}>
            <span className={styles.messageIcon} aria-hidden>
              <Icon name="warning-circle" size={14} />
            </span>
            {warning}
          </p>
        )}

        {description != null && !hasWarning && (
          <p id={descriptionId} className={styles.description}>
            <span className={styles.messageIcon} aria-hidden>
              <Icon name="info" size={14} />
            </span>
            {description}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
