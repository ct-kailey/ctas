"use client";

import Link from "next/link";

import { Badge, Button, EmptyState, Icon } from "@/components/ctds";
import { PROJECTS, type Grade } from "@/lib/mock";
import { useAins } from "./AinsContext";
import { AlertRow } from "./AlertRow";
import s from "./page.module.css";

const ORDER: Record<Grade, number> = { urgent: 0, check: 1, info: 2 };

export default function HomePage() {
  const { alerts } = useAins();

  const today = alerts
    .filter((a) => a.grade !== "info")
    .sort((a, b) => ORDER[a.grade] - ORDER[b.grade]);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>홈</h1>
        <p className={s.subtitle}>
          고객과 정한 내용 중, 지금 확인해야 할 것을 모아 보여 드려요.
        </p>
      </header>

      <section className={s.section}>
        <div className={s.panelHead}>
          <h2 className={s.sectionTitle}>오늘 확인할 것 {today.length}</h2>
          <Button variant="ghost" size="xs" rightIcon={<Icon name="arrow-right" />} asChild>
            <Link href="/alerts">알림함 전체 보기</Link>
          </Button>
        </div>
        {today.length === 0 ? (
          <div className={s.panel}>
            <EmptyState
              size="sm"
              icon="check-circle"
              title="지금 확인할 게 없어요"
              description="새 메일이나 자료가 들어오면 AINS가 점검해서 알려 드려요."
            />
          </div>
        ) : (
          <div className={s.flush}>
            {today.map((a) => (
              <div key={a.id} className={s.listRow}>
                <AlertRow alert={a} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={s.section}>
        <h2 className={s.sectionTitle}>내 프로젝트</h2>
        <div className={s.grid3}>
          {PROJECTS.map((p) => {
            const urgent = alerts.filter((a) => a.projectId === p.id && a.grade === "urgent").length;
            const check = alerts.filter((a) => a.projectId === p.id && a.grade === "check").length;
            const confirmed = p.decisions.filter((d) => d.status === "confirmed").length;
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className={s.projectCard}>
                <div className={s.panelHead}>
                  <span className={s.panelTitle}>{p.client}</span>
                  <Badge variant="soft">{p.stage}</Badge>
                </div>
                <span className={s.muted}>{p.name}</span>
                <span className={s.meta}>
                  기록된 결정 {p.decisions.length}건 · 고객 확인 {confirmed}건
                </span>
                <div className={s.row}>
                  {urgent > 0 && (
                    <Badge variant="soft" status="destructive">
                      급함 {urgent}
                    </Badge>
                  )}
                  {check > 0 && (
                    <Badge variant="soft" status="warning">
                      확인 필요 {check}
                    </Badge>
                  )}
                  {urgent === 0 && check === 0 && (
                    <Badge variant="soft" status="success">
                      이상 없음
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
