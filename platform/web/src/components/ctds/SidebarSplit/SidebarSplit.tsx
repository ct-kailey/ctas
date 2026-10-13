"use client";

import {
  forwardRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { IconButton } from "../IconButton";
import { Icon } from "../Icon";
import { MenuItem } from "../MenuItem";
import styles from "./SidebarSplit.module.css";

/* Rail 항목 하나. rail에 icon-only 버튼으로 표시되고,
   활성화되면 오른쪽 panel에 panel 콘텐츠가 노출된다. */
export interface SidebarSplitSection {
  id: string;
  /** rail의 icon-only 버튼 아이콘. Icon 인스턴스. */
  icon: ReactNode;
  /** rail 버튼 aria-label + panel 헤더 타이틀. */
  label: string;
  /** panel 콘텐츠 (검색 인풋, 섹션, 서브 메뉴 등). */
  panel: ReactNode;
}

export interface SidebarSplitProps extends HTMLAttributes<HTMLElement> {
  /** rail 상단 로고 심볼. */
  brand?: ReactNode;
  /** rail 하단 footer 액션(설정/프로필 등). */
  railFooter?: ReactNode;
  /** rail에 나열될 섹션 목록. */
  sections: SidebarSplitSection[];
  /** panel 하단 고정 영역(프로필/설정 등). 모든 섹션에서 공통. */
  panelFooter?: ReactNode;
  /** controlled 활성 섹션 id. */
  activeId?: string;
  defaultActiveId?: string;
  onActiveChange?: (id: string) => void;
  /** controlled: panel 접힘 여부. false면 panel 숨김, rail만 노출. */
  panelOpen?: boolean;
  defaultPanelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
}

const SidebarSplit = forwardRef<HTMLElement, SidebarSplitProps>(function SidebarSplit(
  {
    brand,
    railFooter,
    sections,
    panelFooter,
    activeId: activeIdProp,
    defaultActiveId,
    onActiveChange,
    panelOpen: panelOpenProp,
    defaultPanelOpen = true,
    onPanelOpenChange,
    className,
    ...rest
  },
  ref,
) {
  const [activeIdState, setActiveIdState] = useState<string>(
    defaultActiveId ?? sections[0]?.id ?? "",
  );
  const activeId = activeIdProp ?? activeIdState;

  const [panelOpenState, setPanelOpenState] = useState<boolean>(defaultPanelOpen);
  const panelOpen = panelOpenProp ?? panelOpenState;

  const setActive = (id: string) => {
    setActiveIdState(id);
    onActiveChange?.(id);
  };
  const setPanelOpen = (v: boolean) => {
    setPanelOpenState(v);
    onPanelOpenChange?.(v);
  };

  const active = sections.find((s) => s.id === activeId);

  const rootClass = [styles.root, className ?? ""].filter(Boolean).join(" ");

  return (
    <nav
      ref={ref}
      className={rootClass}
      data-panel-open={panelOpen || undefined}
      aria-label="Sidebar"
      {...rest}
    >
      {/* Rail ─────────────────────────────────────── */}
      <div className={styles.rail}>
        {brand && <div className={styles.railBrand}>{brand}</div>}

        <div className={styles.railItems} role="tablist" aria-orientation="vertical">
          {sections.map((s) => (
            <IconButton
              key={s.id}
              variant={s.id === activeId ? "secondary" : "ghost"}
              size="lg"
              icon={s.icon}
              aria-label={s.label}
              aria-selected={s.id === activeId}
              role="tab"
              onClick={() => {
                setActive(s.id);
                if (!panelOpen) setPanelOpen(true);
              }}
            />
          ))}
        </div>

        {railFooter && <div className={styles.railFooter}>{railFooter}</div>}
      </div>

      {/* Panel ──────────────────────────────────────
          3영역: Header(sticky top) · Body(scroll) · Footer(sticky bottom). */}
      {panelOpen && active && (
        <div className={styles.panel} role="tabpanel" aria-label={active.label}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitle}>{active.label}</div>
            <IconButton
              variant="ghost"
              size="sm"
              icon={<Icon name="caret-left" />}
              aria-label="사이드바 접기"
              onClick={() => setPanelOpen(false)}
            />
          </div>
          <div className={styles.panelBody}>{active.panel}</div>
          {panelFooter && <div className={styles.panelFooter}>{panelFooter}</div>}
        </div>
      )}
    </nav>
  );
});

/* Panel 내부에서 쓰이는 sub-nav 조각들 ─────────────── */

function PanelSection({
  title,
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { title?: string }) {
  return (
    <div
      className={[styles.section, className ?? ""].filter(Boolean).join(" ")}
      role="group"
      aria-label={title}
      {...rest}
    >
      {title && (
        <MenuItem variant="section" size="sm">
          {title}
        </MenuItem>
      )}
      <div className={styles.sectionItems}>{children}</div>
    </div>
  );
}

/* Panel 안에서 쓰는 MenuItem wrapper. Sidebar.Item과 동일한 shape. */
export interface PanelItemProps {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  trailing?: ReactNode;
  shortcut?: string;
  hasSubmenu?: boolean;
  disabled?: boolean;
  asChild?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  children?: ReactNode;
}

const PanelItem = forwardRef<HTMLDivElement, PanelItemProps>(function PanelItem(
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
  return (
    <MenuItem
      ref={ref}
      size="md"
      active={active}
      disabled={disabled}
      asChild={asChild}
      leadingActions={icon ? [icon] : []}
      trailingActions={trailing ? [trailing] : []}
      shortcut={shortcut}
      hasSubmenu={hasSubmenu}
      onClick={onClick}
      aria-label={label}
    >
      {children ?? label}
    </MenuItem>
  );
});

/* Compound export ──────────────────────────────────── */
type SidebarSplitComponent = typeof SidebarSplit & {
  Section: typeof PanelSection;
  Item: typeof PanelItem;
};

const _SidebarSplit = SidebarSplit as SidebarSplitComponent;
_SidebarSplit.Section = PanelSection;
_SidebarSplit.Item = PanelItem;

export { _SidebarSplit as SidebarSplit };
