import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { Avatar, type AvatarShape, type AvatarStatus } from "../Avatar";
import styles from "./TableCell.module.css";

export type TableCellAvatarProps = HTMLAttributes<HTMLSpanElement> & {
  /** 이미지 URL. 로드 실패 시 이니셜/아이콘 폴백. */
  src?: string;
  /** 이름 — 이니셜 추출·tint seed·aria 라벨 공용. */
  name?: string;
  /** 이니셜 직접 지정 — name보다 우선. */
  initials?: string;
  /** circle(기본, 사람) / rounded(팀·조직·봇). */
  shape?: AvatarShape;
  /** 접속 상태 뱃지. 미지정 시 뱃지 없음. */
  status?: AvatarStatus;
  /** 아바타 오른쪽 라벨 — 보통 name 재사용. 다른 표시가 필요하면 ReactNode로. */
  label?: ReactNode;
  /** 라벨 아래쪽 보조 텍스트 — 이메일·역할 등. */
  sublabel?: ReactNode;
};

export const TableCellAvatar = forwardRef<HTMLSpanElement, TableCellAvatarProps>(
  function TableCellAvatar(
    { className, src, name, initials, shape = "circle", status, label, sublabel, ...rest },
    ref,
  ) {
    const cls = [styles.base, styles.avatar, className ?? ""].filter(Boolean).join(" ");
    const resolvedLabel = label ?? name;
    return (
      <span ref={ref} className={cls} {...rest}>
        <Avatar size="md" shape={shape} src={src} name={name} initials={initials} status={status} />
        {(resolvedLabel != null || sublabel != null) && (
          <span className={styles.avatarText}>
            {resolvedLabel != null && <span className={styles.text}>{resolvedLabel}</span>}
            {sublabel != null && <span className={styles.avatarSublabel}>{sublabel}</span>}
          </span>
        )}
      </span>
    );
  },
);
