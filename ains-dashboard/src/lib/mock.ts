import type { BadgeStatus, IconName } from "@/components/ctds";

/**
 * AINS 대시보드 프리뷰용 가짜 데이터.
 * 실제 연동(Gmail · 자료 넣기) 전까지 화면 확인용으로만 쓴다.
 * 기획 원본: Nora/AINS_대시보드기획.md, 알림 기준: Nora/AINS_알림기준.md
 */

/* 업무 단계 — 아이데이션 ② 현재 플로우 7단계 */
export type Stage =
  | "계약/착수"
  | "요구사항"
  | "기획/설계"
  | "구현"
  | "검수"
  | "안정화"
  | "운영/유지보수";
export const STAGES: Stage[] = [
  "계약/착수",
  "요구사항",
  "기획/설계",
  "구현",
  "검수",
  "안정화",
  "운영/유지보수",
];

/* 자료 종류 — 자동(mail) + 자료 넣기(meeting · call · chat) */
export type SourceKind = "meeting" | "mail" | "call" | "chat" | "doc";

export type Source = {
  id: string;
  kind: SourceKind;
  label: string;
};

export type DecisionStatus = "confirmed" | "waiting" | "draft";

export type Decision = {
  id: string;
  date: string;
  title: string;
  who: string;
  why: string;
  status: DecisionStatus;
  sources: Source[];
};

export type Material = {
  id: string;
  kind: SourceKind;
  title: string;
  from: string;
  date: string;
  latest?: boolean;
  meetingType?: MeetingType;
};

export type MeetingType = "internal" | "client";

export type Task = {
  id: string;
  title: string;
  owner: string;
  from: string;
  done: boolean;
};

export type Waiting = {
  id: string;
  title: string;
  to: string;
  days: number;
};

export type Person = { name: string; role?: string; email?: string; side: "client" | "us" };

/* 담당자 옆에 보여 줄 우리 회사 이름 */
export const OUR_COMPANY = "컨시언스";

export type ProjectSettings = {
  members: string[];
  clientEmails: string[];
  aiAllowed: boolean;
  replyDays: { check: number; urgent: number };
};

export type Project = {
  id: string;
  client: string;
  name: string;
  stage: Stage;
  needs: string[];
  inScope: string[];
  outOfScope: string[];
  people: Person[];
  channels: string[];
  decisions: Decision[];
  materials: Material[];
  tasks: Task[];
  waitingList: Waiting[];
  settings: ProjectSettings;
};

export const PROJECTS: Project[] = [
  {
    id: "seegene",
    client: "씨젠",
    name: "씨젠 사내 포털 개편",
    stage: "기획/설계",
    needs: [
      "흩어진 사내 공지와 결재를 한 화면에서 처리",
      "보안팀 기준(외부 계정 금지)을 지키는 로그인",
      "모바일에서도 결재 가능",
    ],
    inScope: ["SSO 로그인", "공지 · 결재 통합 홈", "모바일 반응형"],
    outOfScope: ["관리자 화면 (2차로 미룸)", "외부 협력사 계정"],
    people: [
      { name: "김팀장", role: "PM", email: "kim@seegene.com", side: "client" },
      { name: "이과장", role: "보안 담당", email: "lee@seegene.com", side: "client" },
      { name: "vara", side: "us" },
      { name: "Paul Kim", side: "us" },
      { name: "Xeno", side: "us" },
    ],
    channels: ["메일 kim@seegene.com", "주간 회의 (화)"],
    decisions: [
      {
        id: "d1",
        date: "10/08",
        title: "로그인은 SSO만 지원하기로 함",
        who: "고객 김팀장, vara",
        why: "보안팀 정책 (외부 계정 금지)",
        status: "confirmed",
        sources: [
          { id: "s1", kind: "meeting", label: "10/08 회의록" },
          { id: "s2", kind: "mail", label: "확인 메일 (김팀장 회신)" },
        ],
      },
      {
        id: "d2",
        date: "10/06",
        title: "개인정보가 담긴 파일은 다운로드 금지",
        who: "고객 이과장",
        why: "개인정보 반출 방지 규정",
        status: "confirmed",
        sources: [{ id: "s3", kind: "mail", label: "보안 가이드 메일" }],
      },
      {
        id: "d3",
        date: "10/02",
        title: "관리자 화면은 2차 범위로 미룸",
        who: "고객 김팀장, Paul Kim",
        why: "1차 오픈 일정 맞추기",
        status: "waiting",
        sources: [{ id: "s4", kind: "call", label: "10/02 통화 메모" }],
      },
      {
        id: "d4",
        date: "09/29",
        title: "결재 화면은 기존 그룹웨어 흐름 유지",
        who: "AI가 회의록에서 찾음",
        why: "직원 재교육 부담 줄이기",
        status: "draft",
        sources: [{ id: "s5", kind: "meeting", label: "09/29 회의록" }],
      },
    ],
    materials: [
      { id: "m1", kind: "mail", title: "관리자 화면 엑셀 다운로드 요청드립니다", from: "김팀장", date: "10/12" },
      { id: "m2", kind: "meeting", title: "10/08 주간 회의록", from: "vara", date: "10/08", latest: true, meetingType: "client" },
      { id: "m3", kind: "mail", title: "Re: 로그인 정책 확인 부탁드립니다", from: "김팀장", date: "10/08" },
      { id: "m4", kind: "doc", title: "요구사항 정의서 v3.xlsx (메일 첨부)", from: "김팀장", date: "10/07", latest: true },
      { id: "m5", kind: "mail", title: "보안 가이드 전달드립니다", from: "이과장", date: "10/06" },
      { id: "m6", kind: "call", title: "관리자 화면 일정 통화 메모", from: "Paul Kim", date: "10/02" },
      { id: "m7", kind: "chat", title: "카톡 — 모바일 결재 화면 문의", from: "vara", date: "09/30" },
      { id: "m8", kind: "doc", title: "요구사항 정의서 v2.xlsx (메일 첨부)", from: "김팀장", date: "09/30" },
    ],
    tasks: [
      { id: "k1", title: "요구사항 정의서 v4에 SSO 결정 반영", owner: "vara", from: "10/08 회의록", done: false },
      { id: "k2", title: "SSO 연동 방식 고객 보안팀에 문의", owner: "Paul Kim", from: "10/08 회의록", done: false },
      { id: "k3", title: "모바일 결재 화면 와이어프레임 공유", owner: "Xeno", from: "10/08 회의록", done: true },
    ],
    waitingList: [
      { id: "w1", title: "로그인 정책 확인", to: "김팀장", days: 3 },
      { id: "w2", title: "관리자 화면 2차 이관 동의", to: "김팀장", days: 1 },
    ],
    settings: {
      members: ["vara", "Paul Kim", "Xeno"],
      clientEmails: ["kim@seegene.com", "lee@seegene.com"],
      aiAllowed: true,
      replyDays: { check: 3, urgent: 7 },
    },
  },
  {
    id: "a-corp",
    client: "A사",
    name: "A사 주문 관리 시스템",
    stage: "구현",
    needs: ["엑셀로 하던 주문 관리를 시스템으로"],
    inScope: ["주문 등록 · 조회", "출고 상태 관리"],
    outOfScope: ["회계 연동"],
    people: [
      { name: "박대리", role: "담당", email: "park@a-corp.co.kr", side: "client" },
      { name: "Kris Yu", side: "us" },
      { name: "Tom Lee", side: "us" },
    ],
    channels: ["메일 @a-corp.co.kr"],
    decisions: [],
    materials: [],
    tasks: [],
    waitingList: [],
    settings: {
      members: ["Kris Yu", "Tom Lee", "vara"],
      clientEmails: ["@a-corp.co.kr"],
      aiAllowed: true,
      replyDays: { check: 3, urgent: 7 },
    },
  },
  {
    id: "b-corp",
    client: "B사",
    name: "B사 고객센터 챗봇",
    stage: "검수",
    needs: ["반복 문의 자동 응답"],
    inScope: ["FAQ 챗봇", "상담원 연결"],
    outOfScope: ["음성 상담"],
    people: [
      { name: "최매니저", role: "담당", email: "choi@b-corp.com", side: "client" },
      { name: "Kailey", side: "us" },
      { name: "Lucas", side: "us" },
    ],
    channels: ["메일 choi@b-corp.com"],
    decisions: [],
    materials: [],
    tasks: [],
    waitingList: [],
    settings: {
      members: ["Kailey", "Lucas", "vara"],
      clientEmails: ["choi@b-corp.com"],
      aiAllowed: false,
      replyDays: { check: 5, urgent: 10 },
    },
  },
];

export function getProject(id: string) {
  return PROJECTS.find((p) => p.id === id);
}

/* ─── 알림 — 등급 · 기준은 AINS_알림기준.md와 같은 번호를 쓴다 ─── */

export type Grade = "urgent" | "check" | "info";

export const GRADES: Grade[] = ["urgent", "check", "info"];

export const GRADE: Record<
  Grade,
  { label: string; status: BadgeStatus; tone: "destructive" | "warning" | "neutral" }
> = {
  urgent: { label: "급함", status: "destructive", tone: "destructive" },
  check: { label: "확인 필요", status: "warning", tone: "warning" },
  info: { label: "참고", status: "info", tone: "neutral" },
};

export const RULES: Record<string, string> = {
  R1: "고객이 확인한 결정과 충돌",
  R2: "보안 · 개인정보 관련",
  R3: "고객이 일정을 바꾸자고 함",
  R4: "고객이 불만을 표현함",
  R5: "고객 답장 7일 넘게 없음",
  Y1: "범위 밖 요청",
  Y2: "고객 쪽 담당자가 바뀜",
  Y3: "고객 답장 3일 넘게 없음",
  Y4: "AI가 뽑은 결정이 확인을 기다림",
  Y5: "AI가 판단하기 어려움",
  G1: "새 자료가 들어옴",
  G2: "고객이 확인 답장을 줌",
};

export type Draft = {
  label: string;
  to: string;
  subject: string;
  body: string;
};

export type Alert = {
  id: string;
  projectId: string;
  grade: Grade;
  ruleId: string;
  title: string;
  body: string;
  date: string;
  draft?: Draft;
  /** 초안 대신 프로젝트 탭으로 보낼 때 */
  tab?: "decisions" | "materials" | "tasks";
};

export const ALERTS: Alert[] = [
  {
    id: "a1",
    projectId: "seegene",
    grade: "urgent",
    ruleId: "R1",
    title: "엑셀 다운로드 요청이 10/06 결정과 충돌해요",
    body: "김팀장 메일 “관리자 화면에 회원 목록 엑셀 다운로드 넣어 주세요” — 10/06 “개인정보 파일 다운로드 금지”와 부딪혀요. 관리자 화면은 2차 범위이기도 해요.",
    date: "10/12",
    draft: {
      label: "답장 초안",
      to: "kim@seegene.com",
      subject: "[씨젠 포털] 엑셀 다운로드 요청 관련 확인 부탁드립니다",
      body: "김팀장님, 요청 주신 관리자 화면 엑셀 다운로드 건 확인했습니다.\n\n10/06 이과장님께서 보내 주신 보안 가이드에 “개인정보가 담긴 파일은 다운로드 금지”가 있어서 확인이 필요합니다. 또 관리자 화면은 10/02에 2차 범위로 정했습니다.\n\n개인정보를 뺀 형태로 2차에 진행해도 괜찮으실까요?",
    },
  },
  {
    id: "a2",
    projectId: "a-corp",
    grade: "urgent",
    ruleId: "R3",
    title: "오픈 일정을 2주 당기자는 요청이 왔어요",
    body: "박대리 메일 “내부 보고 일정 때문에 오픈을 11월 첫 주로 당길 수 있을까요?”",
    date: "10/12",
    draft: {
      label: "답장 초안",
      to: "park@a-corp.co.kr",
      subject: "[A사 주문 관리] 오픈 일정 조정 요청 관련",
      body: "박대리님, 오픈 일정 조정 요청 확인했습니다.\n\n지금 범위(주문 등록 · 조회, 출고 상태 관리) 기준으로 일정을 다시 검토해서 내일까지 가능 여부와 조정안을 드리겠습니다.\n\n혹시 꼭 먼저 열어야 하는 기능이 있다면 알려 주세요. 그 기능부터 열 수 있는지도 같이 보겠습니다.",
    },
  },
  {
    id: "a3",
    projectId: "seegene",
    grade: "check",
    ruleId: "Y3",
    title: "“로그인 정책 확인” 답장이 3일째 없어요",
    body: "10/08에 김팀장님께 보낸 확인 메일에 아직 답이 없어요.",
    date: "10/11",
    draft: {
      label: "재촉 메일 초안",
      to: "kim@seegene.com",
      subject: "[씨젠 포털] 로그인 정책 확인 다시 부탁드립니다",
      body: "김팀장님, 10/08에 보내 드린 로그인 정책 확인 건 다시 여쭤봅니다.\n\n“로그인은 SSO만 지원”으로 진행하려고 하는데, 일정에 맞추려면 이번 주 안에 확인이 필요합니다.\n\n회신 부탁드립니다.",
    },
  },
  {
    id: "a4",
    projectId: "a-corp",
    grade: "check",
    ruleId: "Y1",
    title: "“회계 연동 추가” 요청은 범위 밖이에요",
    body: "계약할 때 회계 연동은 범위 밖으로 정했어요. 추가 요청으로 진행할지 확인이 필요해요.",
    date: "10/10",
    draft: {
      label: "답장 초안",
      to: "park@a-corp.co.kr",
      subject: "[A사 주문 관리] 회계 연동 요청 관련",
      body: "박대리님, 회계 연동 요청 확인했습니다.\n\n계약 범위를 정할 때 회계 연동은 이번 범위 밖으로 정했습니다. 진행을 원하시면 추가 요청으로 일정과 비용을 따로 안내드리겠습니다.\n\n어떻게 진행할지 알려 주세요.",
    },
  },
  {
    id: "a5",
    projectId: "seegene",
    grade: "check",
    ruleId: "Y4",
    title: "AI가 뽑은 결정 1건이 확인을 기다려요",
    body: "09/29 회의록 — “결재 화면은 기존 그룹웨어 흐름 유지”가 맞는지 확인해 주세요.",
    date: "10/09",
    tab: "decisions",
  },
  {
    id: "a6",
    projectId: "b-corp",
    grade: "info",
    ruleId: "G2",
    title: "최매니저님이 검수 일정에 확인 답장을 줬어요",
    body: "“10/20부터 검수 시작하는 걸로 확인했습니다.”",
    date: "10/11",
  },
  {
    id: "a7",
    projectId: "seegene",
    grade: "info",
    ruleId: "G1",
    title: "새 메일 첨부가 들어왔어요",
    body: "요구사항 정의서 v3.xlsx — 이전 버전(v2)보다 최신본이에요.",
    date: "10/07",
    tab: "materials",
  },
];

/* ─── 자료 아이콘 · 이름 ─── */

export const SOURCE_ICON: Record<SourceKind, IconName> = {
  meeting: "article",
  mail: "envelope",
  call: "waveform",
  chat: "chat-text",
  doc: "clipboard-text",
};

export const SOURCE_LABEL: Record<SourceKind, string> = {
  meeting: "회의록",
  mail: "메일",
  call: "전화 메모",
  chat: "붙여넣은 대화",
  doc: "첨부 문서",
};

export const MEETING_LABEL: Record<MeetingType, string> = {
  internal: "내부 회의",
  client: "고객 회의",
};

/* 프로젝트 동의 안내 메일 — 프로젝트 시작할 때 한 번 */
export function consentDraft(project: Project): Draft {
  const contact = project.people.find((p) => p.side === "client")?.name ?? "담당자";
  return {
    label: "동의 안내 메일 초안",
    to: project.settings.clientEmails[0] ?? "",
    subject: `[${project.client}] 프로젝트 기록 방식 안내드립니다`,
    body: `${contact}님, 프로젝트를 시작하면서 기록 방식을 안내드립니다.\n\n정확한 소통을 위해 아래처럼 기록하려고 합니다.\n- 회의 녹음 후 회의록 정리\n- 프로젝트 관련 메일을 내부 업무 도구에 보관\n- AI로 회의록과 결정 사항 정리\n\n괜찮으신지, 피해야 할 부분(예: AI 사용 금지)이 있는지 알려 주세요.`,
  };
}
