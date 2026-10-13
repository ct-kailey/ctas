"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, type ChangeEvent } from "react";
import styles from "./Onboarding.module.css";

type SidebarMode = "left" | "right" | "dual" | "none";
type LogoKind = "symbol" | "combination";

type LayoutPreset = {
  id: string;
  label: string;
  sidebar: SidebarMode;
  topbar: boolean;
};

const LAYOUT_PRESETS: LayoutPreset[] = [
  { id: "sidebar-only", label: "사이드바만", sidebar: "left", topbar: false },
  { id: "topbar-only", label: "탑바만", sidebar: "none", topbar: true },
  { id: "sidebar-topbar", label: "사이드바 + 탑바", sidebar: "left", topbar: true },
  { id: "dual-sidebar", label: "양쪽 사이드바", sidebar: "dual", topbar: true },
  { id: "none", label: "레이아웃 없음", sidebar: "none", topbar: false },
];

export function LayoutBuilder() {
  const [presetId, setPresetId] = useState<string>("sidebar-topbar");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoKind, setLogoKind] = useState<LogoKind>("symbol");
  const [serviceName, setServiceName] = useState("Acme");

  const preset =
    LAYOUT_PRESETS.find((p) => p.id === presetId) ?? LAYOUT_PRESETS[0];

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setLogoUrl(url);
  };

  return (
    <div className={styles.layoutGrid}>
      <div className={styles.layoutOptions}>
        <div className={styles.optionGroup}>
          <span className={styles.optionGroupLabel}>레이아웃 프리셋</span>
          <div className={styles.optionList}>
            {LAYOUT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={styles.optionItem}
                data-active={p.id === presetId || undefined}
                onClick={() => setPresetId(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.optionGroup}>
          <span className={styles.optionGroupLabel}>로고 업로드</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            className={styles.fieldControl}
          />
        </div>

        <div className={styles.optionGroup}>
          <span className={styles.optionGroupLabel}>로고 타입</span>
          <div className={styles.optionList}>
            <button
              type="button"
              className={styles.optionItem}
              data-active={logoKind === "symbol" || undefined}
              onClick={() => setLogoKind("symbol")}
            >
              심볼 (파비콘 + 서비스명)
            </button>
            <button
              type="button"
              className={styles.optionItem}
              data-active={logoKind === "combination" || undefined}
              onClick={() => setLogoKind("combination")}
            >
              콤비네이션 (로고 이미지만)
            </button>
          </div>
        </div>

        {logoKind === "symbol" && (
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="onboarding-service">
              서비스 이름
            </label>
            <input
              id="onboarding-service"
              type="text"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className={styles.fieldControl}
            />
          </div>
        )}
      </div>

      <div
        className={styles.mini}
        data-sidebar={preset.sidebar}
        data-topbar={preset.topbar}
      >
        {preset.topbar && (
          <div className={styles.miniTopbar}>
            {logoUrl && logoKind === "symbol" && (
              <>
                <img
                  src={logoUrl}
                  alt=""
                  className={styles.miniBrandSymbol}
                />
                <span className={styles.miniBrand}>{serviceName}</span>
              </>
            )}
            {logoUrl && logoKind === "combination" && (
              <img src={logoUrl} alt={serviceName} className={styles.miniBrandImg} />
            )}
            {!logoUrl && <span className={styles.miniBrand}>{serviceName}</span>}
          </div>
        )}

        {(preset.sidebar === "left" || preset.sidebar === "dual") && (
          <aside className={styles.miniSidebar}>
            <span className={styles.miniNavItem} data-active>
              Inbox
            </span>
            <span className={styles.miniNavItem}>Issues</span>
            <span className={styles.miniNavItem}>Projects</span>
            <span className={styles.miniNavItem}>Docs</span>
          </aside>
        )}

        <div className={styles.miniBody}>
          {preset.sidebar === "none" && preset.topbar === false
            ? "레이아웃 없음 — 순수 콘텐츠"
            : "여기에 페이지 콘텐츠가 위치합니다."}
        </div>

        {preset.sidebar === "dual" && (
          <aside className={`${styles.miniSidebar} ${styles.miniSidebarRight}`}>
            <span className={styles.miniNavItem}>Details</span>
            <span className={styles.miniNavItem}>Activity</span>
          </aside>
        )}
      </div>
    </div>
  );
}
