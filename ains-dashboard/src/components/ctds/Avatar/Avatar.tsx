"use client";

import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useState,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

import { Icon } from "../Icon";
import styles from "./Avatar.module.css";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarShape = "circle" | "rounded";
export type AvatarStatus = "online" | "offline";

export type AvatarProps = HTMLAttributes<HTMLSpanElement> & {
  size?: AvatarSize;
  /** circle(기본) — 사람·개인 계정. rounded — 팀·조직·봇·서비스 아이덴티티. */
  shape?: AvatarShape;
  /** 이미지 URL. 로드 실패 시 이니셜 또는 아이콘으로 폴백. */
  src?: string;
  /** 접근성 대체 텍스트. 이미지 alt이자 스크린리더 라벨. */
  alt?: string;
  /** 이름 문자열. src 없으면 여기서 이니셜 추출. */
  name?: string;
  /** 이니셜을 직접 지정. name보다 우선. */
  initials?: string;
  /** 이미지·이니셜 대신 아이콘. */
  icon?: ReactNode;
  /** 접속 상태 뱃지. online — 접속중, offline — 미접속. 미지정 시 뱃지 없음. */
  status?: AvatarStatus;
};

const sizeClass: Record<AvatarSize, string> = {
  xs: styles.xs,
  sm: styles.sm,
  md: styles.md,
  lg: styles.lg,
  xl: styles.xl,
};

const shapeClass: Record<AvatarShape, string> = {
  circle: styles.circle,
  rounded: styles.rounded,
};

const ICON_SIZE: Record<AvatarSize, number> = {
  xs: 10,
  sm: 14,
  md: 18,
  lg: 24,
  xl: 40,
};

/* 이름에서 이니셜 뽑기.
   - 한글은 첫 글자 1개 ("김희영" → "김")
   - 영문은 첫 단어의 앞 2글자: 대문자 + 소문자 ("Kim Heeyoung" → "Ki", "AB" → "Ab")
   - 실패 시 "?" */
function extractInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/[ㄱ-힣]/.test(trimmed[0])) return trimmed[0];
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (!first) return "?";
  return (first[0].toUpperCase() + (first[1] ?? "").toLowerCase()) || "?";
}

/* seed 문자열 → 0~7 안정적 해시.
   같은 이름이면 같은 색, 다른 이름은 되도록 다른 색. */
const TINT_COUNT = 10;
function tintIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % TINT_COUNT;
}

function sizedIcon(node: ReactNode, size: number): ReactNode {
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ size?: number | string }>;
  if (el.props.size !== undefined) return el;
  return cloneElement(el, { size });
}

const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  (
    { className, size = "md", shape = "circle", src, alt, name, initials, icon, status, style, ...rest },
    ref,
  ) => {
    /* 이미지는 로드 완료 전까진 감추고 이니셜/아이콘을 아래에 깔아둔다.
       onError로 실패 감지도 하지만, 드물게 발동 안 하는 케이스(DNS 실패 등)에 대비해
       "성공했을 때만 이미지 표시" 전략으로 폴백 UI가 항상 안전. */
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgFailed, setImgFailed] = useState(false);

    const cls = [styles.root, sizeClass[size], shapeClass[shape], className ?? ""]
      .filter(Boolean)
      .join(" ");

    const hasUsableImage = src && !imgFailed;
    const resolvedInitials = initials ?? (name ? extractInitials(name) : undefined);
    const ariaLabel = alt ?? name;

    const tintSeed = resolvedInitials
      ? (name ?? initials ?? resolvedInitials)
      : undefined;
    const tintStyle: React.CSSProperties | undefined = tintSeed
      ? {
          ["--_avatar-bg" as string]: `var(--avatar-tint-${tintIndex(tintSeed)}-bg)`,
          ["--_avatar-fg" as string]: `var(--avatar-tint-${tintIndex(tintSeed)}-fg)`,
        }
      : undefined;

    return (
      <span
        ref={ref}
        className={cls}
        role="img"
        aria-label={ariaLabel}
        style={{ ...tintStyle, ...style }}
        {...rest}
      >
        {resolvedInitials ? (
          <span className={styles.initials} aria-hidden>
            {resolvedInitials}
          </span>
        ) : icon ? (
          <span className={styles.icon} aria-hidden>
            {sizedIcon(icon, ICON_SIZE[size])}
          </span>
        ) : (
          <span className={styles.icon} aria-hidden>
            <Icon name="user" size={ICON_SIZE[size]} />
          </span>
        )}
        {hasUsableImage && (
          <img
            className={styles.image}
            src={src}
            alt=""
            data-loaded={imgLoaded ? "true" : "false"}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
          />
        )}
        {status && (
          <span
            className={styles.status}
            data-status={status}
            aria-label={status === "online" ? "접속중" : "미접속"}
          />
        )}
      </span>
    );
  },
);

Avatar.displayName = "Avatar";

/* ── AvatarGroup ──────────────────────────────────────────
   여러 Avatar를 겹쳐 표시. max로 잘라내고 나머지는 "+N" 카운터로. */
export type AvatarGroupProps = HTMLAttributes<HTMLSpanElement> & {
  size?: AvatarSize;
  shape?: AvatarShape;
  /** 넘치면 카운터로 접힘. */
  max?: number;
  children: ReactNode;
};

const AvatarGroup = forwardRef<HTMLSpanElement, AvatarGroupProps>(
  ({ className, size = "md", shape = "circle", max, children, ...rest }, ref) => {
    const all = Children.toArray(children).filter(isValidElement) as ReactElement<AvatarProps>[];
    const visible = max !== undefined ? all.slice(0, max) : all;
    const overflow = max !== undefined ? all.length - visible.length : 0;

    const cls = [styles.group, sizeClass[size], className ?? ""]
      .filter(Boolean)
      .join(" ");

    const total = visible.length + (overflow > 0 ? 1 : 0);

    return (
      <span ref={ref} className={cls} {...rest}>
        {visible.map((child, i) =>
          cloneElement(child, {
            key: child.key ?? i,
            size,
            shape,
            className: [styles.groupItem, child.props.className ?? ""].filter(Boolean).join(" "),
            style: {
              ...(child.props.style ?? {}),
              ["--stack-order" as string]: total - i,
            },
          }),
        )}
        {overflow > 0 && (
          <span
            className={[
              styles.root,
              sizeClass[size],
              shapeClass[shape],
              styles.groupItem,
              styles.overflow,
            ]
              .filter(Boolean)
              .join(" ")}
            role="img"
            aria-label={`외 ${overflow}명`}
          >
            <span className={styles.initials} aria-hidden>
              +{overflow}
            </span>
          </span>
        )}
      </span>
    );
  },
);

AvatarGroup.displayName = "AvatarGroup";

export { Avatar, AvatarGroup };
