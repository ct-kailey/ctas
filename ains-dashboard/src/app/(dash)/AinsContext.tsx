"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ALERTS, type Alert, type Draft } from "@/lib/mock";
import { DraftModal } from "./DraftModal";
import { IntakeModal } from "./IntakeModal";

/**
 * 대시보드 전역 상태 — 알림 목록, 메일 초안 창, 자료 넣기 창.
 * 프리뷰라 새로고침하면 처음 상태로 돌아간다.
 */

type DraftTarget = { draft: Draft; alertId?: string };

type AinsContextValue = {
  alerts: Alert[];
  resolveAlert: (id: string) => void;
  addAlert: (alert: Alert) => void;
  openDraft: (draft: Draft, alertId?: string) => void;
  openIntake: (projectId?: string) => void;
};

const AinsContext = createContext<AinsContextValue | null>(null);

export function useAins() {
  const ctx = useContext(AinsContext);
  if (!ctx) throw new Error("useAins는 AinsProvider 안에서만 쓸 수 있어요");
  return ctx;
}

export function AinsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>(ALERTS);
  const [draftTarget, setDraftTarget] = useState<DraftTarget | null>(null);
  const [intake, setIntake] = useState<{ open: boolean; projectId?: string }>({
    open: false,
  });

  const resolveAlert = useCallback((id: string) => {
    setAlerts((list) => list.filter((a) => a.id !== id));
  }, []);

  const addAlert = useCallback((alert: Alert) => {
    setAlerts((list) => [alert, ...list]);
  }, []);

  const openDraft = useCallback((draft: Draft, alertId?: string) => {
    setDraftTarget({ draft, alertId });
  }, []);

  const openIntake = useCallback((projectId?: string) => {
    setIntake({ open: true, projectId });
  }, []);

  const value = useMemo(
    () => ({ alerts, resolveAlert, addAlert, openDraft, openIntake }),
    [alerts, resolveAlert, addAlert, openDraft, openIntake],
  );

  return (
    <AinsContext.Provider value={value}>
      {children}
      <DraftModal
        target={draftTarget}
        onClose={() => setDraftTarget(null)}
        onSent={(alertId) => {
          if (alertId) resolveAlert(alertId);
          setDraftTarget(null);
        }}
      />
      <IntakeModal
        open={intake.open}
        initialProjectId={intake.projectId}
        onOpenChange={(open) => setIntake((s) => ({ ...s, open }))}
      />
    </AinsContext.Provider>
  );
}
