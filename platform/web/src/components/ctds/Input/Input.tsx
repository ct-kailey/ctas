"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";

import { Icon } from "../Icon";
import { IconButton, type IconButtonSize } from "../IconButton";
import styles from "./Input.module.css";

export type InputSize = "sm" | "md" | "lg";
export type InputVariant = "outline" | "filled" | "line";
/**
 * 가로 폭 정책.
 * - "fill"(기본): 부모 폭을 채운다. 폼 필드 실전 기본.
 * - "md" | "lg": 권장 폭 토큰(--input-w-md=280px · --input-w-lg=400px)에 고정.
 *   카드/툴바 안에서 여러 필드의 폭을 규격화할 때.
 * - number: 임의 픽셀 폭. 예외적으로만 사용.
 * sm 사이즈용 폭 토큰은 두지 않는다 — 좁은 필드는 부모 컨테이너 폭으로 통제하는 게 자연스러움.
 */
export type InputWidth = "fill" | "md" | "lg" | number;

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix" | "width"> {
  size?: InputSize;
  variant?: InputVariant;
  /** 폼 검증 실패. aria-invalid + 시각 피드백. warning이 있으면 자동으로 true. */
  invalid?: boolean;
  /** 왼쪽/오른쪽 아이콘 (input 안쪽, 클릭 불가) */
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /** 왼쪽/오른쪽 짧은 텍스트 (예: "$", "USD", "kg") */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** X 버튼으로 clear. value가 있어야 나타남. controlled 전용. */
  clearable?: boolean;
  onClear?: () => void;
  /** password 토글 아이콘 자동 노출 (type="password"에 부착) */
  passwordToggle?: boolean;
  /** 커스텀 우측 액션 (예: 버튼). rightIcon보다 우선. */
  rightAction?: ReactNode;
  /** 가로 폭. 기본 "fill" (부모 폭 채움). "md"=280px · "lg"=400px · number=px. */
  width?: InputWidth;
  /** 라벨 텍스트. 있으면 <label>이 위에 렌더링되고 aria로 자동 연결. */
  label?: ReactNode;
  /** 중립 톤의 설명 메시지. 인풋 아래 표시. */
  description?: ReactNode;
  /** 경고 메시지. 있으면 invalid로 취급되어 보더가 destructive로 바뀐다. */
  warning?: ReactNode;
  /** Native-input adapters may bypass wrapper interactions without changing existing consumers. */
  inputRef?: Ref<HTMLInputElement>;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

const WRAPPER_EVENT_KEYS = [
  "onClick",
  "onMouseDown",
  "onMouseUp",
  "onPointerDown",
  "onPointerUp",
  "onKeyDown",
  "onKeyUp",
  "onFocus",
  "onBlur",
] as const;

const WRAPPER_A11Y_KEYS = [
  "role",
  "tabIndex",
  "style",
  "aria-haspopup",
  "aria-expanded",
  "aria-controls",
  "aria-label",
  "data-state",
] as const;

const sizeClass: Record<InputSize, string> = {
  sm: styles.sizeSm,
  md: styles.sizeMd,
  lg: styles.sizeLg,
};

const variantClass: Record<InputVariant, string> = {
  outline: styles.outline,
  filled: styles.filled,
  line: styles.line,
};

const labelSizeClass: Record<InputSize, string> = {
  sm: styles.labelSm,
  md: styles.labelMd,
  lg: styles.labelLg,
};

const iconButtonSizeFor: Record<InputSize, IconButtonSize> = {
  sm: "sm",
  md: "sm",
  lg: "md",
};

export const Input = forwardRef<HTMLElement, InputProps>(
  (
    {
      className,
      size = "md",
      variant = "outline",
      invalid: invalidProp,
      leftIcon,
      rightIcon,
      prefix,
      suffix,
      clearable = false,
      onClear,
      passwordToggle = false,
      rightAction,
      width = "fill",
      type = "text",
      disabled,
      readOnly,
      required,
      value,
      defaultValue,
      onChange,
      id,
      label,
      description,
      warning,
      inputRef,
      inputProps,
      ...props
    },
    ref
  ) => {
    const innerRef = useRef<HTMLInputElement>(null);
    const setInputRef = useCallback((node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof inputRef === "function") inputRef(node);
      else if (inputRef) inputRef.current = node;
    }, [inputRef]);

    const hasWarning = warning != null && warning !== false;
    const invalid = invalidProp ?? hasWarning;

    const autoId = useId();
    const inputId = id ?? autoId;
    const descriptionId = description != null ? `${inputId}-desc` : undefined;
    const warningId = hasWarning ? `${inputId}-warn` : undefined;
    const describedBy =
      [warningId, descriptionId].filter(Boolean).join(" ") || undefined;

    const wrapperProps: Record<string, unknown> = {};
    for (const key of WRAPPER_EVENT_KEYS) {
      if (key in props) {
        wrapperProps[key] = (props as Record<string, unknown>)[key];
        delete (props as Record<string, unknown>)[key];
      }
    }
    for (const key of WRAPPER_A11Y_KEYS) {
      if (key in props) {
        wrapperProps[key] = (props as Record<string, unknown>)[key];
        delete (props as Record<string, unknown>)[key];
      }
    }
    const wrapperClick = wrapperProps.onClick as
      | ((e: MouseEvent<HTMLDivElement>) => void)
      | undefined;
    const wrapperKeyDown = wrapperProps.onKeyDown as
      | ((e: KeyboardEvent<HTMLDivElement>) => void)
      | undefined;
    const isInteractive =
      Boolean(wrapperProps.role) || WRAPPER_EVENT_KEYS.some((k) => k in wrapperProps);

    const [uncontrolledValue, setUncontrolledValue] = useState<string>(
      String(defaultValue ?? "")
    );
    const [passwordVisible, setPasswordVisible] = useState(false);

    const isControlled = value !== undefined;
    const currentValue = isControlled ? String(value ?? "") : uncontrolledValue;
    const hasValue = currentValue.length > 0;

    useEffect(() => {
      const input = innerRef.current, form = input?.form;
      if (!input || !form || isControlled) return;
      const reset = (event: Event) => queueMicrotask(() => {
        if (!event.defaultPrevented && input.isConnected) setUncontrolledValue(input.value);
      });
      form.addEventListener("reset", reset);
      return () => form.removeEventListener("reset", reset);
    }, [isControlled, props.form, inputProps?.form]);

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        if (!isControlled) setUncontrolledValue(e.target.value);
        onChange?.(e);
      },
      [isControlled, onChange]
    );

    const handleClear = useCallback(() => {
      if (!isControlled) setUncontrolledValue("");
      onClear?.();
      innerRef.current?.focus();
    }, [isControlled, onClear]);

    const effectiveType =
      passwordToggle && type === "password" && passwordVisible ? "text" : type;

    const showClear = clearable && hasValue && !disabled && !readOnly;
    const showPasswordToggle = passwordToggle && type === "password" && !disabled;

    /* width 정책 — "fill"은 부모 폭 채움(기본), "md"/"lg"는 토큰 폭, number는 px.
       "fill" 이외에는 inline style로 지정해 CSS의 확장 여지를 열어둔다.
       widthStyle이 있으면 폼 필드 래퍼(.field)에도 같은 값이 필요 — 아래에서 fieldStyle로 합침. */
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
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    const mergedStyle: React.CSSProperties | undefined = widthStyle
      ? { ...(wrapperProps.style as React.CSSProperties | undefined), width: widthStyle }
      : (wrapperProps.style as React.CSSProperties | undefined);

    const control = (
      <div
        {...wrapperProps}
        data-ctds="input"
        ref={ref as React.Ref<HTMLDivElement>}
        className={rootClass}
        style={mergedStyle}
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        data-readonly={readOnly || undefined}
        tabIndex={
          isInteractive
            ? (wrapperProps.tabIndex as number | undefined) ?? 0
            : (wrapperProps.tabIndex as number | undefined)
        }
        onClick={(e) => {
          wrapperClick?.(e);
          if (!isInteractive) innerRef.current?.focus();
        }}
        onKeyDown={wrapperKeyDown}
      >
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        {leftIcon && (
          <span className={styles.icon} aria-hidden>
            {leftIcon}
          </span>
        )}

        <input
          ref={setInputRef}
          data-ctds-control="input"
          id={inputId}
          className={styles.input}
          type={effectiveType}
          value={isControlled ? currentValue : undefined}
          defaultValue={isControlled ? undefined : defaultValue}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...(isInteractive
            ? { tabIndex: -1, style: { pointerEvents: "none" } }
            : {})}
          {...props}
          {...inputProps}
        />

        {clearable && !disabled && !readOnly && (
          /* 항상 렌더 — data-visible 토글로 opacity/scale 트랜지션 (Input.module.css).
             wrapper에 transform(scale)·opacity를, 내부 IconButton엔 자체 press transform을
             분리해 담아 두 애니메이션이 서로 덮지 않도록 한다. */
          <span
            className={`${styles.trailingBtn} ${styles.clearBtn}`}
            data-visible={showClear || undefined}
            aria-hidden={!showClear || undefined}
          >
            <IconButton
              data-ctds="button"
              size={iconButtonSizeFor[size]}
              icon={<Icon name="x" />}
              aria-label="지우기"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            />
          </span>
        )}

        {showPasswordToggle && (
          <IconButton
            data-ctds="button"
            size={iconButtonSizeFor[size]}
            icon={<Icon name={passwordVisible ? "eye-slash" : "eye"} />}
            aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
            tabIndex={-1}
            className={styles.trailingBtn}
            onClick={(e) => {
              e.stopPropagation();
              setPasswordVisible((v) => !v);
            }}
          />
        )}

        {rightAction
          ? <span className={styles.actionSlot}>{rightAction}</span>
          : rightIcon && (
            <span className={styles.icon} aria-hidden>
              {rightIcon}
            </span>
          )}

        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
    );

    if (label == null && description == null && !hasWarning) {
      return control;
    }

    /* field 래퍼도 같은 폭을 이어받아야 label · description · warning 라인이 control과 정렬된다.
       width="fill"이면 field 자체는 100% (styles.field는 min-width:0만 갖고 별도 폭이 없어
       부모 폭을 따르는 게 자연스러움). 지정 폭이면 그 값을 얹는다. */
    const fieldStyle: React.CSSProperties | undefined = widthStyle
      ? { width: widthStyle }
      : undefined;

    return (
      <div className={styles.field} style={fieldStyle} data-disabled={disabled || undefined}>
        {label != null && (
          <label
            htmlFor={inputId}
            className={[styles.label, labelSizeClass[size]].join(" ")}
          >
            {label}
            {required && (
              <span aria-hidden className={styles.requiredMark}>*</span>
            )}
          </label>
        )}

        {control}

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

Input.displayName = "Input";
