"use client";

import Link from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

import { Icon, type IconName } from "../Icon";

import styles from "./ChoiceCard.module.css";

export type ChoiceCardMode = "radio" | "checkbox" | "link";
export type ChoiceCardLayout = "vertical" | "horizontal";

type CommonProps = {
  /**
   * radio: 단일 선택 (RadioGroup으로 묶기).
   * checkbox: 다중 선택.
   * link: 네비게이션 카드 (`<a>` 렌더, href 필수, 선택 상태 없음).
   */
  mode?: ChoiceCardMode;
  /**
   * vertical: 아이콘 위·텍스트 아래 가운데 정렬 (온보딩·유저 타입 선택 등 페이지 중앙 큰 선택지).
   * horizontal: 아이콘 왼쪽·텍스트 오른쪽 좌측정렬 (문서 지도·설정 라우트 등 네비게이션 리스트).
   */
  layout?: ChoiceCardLayout;
  /**
   * IconName 문자열이면 기본 Icon을 렌더. ReactNode를 넘기면 그대로 슬롯에 꽂아
   * fill variant·커스텀 색 Icon·이미지·로고 등을 자유롭게 사용할 수 있다.
   * 생략 시 아이콘 영역 자체가 사라져 텍스트만 가운데/왼쪽 정렬.
   */
  icon?: IconName | ReactNode;
  title: ReactNode;
  description?: ReactNode;
};

type InputChoiceProps = CommonProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "title"> & {
    mode?: "radio" | "checkbox";
    href?: never;
  };

type LinkChoiceProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "title"> & {
    mode: "link";
    href: string;
  };

export type ChoiceCardProps = InputChoiceProps | LinkChoiceProps;

const ChoiceCard = forwardRef<HTMLInputElement | HTMLAnchorElement, ChoiceCardProps>(
  (props, ref) => {
    const {
      className,
      mode = "radio",
      layout = "vertical",
      icon,
      title,
      description,
    } = props;

    const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");
    const hasIcon = icon != null && icon !== false;

    const inner = (
      <>
        <span className={styles.surface} aria-hidden />
        <span className={styles.content}>
          {hasIcon && (
            <span className={styles.icon} aria-hidden>
              {typeof icon === "string" ? <Icon name={icon as IconName} /> : icon}
            </span>
          )}
          <span className={styles.text}>
            <span className={styles.title}>{title}</span>
            {description && (
              <span className={styles.description}>{description}</span>
            )}
          </span>
        </span>
      </>
    );

    if (mode === "link") {
      const { href, mode: _m, layout: _l, icon: _i, title: _t, description: _d, ...rest } =
        props as LinkChoiceProps;
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          className={rootClass}
          data-layout={layout}
          data-mode="link"
          {...rest}
        >
          {inner}
        </Link>
      );
    }

    const {
      mode: _m,
      layout: _l,
      icon: _i,
      title: _t,
      description: _d,
      disabled,
      ...rest
    } = props as InputChoiceProps;
    const inputType = mode === "checkbox" ? "checkbox" : "radio";

    return (
      <label
        className={rootClass}
        data-layout={layout}
        data-mode={mode}
        data-disabled={disabled ? "true" : "false"}
      >
        <input
          ref={ref as React.Ref<HTMLInputElement>}
          type={inputType}
          className={`${styles.input} visually-hidden`}
          disabled={disabled}
          {...rest}
        />
        {inner}
      </label>
    );
  },
);

ChoiceCard.displayName = "ChoiceCard";

export { ChoiceCard };
