"use client";

import { useState } from "react";

import { EmptyState, Tabs } from "@/components/ctds";
import { GRADE, GRADES, type Grade } from "@/lib/mock";
import { useAins } from "../AinsContext";
import { AlertRow } from "../AlertRow";
import s from "../page.module.css";

const ORDER: Record<Grade, number> = { urgent: 0, check: 1, info: 2 };

export default function AlertsPage() {
  const { alerts } = useAins();
  const [filter, setFilter] = useState<"all" | Grade>("all");

  const list = (filter === "all" ? alerts : alerts.filter((a) => a.grade === filter))
    .slice()
    .sort((a, b) => ORDER[a.grade] - ORDER[b.grade]);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>알림함</h1>
        <p className={s.subtitle}>
          등급은 팀이 정한 알림 기준에 따라 자동으로 붙어요. 등급이 이상하면 화면에서 바꾸지 말고
          기준을 고쳐 주세요.
        </p>
      </header>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <Tabs.List aria-label="등급">
          <Tabs.Trigger value="all">전체 {alerts.length}</Tabs.Trigger>
          {GRADES.map((g) => (
            <Tabs.Trigger key={g} value={g}>
              {GRADE[g].label} {alerts.filter((a) => a.grade === g).length}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs>

      {list.length === 0 ? (
        <div className={s.panel}>
          <EmptyState
            size="sm"
            icon="check-circle"
            title="알림이 없어요"
            description="처리한 알림은 여기서 사라져요."
          />
        </div>
      ) : (
        <div className={s.flush}>
          {list.map((a) => (
            <div key={a.id} className={s.listRow}>
              <AlertRow alert={a} controls />
            </div>
          ))}
        </div>
      )}

      <p className={s.meta}>
        알림 기준 원본: AINS_알림기준.md (기준 번호 R · Y · G). 기준은 팀이 같이 정해서 바꿔요.
      </p>
    </div>
  );
}
