"use client";

import Link from "next/link";

import { Badge, Button, Icon } from "@/components/ctds";
import { GRADE, RULES, getProject, type Alert } from "@/lib/mock";
import { useAins } from "./AinsContext";
import s from "./page.module.css";

/**
 * 알림 한 줄 — 홈 "오늘 확인할 것"과 알림함에서 같이 쓴다.
 * 등급은 AINS_알림기준.md의 기준으로만 정해진다 — 화면에서 고르지 않는다.
 * controls: 알림함에서만 처리 완료를 보여 준다.
 */
export function AlertRow({ alert, controls = false }: { alert: Alert; controls?: boolean }) {
  const { openDraft, resolveAlert } = useAins();
  const project = getProject(alert.projectId);
  const grade = GRADE[alert.grade];

  return (
    <article className={s.alertRow}>
      <Badge variant="soft" status={grade.status} className={s.alertGrade}>
        {grade.label}
      </Badge>

      <div className={s.alertMain}>
        <span className={s.panelTitle}>
          [{project?.client}] {alert.title}
        </span>
        <span className={s.muted}>{alert.body}</span>
        <span className={s.meta}>
          기준 {alert.ruleId} · {RULES[alert.ruleId]} · {alert.date}
        </span>
      </div>

      <div className={s.alertActions}>
        {alert.draft ? (
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Icon name="envelope" />}
            onClick={() => openDraft(alert.draft!, alert.id)}
          >
            {alert.draft.label}
          </Button>
        ) : (
          <Button size="sm" variant="outline" rightIcon={<Icon name="arrow-right" />} asChild>
            <Link href={`/projects/${alert.projectId}${alert.tab ? `?tab=${alert.tab}` : ""}`}>
              보기
            </Link>
          </Button>
        )}
        {controls && (
          <>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Icon name="check" />}
              onClick={() => resolveAlert(alert.id)}
            >
              처리 완료
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
