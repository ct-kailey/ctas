"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { type AvatarProps } from "../Avatar";
import { IdentityButton } from "../IdentityButton";
import { MenuItem, type MenuItemAction } from "../MenuItem";
import styles from "./Sidebar.module.css";

/* Context — collapsed 상태를 하위 Item/Section에 흘려보냄.
   bodyOverflow는 Body가 스크롤 가능할 때(=메뉴가 많을 때) true. Footer가
   읽어서 Body와 자기 사이에 hairline을 켠다 — 평상시엔 선 없음. */
interface SidebarCtx {
  collapsed: boolean;
  bodyOverflow: boolean;
  setBodyOverflow: (v: boolean) => void;
}
const SidebarContext = createContext<SidebarCtx>({
  collapsed: false,
  bodyOverflow: false,
  setBodyOverflow: () => {},
});
const useSidebar = () => useContext(SidebarContext);

/* Root ─────────────────────────────────────────────── */
export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** true면 icon-only 축소 상태. label 숨기고 폭 축소. */
  collapsed?: boolean;
}

const SidebarRoot = forwardRef<HTMLElement, SidebarProps>(function SidebarRoot(
  { collapsed = false, className, children, ...rest },
  ref,
) {
  const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");
  const [bodyOverflow, setBodyOverflow] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, bodyOverflow, setBodyOverflow }}>
      <nav
        ref={ref}
        className={rootClass}
        data-collapsed={collapsed || undefined}
        aria-label="Sidebar"
        {...rest}
      >
        {children}
      </nav>
    </SidebarContext.Provider>
  );
});

/* Header ───────────────────────────────────────────── */
function SidebarHeader({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar-slot="header"
      className={[styles.header, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Body ─────────────────────────────────────────────────
   Header와 Footer 사이의 세로 스크롤 영역.
   여러 개를 두면 각각 독립적인 스크롤 트랙이 됨.
   ResizeObserver로 scrollHeight > clientHeight 감지 → Footer가 자동으로
   상단 hairline을 켬. 메뉴가 적으면 선 없음, 많으면 자연스럽게 분리선 등장.

   fade: 스크롤 트랙 상/하단 소프트 fade mask. "top" | "bottom" | "both" | "none".
   기본 "none" — 켤 때만 켠다(소비처가 Body 안에 고정 상단 블록을 두면 top fade가
   그 블록을 깎아 "흰 입체 바" 착시를 만드므로 opt-in). */
export interface SidebarBodyProps extends HTMLAttributes<HTMLDivElement> {
  fade?: "top" | "bottom" | "both" | "none";
}

function SidebarBody({ children, className, fade = "none", ...rest }: SidebarBodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { setBodyOverflow } = useSidebar();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setBodyOverflow(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // 내부 섹션이 추가/제거될 때도 반응
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [setBodyOverflow]);

  return (
    <div
      ref={ref}
      data-sidebar-slot="body"
      data-fade={fade !== "none" ? fade : undefined}
      className={[styles.body, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Brand ────────────────────────────────────────────────
   Home 링크 자리. symbol(항상 표시) + wordmark(expanded 시에만).
   wordmark는 ReactNode(로고 SVG) 또는 string(텍스트 워드마크) 아무거나.
   크기는 상한선(--sidebar-brand-symbol-max, --sidebar-brand-wordmark-max)까지
   사용처가 자유롭게 조절 — symbol/wordmark 안에서 own width/height 지정. */
export interface SidebarBrandProps extends HTMLAttributes<HTMLDivElement> {
  symbol: ReactNode;
  wordmark?: ReactNode;
}

function SidebarBrand({ symbol, wordmark, className, ...rest }: SidebarBrandProps) {
  const { collapsed } = useSidebar();
  return (
    <div
      data-sidebar-slot="brand"
      className={[styles.brand, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <div className={styles.brandSymbol}>{symbol}</div>
      {!collapsed && wordmark && (
        <div className={styles.brandWordmark}>{wordmark}</div>
      )}
    </div>
  );
}

/* Footer ─────────────────────────────────────────────────
   data-overflow — Body가 스크롤 가능할 때만 true. CSS가 이걸 보고 상단
   hairline을 켜서 "메뉴가 많아 스크롤이 생길 때" 자연스럽게 분리선 등장. */
function SidebarFooter({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const { bodyOverflow } = useSidebar();
  return (
    <div
      data-sidebar-slot="footer"
      className={[styles.footer, className ?? ""].filter(Boolean).join(" ")}
      data-overflow={bodyOverflow || undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

/* Profile ──────────────────────────────────────────────
   사이드바 하단 사용자 식별 영역.
   [[components/identity-button]]의 preset 래퍼 — Avatar + 2줄 라벨 + trailing 뼈대 공유.
   사이즈·간격·폰트는 MenuItem md 리듬에 맞춰 통일 — 인라인 스타일로 조립 금지. */
export interface SidebarProfileProps {
  name: string;
  sub?: ReactNode;
  /** Avatar에 그대로 패스스루. src/initials/icon/status 등 자유롭게. */
  avatar?: Omit<AvatarProps, "size" | "name" | "alt">;
  /** 오른쪽 끝 보조 UI(IconButton 등). collapsed일 땐 숨김. */
  trailing?: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

function SidebarProfile({
  name,
  sub,
  avatar,
  trailing,
  className,
  onClick,
}: SidebarProfileProps) {
  const { collapsed } = useSidebar();
  return (
    <IdentityButton
      size="md"
      variant="ghost"
      avatar={avatar}
      name={name}
      sub={sub}
      trailing={trailing}
      collapsed={collapsed}
      className={[styles.profile, className ?? ""].filter(Boolean).join(" ")}
      aria-label={collapsed ? name : undefined}
      onClick={onClick}
      data-sidebar-slot="profile"
    />
  );
}

/* Section ──────────────────────────────────────────── */
export interface SidebarSectionProps extends HTMLAttributes<HTMLDivElement> {
  /** 섹션 제목. collapsed일 땐 숨김. */
  title?: string;
}

function SidebarSection({ title, className, children, ...rest }: SidebarSectionProps) {
  const { collapsed } = useSidebar();
  return (
    <div
      data-sidebar-slot="section"
      className={[styles.section, className ?? ""].filter(Boolean).join(" ")}
      role="group"
      aria-label={title}
      {...rest}
    >
      {title && !collapsed && (
        <MenuItem variant="section" size="sm">
          {title}
        </MenuItem>
      )}
      <div className={styles.sectionItems}>{children}</div>
    </div>
  );
}

/* Separator ────────────────────────────────────────── */
function SidebarSeparator({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-sidebar-slot="separator"
      role="separator"
      className={[styles.separator, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}

/* Item ─────────────────────────────────────────────── */
export interface SidebarItemProps {
  /** 왼쪽 아이콘. Icon 컴포넌트 인스턴스. */
  icon?: ReactNode;
  /** 항목 라벨. collapsed일 땐 aria-label로만 남고 시각적으로 숨김. */
  label: string;
  /** 현재 라우트/선택. MenuItem의 active와 동일. */
  active?: boolean;
  /** 오른쪽 배지/카운트/보조 UI. collapsed일 땐 숨김. */
  trailing?: ReactNode;
  /** 오른쪽 끝 단축키 힌트. collapsed일 땐 숨김. */
  shortcut?: string;
  /** 서브메뉴 화살표. */
  hasSubmenu?: boolean;
  /** 비활성. */
  disabled?: boolean;
  /** Radix Slot 위임 — <Link>, <a> 등 감싸기용. */
  asChild?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}

const SidebarItem = forwardRef<HTMLDivElement, SidebarItemProps>(function SidebarItem(
  {
    icon,
    label,
    active,
    trailing,
    shortcut,
    hasSubmenu,
    disabled,
    asChild,
    onClick,
    children,
  },
  ref,
) {
  const { collapsed } = useSidebar();

  const leadingActions: MenuItemAction[] = icon ? [icon] : [];
  const trailingActions: MenuItemAction[] = trailing ? [trailing] : [];

  /* ellipsis 시 Tooltip, collapsed 시 항상 Tooltip은 MenuItem이 자체 처리.
     children을 넘기면 복잡 ReactNode라 Tooltip이 안 뜰 수 있으므로, 평문 라벨만 있을 땐
     label 문자열을 그대로 children으로 흘려 MenuItem이 안전하게 Tooltip 콘텐츠를 결정하게 함. */
  return (
    <MenuItem
      ref={ref}
      size="md"
      active={active}
      disabled={disabled}
      asChild={asChild}
      collapsed={collapsed}
      truncateTooltip
      leadingActions={leadingActions}
      trailingActions={trailingActions}
      shortcut={shortcut}
      hasSubmenu={hasSubmenu}
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
    >
      {children ?? label}
    </MenuItem>
  );
});

/* Compound export ──────────────────────────────────── */
type SidebarComponent = typeof SidebarRoot & {
  Header: typeof SidebarHeader;
  Body: typeof SidebarBody;
  Brand: typeof SidebarBrand;
  Footer: typeof SidebarFooter;
  Profile: typeof SidebarProfile;
  Section: typeof SidebarSection;
  Separator: typeof SidebarSeparator;
  Item: typeof SidebarItem;
};

const Sidebar = SidebarRoot as SidebarComponent;
Sidebar.Header = SidebarHeader;
Sidebar.Body = SidebarBody;
Sidebar.Brand = SidebarBrand;
Sidebar.Footer = SidebarFooter;
Sidebar.Profile = SidebarProfile;
Sidebar.Section = SidebarSection;
Sidebar.Separator = SidebarSeparator;
Sidebar.Item = SidebarItem;

export { Sidebar };
