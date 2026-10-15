import { List, ListItem } from './ctds-lists.jsx';
import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, CheckCheck, FileLock2, FolderLock, History, LockKeyhole, Monitor, ShieldCheck } from 'lucide-react';
import { Badge, Button, FormField, Modal, Input, Textarea, Select, Tabs, Notice } from './ui.jsx';
import { TableHeader } from './components/ctds/TableHeader/TableHeader';
import { TableRow } from './components/ctds/TableRow/TableRow';
import { TableCellText } from './components/ctds/TableCell/TableCellText';
import { TableCellBadge } from './components/ctds/TableCell/TableCellBadge';
import './preview-support.css';

const SECURITY_AREAS = [
  ['access', '접근 권한'], ['isolation', '프로젝트 격리'], ['masking', '민감정보·공유'], ['retention', '보존 정책'], ['audit', '감사 이력'],
];
const ROLES = { admin: '관리자', member: '담당자', viewer: '열람자' };
const PERMISSIONS = [
  { label: '배정된 프로젝트의 자료·출처 조회', admin: '허용', member: '허용', viewer: '허용' },
  { label: '문서 등록·Task 수정', admin: '허용', member: '담당 범위', viewer: '제한' },
  { label: '검토 결과 확정·실행 요청', admin: '승인 범위', member: '담당 범위', viewer: '제한' },
  { label: '프로젝트 참여자·보존 정책 변경', admin: '허용', member: '제한', viewer: '제한' },
  { label: '개인 CLI 실행', admin: '본인 장치', member: '본인 장치', viewer: '제한' },
];
const AUDIT_FIXTURES = [
  { id: 'security-fixture-1', time: '예시 09:20', message: '담당자가 마스킹된 해결 사례의 공유 후보를 검토했습니다.' },
  { id: 'security-fixture-2', time: '예시 09:12', message: '다른 프로젝트의 검색 요청을 접근 범위 밖으로 판정했습니다.' },
  { id: 'security-fixture-3', time: '예시 09:00', message: '관리자가 프로젝트 참여자와 실행 권한을 검토했습니다.' },
];
function auditTime(value) {
  if (!value) return '방금';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
}
function PreviewNotice({ children }) { return children ? <Notice tone="success" className="wp-support-feedback" role="status"><Check size={16} aria-hidden="true" />{children}</Notice> : null; }

export function SecurityPreview({ onEvent, onNavigate, auditEvents = [] }) {
  const [area, setArea] = useState('access');
  const [role, setRole] = useState('admin');
  const [scope, setScope] = useState('project');
  const [masked, setMasked] = useState(true);
  const [shareReviewed, setShareReviewed] = useState(false);
  const [retention, setRetention] = useState({ originals: '180', logs: '90', decisions: '365' });
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(null);
  const [isolationResult, setIsolationResult] = useState(false);
  const permissionColumns = [
    { key: 'label', label: '작업', flex: true, render: permission => <TableCellText>{permission.label}</TableCellText> },
    { key: 'scope', label: '허용 범위', width: 'var(--space-32)', render: permission => <TableCellBadge status={permission[role] === '제한' ? undefined : 'success'}>{permission[role]}</TableCellBadge> },
  ];
  function record(message) { setNotice(message); onEvent?.(message); }
  function applyPolicy() {
    setSaved({ role, scope, retention: { ...retention } });
    record(`설정 예시를 적용했습니다. ${ROLES[role]} · ${scope === 'project' ? '배정된 프로젝트' : '담당 Task와 관련 자료'} 범위입니다. 실제 권한과 보존 정책은 변경되지 않았습니다.`);
  }
  return <Tabs className="wp-stack wp-security-preview" value={area} onValueChange={value => { setArea(value); setNotice(''); }} variant="text" size="sm">
    <Notice tone="brand" className="wp-callout"><ShieldCheck size={20} aria-hidden="true" /><div><strong>처음부터 모든 단계에 적용하는 보안</strong><p className="wp-muted">권한·프로젝트 격리·감사 정책은 1주 차부터 함께 설계합니다. 아래 설정과 이력은 동작을 확인하는 예시이며, 실사용 권한이나 데이터는 바뀌지 않습니다.</p></div></Notice>
    <div className="wp-security-controls wp-panel">
      <FormField label="역할 미리보기"><Select value={role} onChange={event => { setRole(event.target.value); setNotice(''); }}>{Object.entries(ROLES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
      <FormField label="조회 범위 미리보기"><Select value={scope} onChange={event => setScope(event.target.value)}><option value="project">배정된 프로젝트</option><option value="assigned">담당 Task와 관련 자료</option></Select></FormField>
      <div className="wp-security-scope"><span className="wp-meta">현재 미리보기</span><strong>{ROLES[role]} / {scope === 'project' ? '프로젝트 범위' : '담당 업무 범위'}</strong><span className="wp-muted">역할과 프로젝트 참여 범위를 함께 확인합니다.</span></div>
    </div>
    <Tabs.List className="wp-action-row" aria-label="보안 설정 범주">{SECURITY_AREAS.map(([key, label]) => <Tabs.Trigger key={key} value={key}>{label}</Tabs.Trigger>)}</Tabs.List>
    <Tabs.Panel value={area} keepMounted className="wp-panel wp-stack">
      {area === 'access' ? <>
        <div className="wp-panel-heading"><div><span className="wp-kicker">Access Control</span><h3>권한은 역할과 업무 범위로 제한</h3></div><Badge tone="quiet">{ROLES[role]} 미리보기</Badge></div>
        <p className="wp-muted">관리자도 참여하지 않은 고객 프로젝트의 원본을 자동으로 열람하지 않습니다. 확정된 권한 정책은 서버에서 매 요청마다 검사하는 구조입니다.</p>
        <div className="wp-table-wrap" role="table" aria-label="선택한 역할에서 가능한 작업 예시"><TableHeader variant="line" columns={permissionColumns} /><div role="rowgroup">{PERMISSIONS.map(permission => <TableRow key={permission.label} variant="line" size="sm" wrap columns={permissionColumns} data={permission} />)}</div></div>
        <div className="wp-action-row"><Button type="button" icon={CheckCheck} onClick={applyPolicy}>설정 예시 적용</Button><span className="wp-meta">역할 변경은 이 미리보기 화면에만 반영됩니다.</span></div>
      </> : null}
      {area === 'isolation' ? <>
        <div className="wp-panel-heading"><div><span className="wp-kicker">Data Isolation</span><h3>검색부터 실행 결과까지 프로젝트 단위로</h3></div><FolderLock size={22} aria-hidden="true" /></div>
        <div className="wp-grid-two"><div className="wp-stack"><div className="wp-list-row"><strong>현재 프로젝트</strong><span className="wp-muted">문서, 회의, 요구사항, Task, 결과물에 같은 접근 범위를 적용합니다.</span></div><div className="wp-list-row"><strong>검색·AI에 전달할 Context</strong><span className="wp-muted">허용된 프로젝트와 자료만 조회한 뒤 검색 결과와 실행 입력에 포함합니다.</span></div><div className="wp-list-row"><strong>다른 프로젝트에서 재사용</strong><span className="wp-muted">고객 원본 대신 민감정보를 제거하고 검토한 해결 패턴만 공유 후보로 만듭니다.</span></div></div><div className="wp-security-test"><span className="wp-meta">프로젝트 격리 테스트 예시</span><strong>다른 프로젝트의 고객 계약서 검색</strong><p className="wp-muted">현재 역할: {ROLES[role]} · 대상 프로젝트 참여 권한 없음</p><Button type="button" variant="secondary" onClick={() => { setIsolationResult(true); record('격리 테스트 예시: 다른 프로젝트의 원본 검색을 제한했습니다. 실제 검색 요청은 보내지 않았습니다.'); }}>조회 범위 확인</Button>{isolationResult ? <Notice tone="warning" className="wp-support-feedback" role="status"><LockKeyhole size={16} aria-hidden="true" />접근 범위 밖의 자료입니다. 원문과 검색 결과를 제공하지 않습니다.</Notice> : null}</div></div>
      </> : null}
      {area === 'masking' ? <>
        <div className="wp-panel-heading"><div><span className="wp-kicker">Secure Abstraction</span><h3>고객 원본과 재사용 지식을 분리</h3></div><FileLock2 size={22} aria-hidden="true" /></div>
        <label className="wp-support-check"><Input type="checkbox" checked={masked} onChange={event => { setMasked(event.target.checked); setShareReviewed(false); }} />민감정보 마스킹 예시 보기</label>
        <div className="wp-security-sample"><span className="wp-meta">합성 샘플 · 실제 고객 자료가 아닙니다</span><p>{masked ? '고객사 [가림] · 담당자 [가림] · 이메일 [가림]' : '고객사 예시상사 · 담당자 홍길동 · 이메일 demo@example.invalid'}</p><p>재사용 후보: 고객 답변 지연으로 작업이 막힐 때, 의존 Task와 응답 기한을 함께 관리한다.</p></div>
        <label className="wp-support-check"><Input type="checkbox" checked={shareReviewed} onChange={event => setShareReviewed(event.target.checked)} disabled={!masked || role === 'viewer'} />고객 식별정보가 제거되었고, 공유 가능한 범위인지 검토했습니다.</label>
        <div className="wp-action-row"><Button type="button" disabled={!masked || !shareReviewed || role === 'viewer'} onClick={() => record('마스킹·공유 범위 검토 예시를 완료했습니다. 재사용 지식 후보를 이 화면에서만 확정했습니다.')}>공유 후보 검토 예시 완료</Button>{onNavigate ? <Button type="button" variant="ghost" icon={ArrowRight} onClick={() => onNavigate('knowledge')}>지식 재사용 화면</Button> : null}</div>
        <p className="wp-meta">공유 전에는 마스킹과 담당자 검토가 필요합니다. 열람자 미리보기에서는 확정할 수 없습니다.</p>
      </> : null}
      {area === 'retention' ? <>
        <div className="wp-panel-heading"><div><span className="wp-kicker">Compliance</span><h3>자료 특성에 맞춰 보존·삭제 기준 설정</h3></div><Badge tone="quiet">기간은 예시</Badge></div>
        <p className="wp-muted">아래 기간은 화면 검토를 위한 가정입니다. 실제 기준은 고객 계약, 저장 위치, 모델 사용 제한과 함께 확정합니다.</p>
        <div className="wp-security-retention">{[['originals', '고객 원본'], ['logs', '실행 로그'], ['decisions', '결정·승인 이력']].map(([key, label]) => <FormField key={key} label={`${label} 보존 기간`}><Select value={retention[key]} disabled={role !== 'admin'} onChange={event => setRetention({ ...retention, [key]: event.target.value })}>{['30', '90', '180', '365'].map(days => <option value={days} key={days}>{days}일</option>)}</Select></FormField>)}</div>
        <div className="wp-list-row"><strong>기한 도래 → 삭제 검토 → 처리 이력 기록</strong><span className="wp-muted">원본·검색 색인·백업의 처리 범위를 구분합니다. 계약상 보존 의무와 삭제 요청 충돌은 담당자가 확인합니다.</span></div>
        <div className="wp-action-row"><Button type="button" disabled={role !== 'admin'} onClick={applyPolicy}>설정 예시 적용</Button><span className="wp-meta">{role !== 'admin' ? '관리자 미리보기에서 설정할 수 있습니다.' : '이 화면에서 실제 삭제를 실행하지 않습니다.'}</span></div>
        {saved ? <p className="wp-meta">최근 적용 예시: 원본 {saved.retention.originals}일 · 실행 로그 {saved.retention.logs}일 · 결정 이력 {saved.retention.decisions}일</p> : null}
      </> : null}
      {area === 'audit' ? <>
        <div className="wp-panel-heading"><div><span className="wp-kicker">Audit Trail</span><h3>누가 무엇을 확인하고 결정했는지</h3></div><History size={22} aria-hidden="true" /></div>
        <p className="wp-muted">프로토타입에서 발생한 조작을 상단에 표시합니다. 실제 감사 로그는 사용자·프로젝트·작업·변경 전후 값·시각·결과를 함께 기록하는 설계입니다.</p>
        <List className="wp-security-audit">{[...auditEvents, ...AUDIT_FIXTURES].slice(0, 24).map((event, index) => <ListItem key={`${event.id || 'event'}-${index}`}><ListItem.Title>{event.message}</ListItem.Title><ListItem.Meta><time>{auditTime(event.time)}</time></ListItem.Meta><Badge tone="quiet">{String(event.id).startsWith('security-fixture') ? '예시 이력' : '이번 체험'}</Badge></ListItem>)}</List>
      </> : null}
      <PreviewNotice>{notice}</PreviewNotice>
    </Tabs.Panel>
    <section className="wp-panel wp-stack"><div className="wp-panel-heading"><div><span className="wp-kicker">Desktop Security</span><h3>개인 CLI 실행의 경계</h3></div><Monitor size={22} aria-hidden="true" /></div><div className="wp-grid-two"><div className="wp-stack"><div className="wp-list-row"><strong>허용 작업·파일 경로</strong><span className="wp-muted">코드 분석·수정·테스트 등 승인한 작업만 실행합니다. 예시 허용 경로는 저장소의 src/와 tests/이며, .env·개인 인증 파일은 제외합니다.</span></div><div className="wp-list-row"><strong>로컬 인증과 프로세스 제어</strong><span className="wp-muted">개인 CLI 자격 증명은 중앙 DB에 저장하지 않습니다. 허용된 IPC API, 취소·시간 제한·오프라인·인증 오류 처리를 구분합니다.</span></div></div><div className="wp-stack"><div className="wp-list-row"><strong>실행 로그와 공유 결과</strong><span className="wp-muted">인증 정보와 고객 민감정보를 제외한 실행 이력을 남깁니다. 개인 실행 결과는 저장 범위와 공유 권한을 검토한 뒤 중앙 프로젝트 기록에 연결합니다.</span></div><div className="wp-action-row">{onNavigate ? <Button type="button" variant="secondary" icon={ArrowRight} onClick={() => onNavigate('execution')}>중앙·개인 실행 비교</Button> : null}</div></div></div></section>
  </Tabs>;
}

const WEEKS = [
  { week: 1, title: '기술 검증과 기반 설계', work: '기술 PoC, Context Integration 착수, 보안 기본 설계', output: '개인 CLI 실행/스트리밍 PoC, 데이터 소스·권한·핵심 엔티티 정의', decision: 'Electron/Tauri 방향, 개인 CLI 인증·실행 방식, 수집 범위 결정', route: 'execution' },
  { week: 2, title: '수집과 관계 연결', work: 'Integration 마무리, Traceability', output: '관계 모델·출처 링크 프로토타입', decision: '컨텍스트 연결 방식 및 실행 요청 모델 검토', route: 'context' },
  { week: 3, title: '근거를 찾는 검색', work: 'Traceability, Smart Retrieval', output: '검색·출처 표시 프로토타입', decision: '검색 질문과 결과 품질 검토', route: 'context' },
  { week: 4, title: '리스크 탐지 기준', work: 'Smart Retrieval, Risk Detection', output: '기본 리스크 규칙 및 탐지 결과', decision: '리스크 분류·판정 기준 결정', route: 'context' },
  { week: 5, title: '작업 전 작업 전 점검', work: 'Risk Detection, Pre-flight Check', output: '착수 전 점검 화면 및 결과', decision: '점검 항목·승인 흐름 결정', route: 'preflight' },
  { week: 6, title: '상태와 응답 대기', work: 'Pre-flight, Progress Monitoring', output: 'Task 상태·대기 시간 표시', decision: '모니터링 범위 결정', route: 'tasks' },
  { week: 7, title: '범위와 충돌 관리', work: 'Monitoring, Scope & Conflict, 자동화 설계', output: '범위 연결·중복 탐지 프로토타입', decision: '충돌 판정 및 자동화 범위 결정', route: 'tasks' },
  { week: 8, title: '자동화와 산출물', work: 'Task Automation, Auto Deliverables', output: '요청→Task 흐름, 산출물 템플릿', decision: '자동화 결과·문서 형식 검토', route: 'execution' },
  { week: 9, title: '사례 재사용', work: 'Auto Deliverables, Knowledge Reuse', output: '산출물 개선, 사례 추천', decision: '재사용 가능한 사례 기준 결정', route: 'knowledge' },
  { week: 10, title: '반복 패턴 축적', work: 'Knowledge Reuse, Pattern Library', output: '패턴 추출·저장 프로토타입', decision: '패턴 분류 체계 검토', route: 'knowledge' },
  { week: 11, title: '근거 있는 계획 제안', work: 'Pattern Library, Planning Intelligence', output: '일정 위험 분석·계획 제안 및 대화형 기획 검토', decision: '계획 제안 근거·실행 대상 라우팅 검토', route: 'knowledge' },
  { week: 12, title: '통합과 회귀 검증', work: '통합·회귀 테스트', output: 'Layer 간 연동, 권한·CLI 실행·오류 테스트', decision: '핵심 시나리오 수용 여부 결정', route: 'validation' },
  { week: 13, title: '피드백 반영과 시연', work: '피드백 반영·시연 준비', output: '수정, 문서화, 데모 시나리오', decision: 'MVP 범위 및 후속 로드맵 확정', route: 'overview' },
];
const ALLOCATION = [['Context', 17, '수집·관계·검색·리스크'], ['Workflow', 16, '검증·모니터링·범위·자동화'], ['Knowledge', 14, '산출물·사례·패턴·계획'], ['Security', 9, '권한·격리·추상화·감사'], ['통합·피드백 여유', 9, '회귀 테스트·시연 준비']];
const REVIEW_DAYS = [
  { day: '월', title: '범위 확정', work: '지난 피드백 검토, 이번 주 구현 범위 확정', output: '우선순위·요구사항·완료 기준', review: true },
  { day: '화', title: '프로토타입 구현', work: '핵심 프로토타입 구현', output: '동작 가능한 중간 버전' },
  { day: '수', title: '설계 검토', work: '회의 전 프로토타입 공유 및 검토', output: '설계 결정·피드백·미해결 질문', review: true },
  { day: '목', title: '피드백 반영', work: '피드백 반영 및 다음 기능 구현', output: '개선 버전·테스트 결과' },
  { day: '금', title: '결과·다음 주 검토', work: '회의 전 공유, 주간 결과 검토', output: '완료 범위·다음 주 의존성·우선순위', review: true },
];
export function RoadmapPreview({ onEvent, onNavigate, active = true }) {
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [reviewDay, setReviewDay] = useState('월');
  const [notice, setNotice] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewQuestion, setReviewQuestion] = useState('');
  useEffect(() => { if (!active) setReviewOpen(false); }, [active]);
  const week = WEEKS[selectedWeek - 1];
  const day = REVIEW_DAYS.find(item => item.day === reviewDay);
  function openReview() { setReviewQuestion(week.decision); setReviewOpen(true); }
  function saveReview(event) {
    event.preventDefault();
    const message = `${selectedWeek}주 ${reviewDay}요일 검토안 예시를 저장했습니다: ${reviewQuestion.trim()}`;
    onEvent?.(message); setNotice(message); setReviewOpen(false);
  }
  return <div className="wp-stack wp-roadmap-preview">
    <div className="wp-roadmap-summary wp-panel"><div><span className="wp-kicker">Prototype-first</span><h3>약 13주 · 65 작업일</h3><p className="wp-muted">주 5일 투입 기준. 초기 CLI·Desktop PoC 결과에 따라 범위와 일정을 다시 산정합니다.</p></div><div className="wp-roadmap-total"><strong>56<span>일 기능 구현</span></strong><span aria-hidden="true">+</span><strong>9<span>일 통합·피드백 여유</span></strong></div></div>
    <section className="wp-panel wp-stack"><div className="wp-panel-heading"><div><span className="wp-kicker">작업량 추정</span><h3>4개 Layer와 통합 검증</h3></div><Badge tone="quiet">설계·구현·기본 테스트 포함</Badge></div><div className="wp-roadmap-allocation">{ALLOCATION.map(([name, days, description]) => <div key={name}><strong>{days}<small>일</small></strong><span>{name}</span><p className="wp-meta">{description}</p></div>)}</div><p className="wp-muted">Security 9일은 후반에 몰아서 진행하지 않고 1주 차부터 병행합니다. Execution Runtime은 별도 기술 기반이며, 초기 PoC와 Workflow·Backend 연동으로 검증합니다. 외부 승인 대기 시간은 별도입니다.</p></section>
    <Tabs className="wp-panel wp-stack" value={String(selectedWeek)} onValueChange={value => { setSelectedWeek(Number(value)); setNotice(''); }} variant="text" size="sm"><div className="wp-panel-heading"><div><span className="wp-kicker">주차별 프로토타입</span><h3>만들기 전에 결정할 것, 만든 뒤 확인할 것</h3></div><span className="wp-meta">주차를 선택해 확인하세요.</span></div><Tabs.List className="wp-roadmap-weeks" aria-label="구현 계획 주차 선택">{WEEKS.map(item => <Tabs.Trigger key={item.week} value={String(item.week)}>{item.week}주</Tabs.Trigger>)}</Tabs.List><Tabs.Panel value={String(selectedWeek)} keepMounted className="wp-stack"><div className="wp-roadmap-week-detail"><div className="wp-row"><Badge tone="quiet">{selectedWeek}주</Badge><h4>{week.title}</h4></div><dl className="wp-roadmap-deliverables"><div><dt>구현 범위</dt><dd>{week.work}</dd></div><div><dt>프로토타입·산출물</dt><dd>{week.output}</dd></div><div><dt>회의에서 결정</dt><dd>{week.decision}</dd></div></dl>{selectedWeek === 1 ? <Notice tone="brand" className="wp-callout">개인 CLI 실행·인증·스트리밍·취소·오류 복구를 작은 PoC로 확인합니다. 개인 CLI 연동이 초기 필수라면 Electron을 우선 검토하고 Tauri를 대안으로 비교합니다. 필수가 아니라면 Web-first도 재검토합니다.</Notice> : null}{selectedWeek === 13 ? <Notice tone="brand" className="wp-callout">새로운 대형 기능을 추가하기보다 통합·검증·시연 안정화에 집중합니다.</Notice> : null}<div className="wp-action-row"><Button type="button" variant="secondary" onClick={openReview}>이 주차 검토안 작성</Button>{onNavigate ? <Button type="button" variant="ghost" icon={ArrowRight} onClick={() => onNavigate(week.route)}>관련 화면 보기</Button> : null}</div></div></Tabs.Panel></Tabs>
    <Tabs className="wp-panel wp-stack" value={reviewDay} onValueChange={setReviewDay} variant="text" size="sm"><div className="wp-panel-heading"><div><span className="wp-kicker">주간 반복 루프</span><h3>월·수·금, 보고보다 결정</h3></div><Badge tone="quiet">매주 반복</Badge></div><Tabs.List className="wp-action-row" aria-label="주간 작업 요일 선택">{REVIEW_DAYS.map(item => <Tabs.Trigger key={item.day} value={item.day}>{item.day}요일 · {item.title}</Tabs.Trigger>)}</Tabs.List><Tabs.Panel value={reviewDay} keepMounted className="wp-stack"><div className="wp-list-row"><strong>{day.day}요일 · {day.work}</strong><span className="wp-muted">남기는 것: {day.output}</span></div><p className="wp-muted">회의 최소 반나절 전에 화면 링크와 검토 질문을 공유합니다. 미확정 항목은 보류 상태로 남기고, 다음 구현의 완료 기준으로 연결합니다.</p><div className="wp-action-row"><Button type="button" variant="secondary" onClick={openReview}>{selectedWeek}주 {reviewDay}요일 검토안 작성</Button></div><PreviewNotice>{notice}</PreviewNotice></Tabs.Panel></Tabs>
    <section className="wp-panel wp-stack"><div className="wp-panel-heading"><div><span className="wp-kicker">일정 확정 전</span><h3>먼저 맞춰야 하는 조건</h3></div></div><List className="wp-roadmap-dependencies"><ListItem><ListItem.Title>실제 주당 투입 일수와 개인 CLI 연동의 MVP 필수 여부</ListItem.Title></ListItem><ListItem><ListItem.Title>CLI 인터페이스·인증·사용량 정책과 중앙/개인 실행 계정 구분</ListItem.Title></ListItem><ListItem><ListItem.Title>초기 데이터 소스·API 접근 권한, 고객 보안 승인</ListItem.Title></ListItem><ListItem><ListItem.Title>산출물 템플릿 1~2종, 실제 사례와 검증용 검색 질문</ListItem.Title></ListItem><ListItem><ListItem.Title>자동화 범위·승인 기준·보존 정책·Desktop 업데이트 방식</ListItem.Title></ListItem></List><p className="wp-meta">문서의 추정 일정에 기반한 로드맵입니다. 주차 선택이나 검토안 저장은 실제 프로젝트 일정과 진행률을 변경하지 않습니다.</p></section>
    {active && reviewOpen ? <Modal title={`${selectedWeek}주 ${reviewDay}요일 검토안`} eyebrow="예시 작성" onClose={() => setReviewOpen(false)}><form onSubmit={saveReview}><div className="modal-body wp-stack"><div className="wp-list-row"><strong>이번에 구현한 것</strong><span className="wp-muted">{week.output}</span></div><FormField label="확인·결정이 필요한 것" hint="데이터 모델·판정 기준·예외·자동화 범위·CLI 실행 대상 등을 함께 확인합니다."><Textarea rows={4} value={reviewQuestion} onChange={event => setReviewQuestion(event.target.value)} required maxLength={1200} /></FormField><div className="wp-list-row"><strong>다음 작업</strong><span className="wp-muted">{WEEKS[selectedWeek]?.work || 'MVP 범위 및 후속 로드맵 확정'} · 회의 결과를 완료 기준에 반영</span></div><p className="wp-meta">저장은 이번 미리보기의 활동 이력에만 반영됩니다. 팀원에게 발송하지 않습니다.</p></div><div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setReviewOpen(false)}>취소</Button><Button type="submit" disabled={!reviewQuestion.trim()}>검토안 예시 저장</Button></div></form></Modal> : null}
  </div>;
}
