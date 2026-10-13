"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  Icon,
  ListItem,
  ListItemLeadingIcon,
  Stepper,
  Tabs,
} from "@/components/ctds";
import {
  MEETING_LABEL,
  OUR_COMPANY,
  SOURCE_ICON,
  SOURCE_LABEL,
  STAGES,
  type Decision,
  type DecisionStatus,
  type Draft,
  type Project,
} from "@/lib/mock";
import { useAins } from "../../AinsContext";
import s from "../../page.module.css";

const STATUS: Record<
  DecisionStatus,
  { label: string; status: "success" | "warning" | "info" }
> = {
  confirmed: { label: "고객 확인", status: "success" },
  waiting: { label: "고객 답장 대기", status: "warning" },
  draft: { label: "AI 초안 · 확인 필요", status: "info" },
};

const TABS = ["overview", "decisions", "materials", "tasks"];

export function ProjectView({ project }: { project: Project }) {
  const { openIntake } = useAins();
  const param = useSearchParams().get("tab");
  const fromParam = param && TABS.includes(param) ? param : "overview";
  const [tab, setTab] = useState(fromParam);
  const [lastParam, setLastParam] = useState(param);

  // 알림의 "보기" 링크(?tab=…)로 들어오면 그 탭을 연다
  if (param !== lastParam) {
    setLastParam(param);
    setTab(fromParam);
  }

  return (
    <div className={s.page}>
      <header className={s.headRow}>
        <div className={s.head}>
          <h1 className={s.title}>{project.name}</h1>
          <p className={s.subtitle}>고객사 {project.client}</p>
        </div>
        <div className={s.row}>
          <Button
            variant="outline"
            leftIcon={<Icon name="plus" />}
            onClick={() => openIntake(project.id)}
          >
            이 프로젝트에 자료 넣기
          </Button>
          <Button variant="ghost" leftIcon={<Icon name="gear" />} asChild>
            <Link href={`/projects/${project.id}/settings`}>설정</Link>
          </Button>
        </div>
      </header>

      <div className={s.panel}>
        <Stepper
          activeIndex={STAGES.indexOf(project.stage)}
          orientation="horizontal"
          marker="number"
        >
          {STAGES.map((st) => (
            <Stepper.Item key={st} title={st} />
          ))}
        </Stepper>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="프로젝트 섹션">
          <Tabs.Trigger value="overview" leadingIcon={<Icon name="squares-four" />}>
            개요
          </Tabs.Trigger>
          <Tabs.Trigger value="decisions" leadingIcon={<Icon name="clock" />}>
            결정 기록
          </Tabs.Trigger>
          <Tabs.Trigger value="materials" leadingIcon={<Icon name="stack" />}>
            자료함
          </Tabs.Trigger>
          <Tabs.Trigger value="tasks" leadingIcon={<Icon name="check-square" />}>
            할 일
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Panel value="overview">
          <Overview project={project} />
        </Tabs.Panel>
        <Tabs.Panel value="decisions">
          <Decisions project={project} />
        </Tabs.Panel>
        <Tabs.Panel value="materials">
          <Materials project={project} />
        </Tabs.Panel>
        <Tabs.Panel value="tasks">
          <Tasks project={project} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

/* 고객 확인 메일 초안 — 결정 하나를 고객에게 확인받을 때 */
function confirmDraft(project: Project, d: Decision): Draft {
  return {
    label: "확인 메일 초안",
    to: project.settings.clientEmails[0] ?? "",
    subject: `[${project.client}] ${d.title} — 확인 부탁드립니다`,
    body: `안녕하세요, ${d.date}에 정한 내용 확인 부탁드립니다.\n\n- ${d.title}\n- 이유: ${d.why}\n\n다르게 이해하신 부분이 있으면 회신 부탁드립니다.`,
  };
}

/* 📌 개요 ──────────────────────────────────────────── */
function Overview({ project }: { project: Project }) {
  return (
    <div className={s.grid2}>
      <section className={s.panel}>
        <h2 className={s.panelTitle}>고객이 계약한 이유</h2>
        <ul className={s.bullets}>
          {project.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>

      <section className={s.panel}>
        <h2 className={s.panelTitle}>합의된 범위</h2>
        <div className={s.stack}>
          <span className={s.muted}>범위 안</span>
          <div className={s.row}>
            {project.inScope.map((x) => (
              <Chip key={x} size="sm" leftIcon={<Icon name="check" />}>
                {x}
              </Chip>
            ))}
          </div>
          <span className={s.muted}>범위 밖</span>
          <div className={s.row}>
            {project.outOfScope.map((x) => (
              <Chip key={x} size="sm" variant="outline" leftIcon={<Icon name="minus" />}>
                {x}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section className={s.panel}>
        <h2 className={s.panelTitle}>담당자</h2>
        <div className={s.stack}>
          {project.people.map((p) => (
            <div key={p.name} className={s.row}>
              <Avatar size="sm" name={p.name} />
              <span className={s.body}>{p.name}</span>
              <span className={s.muted}>
                {p.side === "us" ? OUR_COMPANY : project.client}
                {p.role && ` · ${p.role}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={s.panel}>
        <h2 className={s.panelTitle}>소통 창구</h2>
        <div className={s.row}>
          {project.channels.map((c) => (
            <Chip key={c} size="sm" variant="outline">
              {c}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

/* 🕒 결정 기록 ─────────────────────────────────────── */
function Decisions({ project }: { project: Project }) {
  const { alerts, openDraft, resolveAlert } = useAins();
  const [decisions, setDecisions] = useState(project.decisions);
  const [filter, setFilter] = useState<"all" | DecisionStatus>("all");
  const list = filter === "all" ? decisions : decisions.filter((d) => d.status === filter);

  // 우리가 "맞아요"를 누르면 → 고객 확인을 기다리는 상태로, 확인 메일 초안을 연다
  const confirm = (d: Decision) => {
    setDecisions((ds) => ds.map((x) => (x.id === d.id ? { ...x, status: "waiting" } : x)));
    alerts
      .filter((a) => a.projectId === project.id && a.ruleId === "Y4")
      .forEach((a) => resolveAlert(a.id));
    openDraft(confirmDraft(project, d));
  };

  if (decisions.length === 0) {
    return (
      <EmptyState
        size="md"
        icon="clock"
        title="아직 기록된 결정이 없어요"
        description="회의록을 넣거나 고객 메일이 들어오면 AI가 결정 후보를 찾아 드려요."
      />
    );
  }

  return (
    <div className={s.stack}>
      <Tabs
        variant="text"
        size="sm"
        value={filter}
        onValueChange={(v) => setFilter(v as typeof filter)}
      >
        <Tabs.List aria-label="결정 상태">
          <Tabs.Trigger value="all">전체</Tabs.Trigger>
          <Tabs.Trigger value="confirmed">고객 확인</Tabs.Trigger>
          <Tabs.Trigger value="waiting">답장 대기</Tabs.Trigger>
          <Tabs.Trigger value="draft">AI 초안</Tabs.Trigger>
        </Tabs.List>
      </Tabs>

      <div className={s.flush}>
        {list.map((d) => (
          <article key={d.id} className={s.decision}>
            <span className={s.decisionDate}>{d.date}</span>
            <div className={s.decisionMain}>
              <div className={s.panelHead}>
                <span className={s.panelTitle}>{d.title}</span>
                <Badge variant="soft" status={STATUS[d.status].status}>
                  {STATUS[d.status].label}
                </Badge>
              </div>
              <dl className={s.dl}>
                <dt>누가</dt>
                <dd>{d.who}</dd>
                <dt>왜</dt>
                <dd>{d.why}</dd>
              </dl>
              <div className={s.row}>
                {d.sources.map((src) => (
                  <Chip
                    key={src.id}
                    size="sm"
                    variant="outline"
                    leftIcon={<Icon name={SOURCE_ICON[src.kind]} />}
                  >
                    {src.label}
                  </Chip>
                ))}
              </div>
              {d.status === "draft" && (
                <div className={s.row}>
                  <Button
                    size="sm"
                    variant="primary"
                    leftIcon={<Icon name="check" />}
                    onClick={() => confirm(d)}
                  >
                    맞아요, 확정
                  </Button>
                  <Button size="sm" variant="ghost" leftIcon={<Icon name="pencil-simple" />}>
                    고치기
                  </Button>
                </div>
              )}
              {d.status === "waiting" && (
                <div className={s.row}>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<Icon name="envelope" />}
                    onClick={() => openDraft(confirmDraft(project, d))}
                  >
                    확인 메일 초안
                  </Button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* 📁 자료함 ────────────────────────────────────────── */
function Materials({ project }: { project: Project }) {
  const { openIntake } = useAins();

  if (project.materials.length === 0) {
    return (
      <EmptyState
        size="md"
        icon="stack"
        title="아직 들어온 자료가 없어요"
        description="고객 메일은 설정에 등록한 주소에서 자동으로 들어와요. 회의록이나 전화 메모는 직접 넣어 주세요."
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Icon name="plus" />}
            onClick={() => openIntake(project.id)}
          >
            자료 넣기
          </Button>
        }
      />
    );
  }

  return (
    <div className={s.flush}>
      {project.materials.map((m) => (
        <div key={m.id} className={s.listRow}>
          <ListItem
            variant="system"
            leading={
              <ListItemLeadingIcon>
                <Icon name={SOURCE_ICON[m.kind]} />
              </ListItemLeadingIcon>
            }
            from={m.title}
            body={`${SOURCE_LABEL[m.kind]}${m.meetingType ? ` · ${MEETING_LABEL[m.meetingType]}` : ""} · ${m.from}${m.kind === "mail" ? " · 자동으로 들어옴" : ""}`}
            meta={m.date}
            trailing={
              m.latest ? (
                <Badge variant="soft" status="success">
                  최신본
                </Badge>
              ) : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}

/* ✅ 할 일 ─────────────────────────────────────────── */
function Tasks({ project }: { project: Project }) {
  const { openDraft } = useAins();
  const [tasks, setTasks] = useState(project.tasks);
  const { check } = project.settings.replyDays;

  const toggle = (id: string) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <div className={s.grid2}>
      <section className={s.panel}>
        <h2 className={s.panelTitle}>회의에서 정한 할 일</h2>
        {tasks.length === 0 ? (
          <span className={s.muted}>회의록을 넣으면 후속 액션이 여기에 모여요.</span>
        ) : (
          <div className={s.stack}>
            {tasks.map((t) => (
              <div key={t.id} className={s.panelHead}>
                <Checkbox checked={t.done} onChange={() => toggle(t.id)}>
                  <span className={t.done ? s.done : s.body}>{t.title}</span>
                </Checkbox>
                <span className={s.meta}>
                  {t.owner} · {t.from}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={s.panel}>
        <h2 className={s.panelTitle}>고객 답장 기다리는 것</h2>
        {project.waitingList.length === 0 ? (
          <span className={s.muted}>기다리는 답장이 없어요.</span>
        ) : (
          <div className={s.stack}>
            {project.waitingList.map((w) => (
              <div key={w.id} className={s.panelHead}>
                <span className={s.body}>
                  {w.title} <span className={s.muted}>· {w.to}</span>
                </span>
                <div className={s.row}>
                  <Badge variant="soft" status={w.days >= check ? "warning" : "info"}>
                    {w.days}일째
                  </Badge>
                  {w.days >= check && (
                    <Button
                      size="xs"
                      variant="outline"
                      leftIcon={<Icon name="envelope" />}
                      onClick={() =>
                        openDraft({
                          label: "재촉 메일 초안",
                          to: project.settings.clientEmails[0] ?? "",
                          subject: `[${project.client}] ${w.title} 다시 부탁드립니다`,
                          body: `${w.to}님, 지난번에 여쭤본 “${w.title}” 건 다시 부탁드립니다.\n\n일정에 맞추려면 이번 주 안에 확인이 필요합니다. 회신 부탁드립니다.`,
                        })
                      }
                    >
                      재촉 메일
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <span className={s.meta}>
          {check}일 넘게 답이 없으면 알림이 떠요. 프로젝트 설정에서 바꿀 수 있어요.
        </span>
      </section>
    </div>
  );
}
