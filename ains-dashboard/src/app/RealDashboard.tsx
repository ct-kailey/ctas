"use client";

/* Workspace anchors leave the Next /dashboard basePath intentionally. */
/* eslint-disable @next/next/no-html-link-for-pages */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppFrame, Badge, Button, EmptyState, Icon, Sidebar, Topbar, TooltipProvider } from "@/components/ctds";
import { ConscienceMark } from "@/components/brand/ConscienceMark";
import s from "./RealDashboard.module.css";

type User = { id: string; name: string; email: string };
type Project = { id: string; name: string; role: string };
type Item = { id: string; title: string; status: string; updated_at?: string | null; due_at?: string | null };
type Activity = { id: string; kind: string; created_at: string };
type Dashboard = {
  project: Project;
  counts: { documents: number; revisions: number; pending_reviews: number; failed_jobs: number; context_entries: number; context_pending: number; open_tasks: number; open_questions: number; commercial_documents: number };
  items: { documents: Item[]; reviews: Item[]; tasks: Item[]; questions: Item[]; activity: Activity[] };
};
type AccountState = { phase: "loading" } | { phase: "login" } | { phase: "error"; message: string } | { phase: "ready"; user: User; projects: Project[] };
type ProjectState = { phase: "loading"; id: string } | { phase: "error"; id: string; message: string; login: boolean } | { phase: "ready"; id: string; data: Dashboard };

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function request(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", signal });
  if (!response.ok) throw new RequestError(response.status,
    response.status === 401 ? "로그인이 만료되었습니다. 기존 계정으로 다시 로그인해 주세요."
      : response.status === 403 || response.status === 404 ? "프로젝트를 찾을 수 없거나 접근 권한이 없습니다."
        : "업무 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return response.json();
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function projectValue(value: unknown): value is Project {
  return record(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.role === "string";
}
function accountValue(session: unknown, projects: unknown): { user: User; projects: Project[] } {
  if (!record(session) || !record(session.user) || typeof session.user.id !== "string" || typeof session.user.email !== "string" || typeof session.user.name !== "string" || !record(projects) || !Array.isArray(projects.projects) || !projects.projects.every(projectValue)) throw new Error("응답 형식을 확인할 수 없습니다. 다시 불러와 주세요.");
  return { user: session.user as User, projects: projects.projects };
}
function dashboardValue(value: unknown, id: string): Dashboard {
  const keys = ["documents", "revisions", "pending_reviews", "failed_jobs", "context_entries", "context_pending", "open_tasks", "open_questions", "commercial_documents"];
  if (!record(value) || !projectValue(value.project) || value.project.id !== id || !record(value.counts) || !record(value.items)) throw new Error("프로젝트 현황 응답을 확인할 수 없습니다.");
  const counts = value.counts, items = value.items;
  if (!keys.every(key => typeof counts[key] === "number" && Number.isSafeInteger(counts[key]) && (counts[key] as number) >= 0)
    || !["documents", "reviews", "tasks", "questions"].every(key => Array.isArray(items[key]) && items[key].every(item => record(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.status === "string"))
    || !Array.isArray(items.activity) || !items.activity.every(item => record(item) && typeof item.id === "string" && typeof item.kind === "string" && typeof item.created_at === "string")) throw new Error("프로젝트 현황 응답을 확인할 수 없습니다.");
  return value as unknown as Dashboard;
}
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "데이터를 불러오지 못했습니다. 다시 시도해 주세요.";
const workspace = (project: string, tab: string, action?: string) => `/?${new URLSearchParams({ project, tab, ...(action ? { action } : {}) }).toString()}`;
const ROLE: Record<string, string> = { owner: "소유자", admin: "관리자", lead: "리드", reviewer: "검토자", member: "멤버", editor: "편집자", viewer: "조회 권한" };
const STATUS: Record<string, string> = { draft: "초안", uploaded: "등록됨", queued: "처리 대기", processing: "처리 중", ready: "준비 완료", extracted: "추출 완료", failed: "처리 실패", uncertain: "결과 확인 필요", running: "처리 중", qa: "QA 검토", needs_review: "검토 필요", no_change: "변경 없음 · 검토 필요", approved: "승인됨", published: "확정됨", pending: "대기", open: "진행 전", todo: "진행 전", confirmed: "확정됨", in_progress: "진행 중", blocked: "진행 보류", waiting: "답변 대기", answered_pending: "답변 검토 필요", done: "완료", rejected: "반려" };
const EVENT: Record<string, string> = { "project.created": "프로젝트 생성", "domain.created": "업무 영역 등록", "revision.uploaded": "자료 버전 등록", "baseline.initial_published": "최초 기준 문서 확정", "baseline.published": "기준 문서 갱신", "review.requested": "변경 검토 요청", "review.question_answered": "검토 질문에 답변", "job.retry_requested": "처리 재시도 요청" };
const SHORTCUTS = [
  ["context", "Main Context", "합의·결정·근거와 질문 검색"], ["commercial", "계약·기획", "제안서·견적서·계약서 작성"],
  ["documents", "자료 관리", "파일·에디터 등록과 버전 관리"], ["reviews", "변경 검토", "요구사항의 차이와 영향 검토"],
  ["channels", "채널 수집·검토", "대화 기록 수집과 사람의 확정"], ["transcriptions", "회의 기록", "녹음·STT 기록과 검토"],
  ["work-governance", "업무 사전 검증", "Pre-flight · Scope Lock · 정책"], ["work-items", "기능별 작업", "담당자·마감일·진행상황"],
  ["implementation", "AI 구현 계획", "승인된 요구사항의 구현 계획"], ["github-delivery", "GitHub 작업", "코드·테스트·PR 실행과 결과"],
  ["questions", "질문·응답 관리", "고객 질문과 답변 대기 추적"], ["integrations", "도구 연결", "수집 채널과 저장소 연결"],
  ["settings", "프로젝트 설정", "프로젝트 정보·업무 영역 설정"], ["activity", "전체 활동 이력", "프로젝트의 변경 기록 조회"],
] as const;

function dateLabel(value?: string | null) {
  if (!value) return "날짜 미정";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "날짜 확인 필요" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(date);
}
function Notice({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  return <section className={s.notice} role={error ? "alert" : "status"}><Icon name={error ? "warning" : "info"} /><div><h2>{title}</h2>{children}</div></section>;
}
export function DashboardLoading() {
  return <main className={s.loading} role="status"><p>AINS 업무 대시보드</p><h1>기존 계정과 프로젝트를 확인하고 있습니다.</h1><a href="/">작업실 열기</a></main>;
}

export function RealDashboard() {
  const router = useRouter();
  const query = useSearchParams();
  const requestedProject = query.get("project");
  const [account, setAccount] = useState<AccountState>({ phase: "loading" });
  const [detail, setDetail] = useState<ProjectState | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const session = await request("/api/session", controller.signal);
        const projects = await request("/api/projects", controller.signal);
        const parsed = accountValue(session, projects);
        if (!controller.signal.aborted) setAccount({ phase: "ready", ...parsed });
      } catch (error) {
        if (controller.signal.aborted) return;
        setAccount(error instanceof RequestError && error.status === 401 ? { phase: "login" } : { phase: "error", message: errorMessage(error) });
      }
    })();
    return () => controller.abort();
  }, [refresh]);

  const projects = account.phase === "ready" ? account.projects : [];
  // An explicitly requested project must match membership; never substitute another one.
  const project = requestedProject !== null ? projects.find(p => p.id === requestedProject) : projects[0];
  const projectId = project?.id;
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    request(`/api/projects/${encodeURIComponent(projectId)}/dashboard`, controller.signal)
      .then(value => { const data = dashboardValue(value, projectId); if (!controller.signal.aborted) setDetail({ phase: "ready", id: projectId, data }); })
      .catch(error => { if (!controller.signal.aborted) setDetail({ phase: "error", id: projectId, message: errorMessage(error), login: error instanceof RequestError && error.status === 401 }); });
    return () => controller.abort();
  }, [projectId, refresh]);

  const data = detail?.phase === "ready" && detail.id === projectId ? detail.data : null;
  const projectError = detail?.phase === "error" && detail.id === projectId ? detail : null;
  const invalidProject = account.phase === "ready" && requestedProject !== null && !project;
  const selectProject = (id: string) => router.push(id ? `/?project=${encodeURIComponent(id)}` : "/");
  const reload = () => { setAccount({ phase: "loading" }); setDetail(null); setRefresh(n => n + 1); };
  const retry = <Button variant="outline" onClick={reload}>다시 불러오기</Button>;

  return <TooltipProvider><AppFrame variant="outlined" layout="sidebar-first">
    <AppFrame.Sidebar><Sidebar aria-label="실제 업무 탐색">
      <Sidebar.Header><Sidebar.Brand symbol={<ConscienceMark className={s.brand} />} wordmark="AINS" /><Badge variant="soft" status="success">실제 업무</Badge></Sidebar.Header>
      <Sidebar.Body><Sidebar.Section><Sidebar.Item icon={<Icon name="house" />} label="업무 대시보드" active asChild><Link href="/">업무 대시보드</Link></Sidebar.Item><Sidebar.Item icon={<Icon name="plus" />} label="새 프로젝트" asChild><a href="/?action=new-project">새 프로젝트</a></Sidebar.Item></Sidebar.Section>
        <Sidebar.Separator /><Sidebar.Section title="내 프로젝트">
          {projects.map(item => <Sidebar.Item key={item.id} icon={<Icon name="squares-four" />} label={item.name} active={projectId === item.id} asChild><Link href={`/?project=${encodeURIComponent(item.id)}`}>{item.name}</Link></Sidebar.Item>)}
          {account.phase === "ready" && !projects.length && <p className={s.sideNote}>등록된 프로젝트가 없습니다.</p>}
        </Sidebar.Section>
        <Sidebar.Separator /><Sidebar.Section title="체험"><Sidebar.Item icon={<Icon name="cursor-click" />} label="예시 대시보드" asChild><Link href="/example/">예시 대시보드</Link></Sidebar.Item><Sidebar.Item icon={<Icon name="stack" />} label="전체 흐름 프리뷰" asChild><a href="/preview">전체 흐름 프리뷰</a></Sidebar.Item></Sidebar.Section>
      </Sidebar.Body>
      <Sidebar.Footer>{account.phase === "ready" ? <Sidebar.Profile name={account.user.name || account.user.email} sub={account.user.email} /> : <p className={s.sideNote}>기존 AINS 계정으로 연결합니다.</p>}</Sidebar.Footer>
    </Sidebar></AppFrame.Sidebar>
    <AppFrame.Topbar><Topbar className={s.topbar}><span className={s.topbarLabel}>업무 대시보드</span><Topbar.Spacer /><Button variant="ghost" onClick={reload} disabled={account.phase === "loading"}>새로고침</Button><Button variant="outline" asChild><a href={project ? workspace(project.id, "overview") : "/"}>작업실 열기</a></Button></Topbar></AppFrame.Topbar>
    <AppFrame.Content><main className={s.page}>
      <header className={s.header}><div><div className={s.eyebrow}><Badge variant="soft" status="success">실제 업무</Badge><span>{account.phase === "ready" ? "기존 프로젝트와 연결됨" : "기존 AINS 계정으로 연결"}</span></div><h1>{project?.name || "프로젝트 업무 현황"}</h1><p>자료와 검토·작업 현황을 확인하고, 기존 업무를 바로 이어가세요.</p></div>
        <div className={s.actions}><Button variant="outline" asChild><Link href="/example/">예시 체험</Link></Button><Button asChild><a href={project ? workspace(project.id, "documents", "upload") : "/?action=new-project"}>{project ? "자료 등록" : "새 프로젝트"}</a></Button></div></header>
      {account.phase === "loading" && <Notice title="프로젝트 정보를 불러오는 중입니다."><p>기존 AINS 로그인과 접근 권한을 확인하고 있습니다.</p></Notice>}
      {account.phase === "login" && <Notice title="기존 AINS 계정으로 로그인해 주세요."><p>로그인하면 이미 등록한 프로젝트와 자료를 이 대시보드에서 확인할 수 있습니다.</p><Button asChild><a href="/">기존 계정으로 로그인</a></Button></Notice>}
      {account.phase === "error" && <Notice title="프로젝트를 불러오지 못했습니다." error><p>{account.message}</p>{retry}</Notice>}
      {account.phase === "ready" && <>
        <div className={s.projectPicker}><label htmlFor="actual-project">프로젝트</label><select id="actual-project" value={project?.id ?? ""} onChange={event => selectProject(event.target.value)}><option value="" disabled>프로젝트 선택</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{project && <Badge variant="soft">{ROLE[project.role] || project.role}</Badge>}</div>
        {invalidProject ? <Notice title="요청한 프로젝트를 열 수 없습니다." error><p>프로젝트가 삭제되었거나 현재 계정의 접근 권한이 없습니다. 프로젝트 목록에서 직접 선택해 주세요.</p>{retry}</Notice> : !projects.length ? <section className={s.panel}><EmptyState icon="squares-four" title="아직 참여한 프로젝트가 없습니다." description="프로젝트를 만들거나 기존 프로젝트의 접근 권한을 확인해 주세요." /><Button asChild><a href="/?action=new-project">첫 프로젝트 만들기</a></Button></section> : null}
        {project && !data && !projectError && <Notice title="프로젝트 현황을 불러오는 중입니다." />}
        {projectError && <Notice title="현황을 불러오지 못했습니다." error><p>{projectError.message}</p>{projectError.login ? <Button asChild><a href="/">다시 로그인</a></Button> : retry}</Notice>}
        {data && <ProjectOverview data={data} />}
      </>}
      <footer className={s.footer}><span>이 화면은 기존 업무 데이터를 조회합니다. 등록·검토·승인은 연결된 작업실에서 이어집니다.</span><a href="/preview">전체 워크플로우 보기 <Icon name="arrow-right" /></a></footer>
    </main></AppFrame.Content>
  </AppFrame></TooltipProvider>;
}

function ProjectOverview({ data }: { data: Dashboard }) {
  const { project, counts, items } = data;
  const href = (tab: string) => workspace(project.id, tab);
  const checks = [
    ["변경 문서 검토", counts.pending_reviews, "reviews", "기존 기준과 변경 내용을 대조해 주세요."],
    ["Context 후보 확정", counts.context_pending, "context", "수집된 결정·요구사항을 검토해 주세요."],
    ["처리 실패 확인", counts.failed_jobs, "overview", "실패한 파이프라인과 재시도를 확인해 주세요."],
    ["질문·응답 후속 조치", counts.open_questions, "questions", "초안·답변 대기·답변 검토를 확인해 주세요."],
  ] as const;
  return <>
    <section className={s.metrics} aria-label="프로젝트 주요 현황">{[
      ["등록 문서", counts.documents, "documents", `누적 버전 ${counts.revisions}개`],
      ["확정 Context", counts.context_entries, "context", `검토 후보 ${counts.context_pending}개`],
      ["진행할 작업", counts.open_tasks, "work-items", "완료 전 기능별 작업"],
      ["계약·기획 문서", counts.commercial_documents, "commercial", "제안서 · 견적서 · 계약서"],
    ].map(([label, count, tab, note]) => <a className={s.metric} href={href(String(tab))} key={label}><span>{label}</span><strong>{Number(count).toLocaleString("ko-KR")}</strong><small>{note}</small></a>)}</section>
    <section className={s.section}><div className={s.sectionHead}><h2>지금 확인할 것</h2><span>기존 업무의 검토·대기 현황</span></div><div className={s.checks}>{checks.map(([title, count, tab, description]) => <a href={href(tab)} key={tab} className={s.check}><div><h3>{title}</h3><p>{description}</p></div><Badge variant="soft" status={count ? "warning" : undefined}>{count}건</Badge><Icon name="arrow-right" /></a>)}</div></section>
    <div className={s.columns}>
      <RecordList title="검토할 변경 문서" items={items.reviews} href={href("reviews")} empty="현재 검토할 변경 문서가 없습니다." />
      <RecordList title="진행할 기능별 작업" items={items.tasks} href={href("work-items")} empty="등록된 진행 작업이 없습니다." due />
      <RecordList title="최근 등록 자료" items={items.documents} href={href("documents")} empty="자료를 등록하면 버전과 처리 상태가 표시됩니다." />
      <RecordList title="질문·응답 대기" items={items.questions} href={href("questions")} empty="후속 조치가 필요한 질문이 없습니다." due />
    </div>
    <section className={s.section}><div className={s.sectionHead}><h2>업무 이어가기</h2><span>선택한 프로젝트의 기존 기능으로 연결됩니다.</span></div><div className={s.shortcuts}>{SHORTCUTS.map(([tab, title, description]) => <a href={href(tab)} key={tab} className={s.shortcut}><div><h3>{title}</h3><p>{description}</p></div><Icon name="arrow-square-out" /></a>)}</div></section>
    <section className={s.panel}><div className={s.sectionHead}><h2>최근 활동</h2><a href={href("activity")}>전체 보기 <Icon name="arrow-right" /></a></div>{items.activity.length ? <ul className={s.records}>{items.activity.map(item => <li key={item.id}><a href={href("activity")}><div><strong>{EVENT[item.kind] || "프로젝트 활동 기록"}</strong>{!EVENT[item.kind] && <span>{item.kind}</span>}</div><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></a></li>)}</ul> : <p className={s.empty}>아직 활동 이력이 없습니다.</p>}</section>
  </>;
}
function RecordList({ title, items, href, empty, due = false }: { title: string; items: Item[]; href: string; empty: string; due?: boolean }) {
  return <section className={s.panel}><div className={s.sectionHead}><h2>{title}</h2><a href={href}>전체 보기 <Icon name="arrow-right" /></a></div>{items.length ? <ul className={s.records}>{items.map(item => <li key={item.id}><a href={href}><div><strong>{item.title || "제목 없는 기록"}</strong><span>{due ? `마감 ${dateLabel(item.due_at)}` : `등록 ${dateLabel(item.updated_at)}`}</span></div><Badge variant="soft" status={item.status === "failed" ? "destructive" : undefined}>{STATUS[item.status] || item.status}</Badge></a></li>)}</ul> : <p className={s.empty}>{empty}</p>}</section>;
}
