import { useSharedView } from './shared-view.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCheck, Download, FolderKanban, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, FormField, Modal, Spinner, dateTime, projectPath, Input, Textarea, Select, ControlButton, Disclosure, Tabs, Notice } from './ui.jsx';
import './work-items.css';
import { TaskAutomationBoard } from './task-automation.jsx';

const STATES = { todo: ['할 일', 'quiet'], in_progress: ['진행 중', 'blue'], blocked: ['차단됨', 'red'], qa: ['QA 대기', 'amber'], done: ['완료', 'green'] };
const NEXT = { todo: ['in_progress', 'blocked'], in_progress: ['todo', 'blocked', 'qa'], blocked: ['todo', 'in_progress', 'qa'], qa: ['todo', 'in_progress', 'blocked', 'done'], done: ['todo'] };
const REVIEWERS = ['owner', 'reviewer'];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const overdue = (item, date) => item.status !== 'done' && item.due_on && item.due_on < date;
const initialForm = item => ({ status: item.status, assignee_id: item.assignee_id || '', due_on: item.due_on || '', blocker: item.blocker || '', note: '', qa_evidence: '' });
function StateBadge({ status }) { return <Badge tone={STATES[status]?.[1]}>{STATES[status]?.[0] || status}</Badge>; }

export function WorkItems({ projectId, request, role, userId, notify, onChanged, onOpenImplementation, onOpenGovernance, initialItemId, onDirty, onOpenSettings, onOpenQuestions }) {
  const sharedView = useSharedView();
  const route = projectPath(projectId), canReview = !sharedView && REVIEWERS.includes(role);
  const [data, setData] = useState(null), [plans, setPlans] = useState([]), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all'), [query, setQuery] = useState(''), [selected, setSelected] = useState(null), [importing, setImporting] = useState(false), [opening, setOpening] = useState(false), [detailError, setDetailError] = useState(null);
  const alive = useRef(true), controller = useRef(null), detailController = useRef(null), initialDetail = useRef(null);
  const load = useCallback(async () => {
    controller.current?.abort(); const c = new AbortController(); controller.current = c; setBusy(true);
    try {
      const [items, planData] = await Promise.all([request(`${route}/work-items`, { signal: c.signal }), request(`${route}/implementation-plans`, { signal: c.signal })]);
      if (alive.current && !c.signal.aborted) { setData(items); setPlans(planData.plans); setError(null); }
    } catch (err) { if (alive.current && err.name !== 'AbortError') setError(err); }
    finally { if (alive.current && !c.signal.aborted) setBusy(false); }
  }, [route, request]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; controller.current?.abort(); detailController.current?.abort(); }; }, [load]);
  const open = useCallback(async (item) => {
    detailController.current?.abort(); const c = new AbortController(); detailController.current = c; setOpening(true); setDetailError(null);
    try { const result = await request(`${route}/work-items/${encodeURIComponent(item.id)}`, { signal: c.signal }); if (alive.current && !c.signal.aborted) setSelected(result.item); }
    catch (err) { if (alive.current && !c.signal.aborted && err.name !== 'AbortError') setDetailError({ error: err, id: item.id }); }
    finally { if (alive.current && !c.signal.aborted) setOpening(false); }
  }, [route, request]);
  useEffect(() => {
    if (!data || selected || importing || typeof initialItemId !== 'string' || !initialItemId) return;
    const key = `${route}:${initialItemId}`;
    if (initialDetail.current === key) return;
    // Wait for member metadata, and never replace an open editor with an incoming link.
    // Consume once so closing the detail does not reopen it on the same page.
    initialDetail.current = key;
    open({ id: initialItemId });
  }, [data, importing, initialItemId, open, route, selected]);
  async function saved(message) { if (!alive.current) return; notify?.(message); await load(); if (alive.current) await onChanged?.({ quiet: true }); }
  const items = data?.items || [], date = today(), imported = new Set(items.map(item => item.plan_id));
  const filters = [['all', '전체', items.length], ['mine', sharedView ? `${sharedView.source_user_name || '담당자'}님 작업` : '내 작업', items.filter(i => i.assignee_id === userId && i.status !== 'done').length], ['unassigned', '미배정', items.filter(i => !i.assignee_id && i.status !== 'done').length], ['overdue', '기한 초과', items.filter(i => overdue(i, date)).length], ['qa', 'QA 대기', items.filter(i => i.status === 'qa').length], ['blocked', '차단됨', items.filter(i => i.status === 'blocked').length]];
  const filtered = items.filter(item => {
    const matches = filter === 'all' || (filter === 'mine' ? item.assignee_id === userId && item.status !== 'done' : filter === 'unassigned' ? !item.assignee_id && item.status !== 'done' : filter === 'overdue' ? overdue(item, date) : item.status === filter);
    return matches && `${item.source_task.title} ${item.source_task.description} ${item.assignee_name || ''} ${item.plan_title}`.toLowerCase().includes(query.toLowerCase().trim());
  });
  return <section className="work-board" aria-label="기능별 작업 관리">
    <TaskAutomationBoard projectId={projectId} request={request} role={role} notify={notify} onDirty={onDirty} onChanged={onChanged} onSettings={onOpenSettings} onQuestions={onOpenQuestions} />
    <div className="work-board-intro"><div><h2>작업 목록</h2><p>{sharedView ? '작업별 담당자·기한·진행 상태와 이력을 확인하세요.' : '작업을 선택해 담당자·기한·상태를 변경하세요.'}</p></div><div className="inline-actions">{onOpenGovernance ? <Button variant="secondary" onClick={onOpenGovernance}>작업 전 점검·범위 승인</Button> : null}<Button variant="secondary" icon={RefreshCw} busy={busy} onClick={load}>새로고침</Button>{canReview ? <Button icon={Plus} onClick={() => setImporting(true)} disabled={!data}>승인 계획 가져오기</Button> : null}</div></div>
    <ErrorNotice error={error} onRetry={load} />
    <ErrorNotice error={detailError?.error} onRetry={detailError ? () => open({ id: detailError.id }) : undefined} />
    {opening ? <p className="work-helper" role="status">선택한 작업을 불러오고 있습니다.</p> : null}
    {!data ? busy ? <Spinner /> : null : <>
      <Tabs value={filter} onValueChange={setFilter} variant="text" size="sm" data-ctds="tabs"><Tabs.List aria-label="작업 필터">{filters.map(([id, label, count]) => <Tabs.Trigger key={id} value={id}>{label}<Badge tone="quiet">{String(count)}</Badge></Tabs.Trigger>)}</Tabs.List></Tabs>
      <div className="work-board-toolbar"><label className="work-search"><Search size={16} /><Input aria-label="작업 검색" placeholder="작업명·담당자·계획 검색" value={query} onChange={e => setQuery(e.target.value)} /></label><span>{filtered.length}개 작업 · 기한은 한국 시간 기준</span></div>
      {!items.length ? <Empty icon={FolderKanban} title="승인한 계획을 작업으로 이어가세요" action={<Button variant="secondary" onClick={onOpenImplementation}>AI 구현 작업 열기</Button>}>Nora 계획 승인과 업무 실행 검토의 범위 승인을 마친 뒤 가져오면 기능별 담당자와 진행 상태를 관리할 수 있습니다.</Empty> : !filtered.length ? <Empty compact title="조건에 맞는 작업이 없습니다">다른 필터나 검색어를 선택해 주세요.</Empty> : <div className="work-item-list" aria-busy={opening}>{filtered.map(item => <ControlButton className="work-item-row" key={item.id} onClick={() => open(item)} disabled={opening}>
        <div className="work-item-main"><div className="work-item-title"><span>{item.source_task_id}</span><strong>{item.source_task.title}</strong><StateBadge status={item.status} /></div><p>{item.plan_title}</p>{item.stale_reasons.length ? <span className="work-item-stale"><AlertTriangle size={13} />기획·설정 변경 · 재검토 필요</span> : null}{item.blocker ? <p className="work-item-blocker">{item.blocker}</p> : null}</div>
        <div className="work-item-meta"><span>{item.assignee_name || '담당자 미배정'}</span><span className={overdue(item, date) ? 'is-overdue' : ''}><CalendarDays size={13} />{item.due_on || '마감일 미정'}{overdue(item, date) ? ' · 기한 초과' : ''}</span></div><ArrowRight size={16} />
      </ControlButton>)}</div>}
      <p className="work-board-footnote">작업 등록 후 담당자가 진행 내용을 기록하고, 검토자가 QA 근거를 확인해 완료를 확정합니다.</p>
    </>}
    {importing ? <ImportPlan plans={plans} imported={imported} route={route} request={request} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await saved('승인한 계획을 기능별 작업으로 등록했습니다.'); }} onOpenImplementation={() => { setImporting(false); onOpenImplementation(); }} /> : null}
    {selected ? <WorkDetail key={selected.id} initial={selected} members={data?.members || []} route={route} request={request} role={role} userId={userId} onClose={() => setSelected(null)} onSaved={saved} onOpenImplementation={() => { setSelected(null); onOpenImplementation(); }} /> : null}
  </section>;
}

function ImportPlan({ plans, imported, route, request, onClose, onDone, onOpenImplementation }) {
  const available = plans.filter(p => p.status === 'approved' && !p.stale_reasons?.length && !imported.has(p.id));
  const [id, setId] = useState(available[0]?.id || ''), [ack, setAck] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const plan = available.find(p => p.id === id);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(null); try { await request(`${route}/implementation-plans/${id}/work-items`, { method: 'POST', body: { acknowledge_tasks: ack } }); if (alive.current) await onDone(); } catch (err) { if (alive.current) setError(err); } finally { if (alive.current) setBusy(false); } }
  return <Modal title="승인 계획 가져오기" eyebrow="CONFIRM THE WORK" onClose={onClose} busy={busy} wide><form onSubmit={submit}><div className="modal-body"><p className="form-intro">업무 실행 검토에서 승인 계획의 작업 전 점검과 범위 승인을 먼저 완료한 뒤 업무로 등록합니다. 담당자와 마감일은 등록 후 정합니다.</p>{!available.length ? <Empty compact title="새로 가져올 승인 계획이 없습니다" action={<Button type="button" variant="secondary" onClick={onOpenImplementation}>AI 구현 작업 열기</Button>}>이미 등록했거나 기획·설정이 변경된 계획은 제외됩니다. 최신 계획을 승인해 주세요.</Empty> : <><FormField label="승인된 계획"><Select value={id} disabled={busy} onChange={e => { setId(e.target.value); setAck(false); }}>{available.map(p => <option key={p.id} value={p.id}>{p.result.title} · {dateTime(p.created_at)}</option>)}</Select></FormField><ol className="work-import-tasks">{plan?.result.tasks.map(task => <li key={task.id}><strong>{task.title}</strong><p>{task.description}</p><ul>{task.acceptance_criteria.map((criterion, i) => <li key={i}>{criterion}</li>)}</ul></li>)}</ol><label className="checkbox-label"><Input type="checkbox" required disabled={busy} checked={ack} onChange={e => setAck(e.target.checked)} /><span>작업 범위와 완료 기준을 확인했고, 팀 업무로 등록합니다.</span></label><p className="work-board-footnote">코드 작성은 AI 구현 작업에서 별도로 실행 요청합니다.</p></>}<ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>닫기</Button>{plan ? <Button type="submit" icon={Plus} busy={busy} disabled={!ack}>{plan.result.tasks.length}개 작업 등록</Button> : null}</footer></form></Modal>;
}

function WorkDetail({ initial, members, route, request, role, userId, onClose, onSaved, onOpenImplementation }) {
  const sharedView = useSharedView();
  const [item, setItem] = useState(initial), [form, setForm] = useState(() => initialForm(initial)), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reviewer = !sharedView && REVIEWERS.includes(role), canEdit = !sharedView && (reviewer || (role === 'member' && item.assignee_id === userId));
  const stale = item.stale_reasons.length > 0, dependencyPending = item.dependencies.some(d => d.status !== 'done');
  const options = [item.status, ...NEXT[item.status]].filter(s => reviewer || (s !== 'done' && item.status !== 'done') || s === item.status);
  const field = key => ({ value: form[key], onChange: e => setForm(current => ({ ...current, [key]: e.target.value })) });
  async function reload() { setBusy(true); try { const result = await request(`${route}/work-items/${item.id}`); if (alive.current) { setItem(result.item); setForm(initialForm(result.item)); setError(null); } } catch (err) { if (alive.current) setError(err); } finally { if (alive.current) setBusy(false); } }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null);
    const body = { expected_version: item.version, note: form.note.trim() };
    if (form.status !== item.status) body.status = form.status;
    if (reviewer && (form.assignee_id || null) !== item.assignee_id) body.assignee_id = form.assignee_id || null;
    if (reviewer && (form.due_on || null) !== item.due_on) body.due_on = form.due_on || null;
    if (form.status === 'blocked') body.blocker = form.blocker;
    if (form.status === 'done' && item.status !== 'done') body.qa_evidence = form.qa_evidence.trim();
    try { const result = await request(`${route}/work-items/${item.id}`, { method: 'PATCH', body }); if (alive.current) { setItem(result.item); setForm(initialForm(result.item)); await onSaved('작업 상태와 검토 이력을 저장했습니다.'); } } catch (err) { if (alive.current) setError(err); } finally { if (alive.current) setBusy(false); }
  }
  return <Modal title={item.source_task.title} eyebrow={`${item.source_task_id} · ${item.plan_title}`} busy={busy} onClose={onClose} wide><div className="modal-body work-detail">
    <div className="work-detail-status"><StateBadge status={item.status} /><span>최근 변경 {dateTime(item.updated_at)}</span></div><p className="work-description">{item.source_task.description}</p>
    {stale ? <Notice className="notice warning"><AlertTriangle size={18} /><div><strong>기획 또는 프로젝트 설정이 바뀌었습니다.</strong><p>최신 계획을 검토해 주세요. 기록 추가·배정·차단 처리는 가능하지만 진행·QA·완료로 넘길 수 없습니다.</p></div></Notice> : null}
    <section className="work-detail-section"><h3>완료 기준</h3><ul>{item.source_task.acceptance_criteria.map((criterion, i) => <li key={i}>{criterion}</li>)}</ul></section>
    {item.dependencies.length ? <section className="work-detail-section"><h3>먼저 완료할 작업</h3><ul className="work-dependencies">{item.dependencies.map(d => <li key={d.source_task_id}><span>{d.source_task_id} · {d.title}</span><StateBadge status={d.status} /></li>)}</ul></section> : null}
    <Disclosure className="work-source"><summary>기획 원문 근거 · {item.source_task.evidence.length}개</summary>{(item.evidence_context || []).map((e, i) => <article key={i}><strong>{e.title} · {e.locator?.label || e.segment_id}</strong><p>{e.text}</p>{!sharedView ? <a href={`${route}/revisions/${encodeURIComponent(e.revision_id)}/original`}>원본 내려받기<Download size={12} /></a> : null}</article>)}</Disclosure>
    {canEdit ? <form className="work-edit-form" onSubmit={submit}><h3>담당·진행 내용 기록</h3><div className="work-edit-grid"><FormField label="진행 상태"><Select {...field('status')} disabled={busy}>{options.map(s => <option key={s} value={s} disabled={s !== item.status && ['in_progress', 'qa', 'done'].includes(s) && (stale || dependencyPending)}>{STATES[s][0]}</option>)}</Select></FormField><FormField label="담당자"><Select {...field('assignee_id')} disabled={!reviewer || busy}><option value="">미배정</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></FormField><FormField label="마감일"><Input type="date" {...field('due_on')} onInput={e => setForm(current => ({ ...current, due_on: e.target.value }))} disabled={!reviewer || busy} min="0001-01-01" max="9999-12-31" /></FormField></div>
      {dependencyPending ? <p className="work-helper">선행 작업이 모두 완료되면 진행·QA·완료 상태를 선택할 수 있습니다.</p> : null}
      {form.status === 'blocked' ? <FormField label="진행을 막는 이유"><Textarea {...field('blocker')} rows={2} maxLength={2000} required disabled={busy} /></FormField> : null}
      {form.status === 'done' && item.status !== 'done' ? <FormField label="QA 검토 근거" hint="완료 기준별 확인 결과나 테스트·검토 기록 링크를 남겨 주세요."><Textarea {...field('qa_evidence')} rows={3} maxLength={5000} required disabled={busy} /></FormField> : null}
      <FormField label="변경 사유·진행 내용"><Textarea {...field('note')} rows={3} maxLength={2000} required disabled={busy} placeholder="진행한 내용, 결정 이유 또는 다음 확인 사항" /></FormField>
      <ErrorNotice error={error} />{error?.status === 409 ? <div className="work-conflict"><p>입력 내용은 유지했습니다. 최신 내용을 다시 불러오면 작성 중인 입력은 초기화됩니다.</p><Button type="button" variant="secondary" disabled={busy} onClick={reload}>입력 초기화 후 최신 내용 불러오기</Button></div> : null}
      <div className="work-save"><span>{reviewer ? '완료는 QA 검토 후 확정해 주세요.' : '담당자·기한 변경과 완료 확정은 검토자가 진행합니다.'}</span><Button type="submit" icon={CheckCheck} busy={busy}>변경 이력 저장</Button></div>
    </form> : <p className="role-note">진행 내용은 배정된 담당자 또는 검토자가 기록합니다.</p>}
    <section className="work-detail-section"><h3>변경·검토 이력 <small>{item.history.length}건</small></h3><ol className="work-history">{item.history.map(event => <li key={event.id}><div><strong>{event.actor_name}</strong><time>{dateTime(event.created_at)}</time></div><p>{event.note}</p>{event.before && event.before.status !== event.after.status ? <span className="work-history-change">{STATES[event.before.status][0]} → {STATES[event.after.status][0]}</span> : null}{event.before && event.before.assignee_id !== event.after.assignee_id ? <span className="work-history-change">담당자: {members.find(m => m.id === event.after.assignee_id)?.name || (event.after.assignee_id ? '이전 구성원' : '미배정')}</span> : null}{event.before && event.before.due_on !== event.after.due_on ? <span className="work-history-change">마감일: {event.after.due_on || '미정'}</span> : null}{event.qa_evidence ? <blockquote><strong>QA 검토 근거</strong><p>{event.qa_evidence}</p></blockquote> : null}</li>)}</ol></section>
  </div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onOpenImplementation}>AI 구현 결과 확인</Button><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>닫기</Button></footer></Modal>;
}
