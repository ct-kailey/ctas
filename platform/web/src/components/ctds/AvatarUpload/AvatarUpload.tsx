"use client";

import {
  forwardRef,
  useRef,
  type ChangeEvent,
  type HTMLAttributes,
  type MouseEvent,
} from "react";

import { Avatar, type AvatarShape, type AvatarSize } from "../Avatar";
import { Icon } from "../Icon";
import styles from "./AvatarUpload.module.css";

export type AvatarUploadProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  size?: AvatarSize;
  shape?: AvatarShape;
  /** 현재 이미지 URL. 없으면 이니셜/아이콘으로 폴백. */
  src?: string;
  /** 이니셜 추출·접근성 라벨용. */
  name?: string;
  /** 접근성 라벨 (name보다 우선). */
  alt?: string;
  /** 파일 선택 시 호출. */
  onChange?: (file: File) => void;
  /** 있으면 src가 있을 때만 X 버튼 렌더. 클릭 시 호출. */
  onRemove?: () => void;
  /** 허용 MIME. 기본 image/*. */
  accept?: string;
  disabled?: boolean;
  /** hover 오버레이 라벨. 기본 "사진 변경". */
  editLabel?: string;
  /** 삭제 버튼 aria-label. 기본 "사진 제거". */
  removeLabel?: string;
};

const AvatarUpload = forwardRef<HTMLDivElement, AvatarUploadProps>(
  (
    {
      className,
      size = "xl",
      shape = "circle",
      src,
      name,
      alt,
      onChange,
      onRemove,
      accept = "image/*",
      disabled = false,
      editLabel = "사진 변경",
      removeLabel = "사진 제거",
      ...rest
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const openPicker = () => {
      if (disabled) return;
      inputRef.current?.click();
    };

    const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onChange?.(file);
      /* 같은 파일 재선택도 change 이벤트가 발생하도록 리셋 */
      e.target.value = "";
    };

    const handleRemove = (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onRemove?.();
    };

    const cls = [
      styles.root,
      styles[size],
      shape === "rounded" ? styles.rounded : styles.circle,
      disabled ? styles.disabled : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={cls} {...rest}>
        <button
          type="button"
          className={styles.trigger}
          onClick={openPicker}
          disabled={disabled}
          aria-label={editLabel}
        >
          <Avatar size={size} shape={shape} src={src} name={name} alt={alt} />
          <span className={styles.overlay} aria-hidden>
            <Icon name="camera" size={overlayIconSize(size)} />
          </span>
        </button>

        {src && onRemove && (
          <button
            type="button"
            className={styles.remove}
            onClick={handleRemove}
            disabled={disabled}
            aria-label={removeLabel}
          >
            <Icon name="x" size={removeIconSize(size)} />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className={styles.input}
          onChange={handleFile}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden
        />
      </div>
    );
  },
);

AvatarUpload.displayName = "AvatarUpload";

/* 오버레이 카메라는 Avatar 아이콘보다 조금 작게 — 반쪽 영역에 얹히므로
   Avatar 정중앙 아이콘과 같은 크기면 답답해 보인다. */
function overlayIconSize(size: AvatarSize): number {
  return { xs: 8, sm: 10, md: 14, lg: 18, xl: 24 }[size];
}

function removeIconSize(size: AvatarSize): number {
  return { xs: 8, sm: 10, md: 12, lg: 14, xl: 16 }[size];
}

export { AvatarUpload };
