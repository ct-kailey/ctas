import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge, Button, ControlButton, Disclosure, ErrorNotice, FormField, Input, Notice, Select, Spinner, Tabs, Textarea, dateTime, projectPath } from './ui.jsx';
import { useSharedView } from './shared-view.jsx';
import { useConfirm } from './confirmation.jsx';
import { retainProjectRequest } from './nora-workspace-state.mjs';
import { RISK_STATES } from './task-automation-state.mjs';
import { IMPLEMENTATION_NOTE_HISTORY, IMPLEMENTATION_NOTE_KINDS, IMPLEMENTATION_NOTE_STATES, implementationExecutionView, implementationNoteCreatePayload, implementationNoteDraft, implementationNoteEvidence, implementationNotePermissions, implementationNoteReviewStatus, mergeImplementationNotesPage, mergeImplementationNoteHistory } from './implementation-notes-state.mjs';
import './implementation-notes.css';

function useNotesList(path, request) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  const state = useRef({ active: true, sequence: 0, controller: null, page: null, more: false });
  const load = useCallback(async (more = false) => {
    state.current.controller?.abort(); const controller = new AbortController(), sequence = ++state.current.sequence;
    state.current.controller = controller; state.current.more = more;
    const prior = more ? state.current.page : null, current = () => state.current.active && sequence === state.current.sequence && !controller.signal.aborted;
    setLoading(true);
    try { const page = await request(`${path}${path.includes('?') ? '&' : '?'}limit=50&offset=${prior?.next_offset || 0}`, { signal: controller.signal }); if (current()) { const value = mergeImplementationNotesPage(prior, page); state.current.page = value; setData(value); setError(null); } }
    catch (err) { if (current() && err.name !== 'AbortError') setError(err); }
    finally { if (current()) setLoading(false); }
  }, [path, request]);
  useEffect(() => { state.current.active = true; state.current.page = null; setData(null); setError(null); void load(); return () => { state.current.active = false; state.current.sequence += 1; state.current.controller?.abort(); }; }, [load]);
  return { data, loading, error, load, retry: () => load(state.current.more) };
}

function NoteBadges({ note }) {
  return <span className="implementation-note-badges"><Badge tone={note.kind === 'work_gap' ? 'red' : 'amber'}>{IMPLEMENTATION_NOTE_KINDS[note.kind] || '기록 확인 필요'}</Badge><Badge tone="quiet">{IMPLEMENTATION_NOTE_STATES[note.status] || '상태 확인 필요'}</Badge>{note.origin === 'nora' && note.execution_context?.contract_version === '1.0' ? <Badge tone="blue">자동 기록</Badge> : null}</span>;
}

export function RelatedImplementationNotes({ projectId, request, taskId, draftId, onOpen }) {
  const query = new URLSearchParams(taskId ? { related_task_id: taskId } : { task_draft_id: draftId });
  const remote = useNotesList(`${projectPath(projectId)}/implementation-notes?${query}`, request);
  return <section className="implementation-related-notes"><h3>이 작업의 임시 구현·작업 공백</h3><ErrorNotice error={remote.error} onRetry={remote.retry} />{!remote.data ? remote.loading ? <Spinner label="연결된 기록을 불러오고 있습니다" /> : null : <><div className="implementation-note-list">{remote.data.notes.map(note => <ControlButton key={note.id} type="button" variant="outline" onClick={() => onOpen(note.id)}><span><NoteBadges note={note} /><strong>{note.title}</strong></span></ControlButton>)}</div>{!remote.data.notes.length ? <p className="task-auto-help">연결된 기록이 없습니다. 구현 완료를 의미하지는 않습니다.</p> : null}<NotePagination remote={remote} /></>}</section>;
}

function NotePagination({ remote }) {
  if (!remote.data?.total) return null;
  return <div className="implementation-note-actions"><small>{remote.data.notes.length} / {remote.data.total}개 표시</small>{remote.data.has_more ? <Button type="button" variant="secondary" busy={remote.loading} onClick={() => remote.load(true)}>기록 더 불러오기</Button> : remote.data.notes.length < remote.data.total ? <Button type="button" variant="secondary" busy={remote.loading} onClick={() => remote.load()}>변경된 목록 다시 불러오기</Button> : null}</div>;
}

export function ImplementationNotesPanel({ projectId, request, role, notify, onDirty, onChanged, onSourceRevision, target, analyses, onRefreshAnalysis, refreshKey }) {
  const sharedView = useSharedView(), permissions = implementationNotePermissions(role, sharedView), confirm = useConfirm();
  const [kind, setKind] = useState(''), [status, setStatus] = useState(''), [selected, setSelected] = useState(null), [dirty, setDirty] = useState(false), [editingBusy, setEditingBusy] = useState(false);
  const seenTarget = useRef(null), mounted = useRef(true), panel = useRef(null);
  const route = `${projectPath(projectId)}/implementation-notes`, remote = useNotesList(`${route}?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(status ? { status } : {}) })}`, request);
  const previousRefresh = useRef(refreshKey);
  useEffect(() => { if (previousRefresh.current !== refreshKey) { previousRefresh.current = refreshKey; void remote.load(); } }, [refreshKey, remote.load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  const select = useCallback(async value => {
    if (editingBusy) return;
    if (dirty && !await confirm('작성 중인 기록·피드백을 버리고 이동할까요?')) return;
    if (!mounted.current) return; setDirty(false); setSelected(value); panel.current?.scrollIntoView({ block: 'start' });
  }, [dirty, editingBusy, confirm]);
  useEffect(() => { if (target && seenTarget.current !== target) { seenTarget.current = target; void select(target); } }, [target, select]);
  async function changed(message) { notify?.(message); await remote.load(); await onChanged?.({ quiet: true }); }
  return <section className="implementation-notes" aria-label="임시 구현·작업 공백" ref={panel}>
    <header className="task-auto-heading"><div><h2>임시 구현·작업 공백</h2><p>AI가 개발 후 임시 구현 방식과 남은 공백을 자동으로 기록합니다. 내용을 검토하고 피드백을 남겨 보완하세요.</p></div>{!selected ? <div className="implementation-note-actions"><Button type="button" variant="secondary" icon={RefreshCw} onClick={() => remote.load()}>새로고침</Button>{permissions.canWrite ? <Button type="button" variant="secondary" icon={Plus} onClick={() => select({ create: {} })}>추가 기록 직접 남기기</Button> : null}</div> : null}</header>
    {selected ? <><Button type="button" variant="ghost" icon={ArrowLeft} disabled={editingBusy} onClick={() => select(null)}>기록 목록으로</Button>{selected.create ? <ImplementationNoteCreate key={selected.nonce || 'create'} route={route} projectId={projectId} request={request} seed={selected.create} canWrite={permissions.canWrite} onDirty={setDirty} onBusy={setEditingBusy} onCreated={async note => { setDirty(false); setSelected({ id: note.id }); await changed('임시 구현·작업 공백을 원문 근거와 함께 기록했습니다.'); }} /> : <ImplementationNoteDetail key={selected.id} id={selected.id} route={route} projectId={projectId} request={request} permissions={permissions} onDirty={setDirty} onBusy={setEditingBusy} onChanged={changed} onSourceRevision={onSourceRevision} analyses={analyses} onRefreshAnalysis={onRefreshAnalysis} />}</> : <>
      <div className="implementation-note-filters"><Tabs value={kind || 'all'} onValueChange={value => setKind(value === 'all' ? '' : value)} variant="segmented" size="sm"><Tabs.List aria-label="기록 종류"><Tabs.Trigger value="all">전체</Tabs.Trigger><Tabs.Trigger value="temporary_decision">임시 구현</Tabs.Trigger><Tabs.Trigger value="work_gap">작업 공백</Tabs.Trigger></Tabs.List></Tabs><FormField label="검토 상태"><Select value={status} onChange={event => setStatus(event.target.value)}><option value="">모든 상태</option>{Object.entries(IMPLEMENTATION_NOTE_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField></div>
      <ErrorNotice error={remote.error} onRetry={remote.retry} />{!remote.data ? remote.loading ? <Spinner label="임시 구현·작업 공백 기록을 불러오고 있습니다" /> : null : <><div className="implementation-note-list">{remote.data.notes.map(note => <ControlButton key={note.id} type="button" variant="outline" onClick={() => select({ id: note.id })}><span><NoteBadges note={note} /><strong>{note.title}</strong><small>{note.source_title} · {dateTime(note.updated_at)}</small></span></ControlButton>)}</div>{!remote.data.notes.length ? <p className="task-auto-help">이 조건에 맞는 기록이 없습니다. 기록 유무만으로 작업 완료를 판단하지 않습니다.</p> : null}<NotePagination remote={remote} /></>}
    </>}
  </section>;
}

function RevisionEvidencePicker({ projectId, request, seed, lockedSource, policyOnly = false, onChange, disabled }) {
  const route = projectPath(projectId), [sourceId, setSourceId] = useState(seed?.source_revision_id || ''), [revision, setRevision] = useState(null), [query, setQuery] = useState(''), [search, setSearch] = useState(null), [offset, setOffset] = useState(0), [catalog, setCatalog] = useState(null);
  const [segmentId, setSegmentId] = useState(seed?.evidence?.[0]?.segment_id || ''), [quote, setQuote] = useState(seed?.evidence?.[0]?.quote || ''), [error, setError] = useState(null), [searchError, setSearchError] = useState(null), [loading, setLoading] = useState(false), [searching, setSearching] = useState(false);
  const [sourceAttempt, setSourceAttempt] = useState(0), [searchAttempt, setSearchAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setRevision(null); setError(null); if (!sourceId) return () => controller.abort(); setLoading(true);
    request(`${route}/revisions/${encodeURIComponent(sourceId)}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setRevision(data.revision); }).catch(err => { if (!controller.signal.aborted) setError(err); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [route, request, sourceId, sourceAttempt]);
  useEffect(() => {
    if (search === null) return; const controller = new AbortController(); setSearching(true);
    request(`${route}/context/search?${new URLSearchParams({ query: search, include_unapproved: 'true', limit: '10', offset: String(offset) })}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setCatalog(data); setSearchError(null); } }).catch(err => { if (!controller.signal.aborted) setSearchError(err); }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    return () => controller.abort();
  }, [route, request, search, offset, searchAttempt]);
  useEffect(() => { onChange(policyOnly && revision?.document_category !== 'policy' ? null : implementationNoteEvidence(revision, segmentId, quote)); }, [revision, segmentId, quote, onChange, policyOnly]);
  const segments = revision?.document_json?.segments?.filter(segment => segment.extraction_status === 'ok') || [], segment = segments.find(item => item.segment_id === segmentId), valid = implementationNoteEvidence(revision, segmentId, quote);
  function chooseSource(id) { setSourceId(id); setSegmentId(''); setQuote(''); onChange(null); }
  function searchSources() { setSearch(query.trim()); setOffset(0); setSearchAttempt(value => value + 1); }
  return <section className="implementation-note-evidence"><h4>현재 프로젝트의 원문 근거</h4>{policyOnly ? <p className="task-auto-help">최초 기록은 추출이 완료된 정책 문서에 연결합니다.</p> : null}{!lockedSource ? <><div className="implementation-note-actions"><Input aria-label="기록 근거 문서 검색" value={query} maxLength={500} disabled={disabled} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); searchSources(); } }} placeholder={policyOnly ? '정책 문서 검색' : '정책·검토 결과 문서 검색'} /><Button type="button" variant="secondary" icon={Search} busy={searching} disabled={disabled} onClick={searchSources}>찾기</Button></div><ErrorNotice error={searchError} onRetry={() => setSearchAttempt(value => value + 1)} />{catalog ? <><div className="implementation-note-list">{catalog.items?.filter(source => (source.internal_ref?.type || source.type) === 'revision').map(source => <Button key={source.id} type="button" variant="secondary" disabled={disabled} onClick={() => chooseSource(source.internal_ref?.id || source.id)}>{source.title} · {source.source_version || '문서 버전'}</Button>)}</div>{!catalog.items?.some(source => (source.internal_ref?.type || source.type) === 'revision') ? <p className="task-auto-help">이 페이지에 선택할 문서가 없습니다. 다음 페이지나 다른 검색어를 확인하세요.</p> : null}{offset || catalog.has_more ? <div className="implementation-note-actions"><Button type="button" variant="secondary" disabled={disabled || searching || !offset} onClick={() => setOffset(value => Math.max(0, value - 10))}>이전 검색 결과</Button><Button type="button" variant="secondary" disabled={disabled || searching || !catalog.has_more} onClick={() => setOffset(value => value + 10)}>다음 검색 결과</Button></div> : null}</> : null}</> : <p className="task-auto-help">이 작업에 연결된 원문 버전에서 근거를 확인합니다.</p>}
    <ErrorNotice error={error} onRetry={() => setSourceAttempt(value => value + 1)} />{loading ? <Spinner label="선택한 원문을 불러오고 있습니다" /> : revision ? <><p className="task-auto-help">{revision.title || revision.filename || '선택한 문서'} · {dateTime(revision.created_at)}</p>{policyOnly && revision.document_category !== 'policy' ? <Notice tone="warning">선택한 문서는 정책 분류가 아닙니다. 정책 문서를 선택해 주세요.</Notice> : revision.status !== 'ready' || revision.document_json?.extraction?.complete !== true ? <Notice tone="warning">추출이 완료된 원문 버전이 필요합니다.</Notice> : <><FormField label="원문 구간"><Select value={segmentId} disabled={disabled} onChange={event => { const next = segments.find(item => item.segment_id === event.target.value); setSegmentId(event.target.value); setQuote(next?.text?.length <= 10000 ? next.text : ''); }}><option value="">구간 선택</option>{segments.map(item => <option key={item.segment_id} value={item.segment_id}>{item.locator?.label || item.segment_id}</option>)}</Select></FormField>{segment ? <Disclosure><summary>선택한 구간 원문</summary><p className="implementation-note-source-text">{segment.text}</p></Disclosure> : null}<FormField label="정확한 원문 인용" hint="선택한 구간의 실제 문장을 그대로 인용하세요. 새 판단이나 구현 결과를 만들어 쓰지 않습니다."><Textarea rows={4} maxLength={10000} value={quote} disabled={disabled || !segment} onChange={event => setQuote(event.target.value)} required /></FormField>{quote && !valid ? <p className="task-auto-help">선택한 원문 구간과 정확히 일치하는 인용이 필요합니다.</p> : null}</>}</> : null}
  </section>;
}

function ImplementationNoteCreate({ route, projectId, request, seed, canWrite, onDirty, onBusy, onCreated }) {
  const [draft, setDraft] = useState(() => implementationNoteDraft(seed)), [evidence, setEvidence] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null), [attempt, setAttempt] = useState(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const dirty = Boolean(busy || attempt || draft.kind !== 'temporary_decision' || evidence && (evidence.id !== seed.source_revision_id || evidence.quote !== seed.evidence?.[0]?.quote) || ['title', 'uncertainty', 'temporary_approach', 'rationale', 'impact', 'replacement_condition'].some(key => draft[key].trim()));
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const disabled = !canWrite || busy || Boolean(attempt), field = key => ({ value: draft[key], disabled, onChange: event => setDraft(value => ({ ...value, [key]: event.target.value })) });
  async function submit(event) {
    event.preventDefault(); if (!canWrite || busy) return;
    let body; try { body = attempt || implementationNoteCreatePayload(draft, evidence, crypto.randomUUID()); } catch (err) { setError(err); return; }
    setAttempt(body); setBusy(true); setError(null);
    try { const result = await request(route, { method: 'POST', body }); if (!active.current) return; setAttempt(null); onDirty(false); await onCreated(result.note); }
    catch (err) { if (active.current) { setError(err); if (!retainProjectRequest(err)) setAttempt(null); } }
    finally { if (active.current) setBusy(false); }
  }
  return <form className="implementation-note-form" onSubmit={submit}><h3>새 기록</h3><Notice title="최초 기록은 보존됩니다">이 기록은 구현 상황과 판단의 근거를 남깁니다. 이후 의견과 검토 결과는 이력으로 추가하며, 요구사항 승인이나 코드 병합을 대신하지 않습니다.</Notice><fieldset disabled={disabled}><legend>기록 종류</legend>{Object.entries(IMPLEMENTATION_NOTE_KINDS).map(([value, label]) => <label key={value} className="checkbox-label"><Input type="radio" name="implementation-note-kind" value={value} checked={draft.kind === value} onChange={() => setDraft(current => ({ ...current, kind: value }))} /><span>{label}</span></label>)}</fieldset><p className="task-auto-help">{draft.kind === 'temporary_decision' ? '기획이 확정되기 전에 선택한 구현 방식을 기록합니다.' : '요청 범위 중 실제로 구현하지 못했거나 빠진 동작을 기록합니다.'}</p>
    <FormField label="제목"><Input {...field('title')} maxLength={300} required /></FormField><FormField label={draft.kind === 'temporary_decision' ? '아직 확인되지 않은 요구사항' : '미구현·누락된 범위'}><Textarea {...field('uncertainty')} rows={3} maxLength={5000} required /></FormField>
    {draft.kind === 'temporary_decision' ? <FormField label="선택한 임시 구현 방식"><Textarea {...field('temporary_approach')} rows={3} maxLength={10000} required /></FormField> : null}
    <FormField label={draft.kind === 'temporary_decision' ? '이 방식을 선택한 이유' : '구현하지 못한 이유'}><Textarea {...field('rationale')} rows={3} maxLength={5000} required /></FormField><FormField label="영향받는 동작·범위"><Textarea {...field('impact')} rows={3} maxLength={5000} required /></FormField><FormField label="교체·보완할 조건"><Textarea {...field('replacement_condition')} rows={3} maxLength={5000} required /></FormField>
    <RevisionEvidencePicker projectId={projectId} request={request} seed={seed} policyOnly lockedSource={Boolean(seed.task_draft_id || seed.automation_task_id)} onChange={setEvidence} disabled={disabled} /><ErrorNotice error={error} />{attempt ? <p className="task-auto-help">응답이 확인될 때까지 같은 요청으로 처리 여부를 확인합니다.</p> : null}<Button type="submit" busy={busy} disabled={!canWrite || (!attempt && !evidence)}>{attempt ? '같은 기록 요청 다시 확인' : '근거와 함께 기록 저장'}</Button>
  </form>;
}

function ImplementationNoteDetail({ id, route, projectId, request, permissions, onDirty, onBusy, onChanged, onSourceRevision, analyses, onRefreshAnalysis }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [mode, setMode] = useState(''), [text, setText] = useState(''), [evidence, setEvidence] = useState(null), [attempt, setAttempt] = useState(null), [conflict, setConflict] = useState(false);
  const lifecycle = useRef({ active: true, sequence: 0, controller: null, data: null, more: false }), confirm = useConfirm(), sharedView = useSharedView();
  const [draftVersion, setDraftVersion] = useState(null), [historyChanged, setHistoryChanged] = useState(false);
  const load = useCallback(async (more = false) => {
    lifecycle.current.controller?.abort(); const controller = new AbortController(), sequence = ++lifecycle.current.sequence;
    lifecycle.current.controller = controller; lifecycle.current.more = more; setLoading(true);
    const current = () => lifecycle.current.active && !controller.signal.aborted && sequence === lifecycle.current.sequence;
    try { const result = await request(`${route}/${encodeURIComponent(id)}?limit=50&history_offset=${more ? lifecycle.current.data?.history_next_offset || 0 : 0}`, { signal: controller.signal }); if (current()) { const merged = mergeImplementationNoteHistory(lifecycle.current.data, result, more); if (!merged) { const latest = await load(false); if (latest && lifecycle.current.active) setHistoryChanged(true); return latest; } lifecycle.current.data = merged; setData(merged); setLoadError(null); return merged; } }
    catch (err) { if (current() && err.name !== 'AbortError') setLoadError(err); }
    finally { if (current()) setLoading(false); }
  }, [id, route, request]);
  useEffect(() => { lifecycle.current.active = true; void load(); return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.controller?.abort(); }; }, [load]);
  const dirty = Boolean(text.trim() || evidence || busy || attempt);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const note = data?.note, reviewStatus = implementationNoteReviewStatus(note), locked = busy || Boolean(attempt);
  const execution = implementationExecutionView(note, sharedView);
  async function changeMode(value) { if (locked || dirty && !await confirm('작성 중인 피드백·검토 내용을 버릴까요?')) return; setMode(value); setDraftVersion(note.version); setText(''); setEvidence(null); setError(null); }
  async function mutate(action) {
    if (busy || conflict || action === 'review' && !permissions.canReview || action !== 'review' && !permissions.canWrite) return;
    if (attempt && attempt.action !== action || !attempt && action === 'review' && !reviewStatus) return;
    const body = attempt?.body || { request_id: crypto.randomUUID(), expected_version: action === 'followup' ? note.version : draftVersion, ...(action === 'feedback' ? { text: text.trim() } : action === 'review' ? { status: reviewStatus, note: text.trim(), result_evidence: [evidence] } : {}) };
    setBusy(true); setError(null); setAttempt({ action, body });
    try { await request(`${route}/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }); if (!lifecycle.current.active) return; setAttempt(null); setText(''); setEvidence(null); setMode(''); await load(); await onChanged(action === 'feedback' ? '피드백을 이력에 추가했습니다.' : action === 'followup' ? '새 보완 분석을 요청했습니다. 기존 작업과 기록은 보존됩니다.' : '근거와 함께 검토 결과를 기록했습니다. 코드 병합 상태는 바뀌지 않습니다.'); }
    catch (err) { if (lifecycle.current.active) { setError(err); if (!retainProjectRequest(err)) setAttempt(null); if (err.status === 409 && /VERSION_CONFLICT/.test(err.code || '')) setConflict(true); } }
    finally { if (lifecycle.current.active) setBusy(false); }
  }
  return <article className="implementation-note-detail"><ErrorNotice error={loadError} onRetry={() => load(lifecycle.current.more)} />{!note ? loading ? <Spinner /> : null : <>
    <header><NoteBadges note={note} /><h3>{note.title}</h3><p className="task-auto-help">{execution ? 'AI 개발 후 자동 기록' : note.origin === 'nora' ? 'Nora 분석 중 제안' : '사람이 남긴 기록'} · {dateTime(note.created_at)} · 버전 {note.version}</p></header>
    <dl className="implementation-note-facts">{[[note.kind === 'temporary_decision' ? '확인 전 요구사항' : '미구현·누락된 범위', note.uncertainty], ...(note.kind === 'temporary_decision' ? [['선택한 임시 구현 방식', note.temporary_approach]] : []), ['판단 이유', note.rationale], ['영향', note.impact], ['교체·보완할 조건', note.replacement_condition]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {execution ? <section><h4>AI 개발·기록 근거</h4><dl className="implementation-note-facts"><div><dt>임시 구현 확인 시각</dt><dd>{dateTime(execution.confirmedAt)}</dd></div>{execution.developmentCompletedAt ? <div><dt>AI 개발 종료</dt><dd>{dateTime(execution.developmentCompletedAt)}</dd></div> : null}<div><dt>구현 커밋 시각</dt><dd>{execution.implementedAt ? dateTime(execution.implementedAt) : '커밋 근거에서 확인되지 않음'}</dd></div><div><dt>기록 저장 시각</dt><dd>{dateTime(execution.recordedAt)}</dd></div>{execution.headSha ? <div><dt>변경 커밋</dt><dd><code>{execution.headSha}</code></dd></div> : null}</dl>
      {execution.codePaths.length ? <Disclosure><summary>변경 파일 · {execution.codePaths.length}개</summary><ul>{execution.codePaths.map(path => <li key={path}><code>{path}</code></li>)}</ul></Disclosure> : null}
      {execution.prUrl ? <Button type="button" variant="secondary" asChild><a href={execution.prUrl} target="_blank" rel="noopener noreferrer">연결된 PR 확인<ExternalLink size={15} /></a></Button> : null}
      {execution.questions.length ? <Disclosure open><summary>개발 당시 고객 질문과 반영 결과 · {execution.questions.length}개</summary>{execution.questions.map(question => <article key={question.id}><strong>{question.title || '고객 확인 사항'}</strong><p>{question.question}</p>{question.answer ? <p>전달받은 답변: {question.answer}</p> : <p className="task-auto-help">개발 시작 당시 답변이 없었습니다.</p>}<p><strong>{question.outcomeLabel}</strong>{question.explanation ? ` · ${question.explanation}` : ''}</p></article>)}</Disclosure> : null}
    </section> : null}
    <section><h4>최초 기록의 원문 근거</h4>{onSourceRevision ? <Button type="button" variant="ghost" disabled={dirty || busy} onClick={() => onSourceRevision(note.source_revision_id)}>{note.source_title || '원문 버전 열기'}</Button> : <p>{note.source_title}</p>}{note.evidence?.map((item, index) => <blockquote key={index}><small>{item.locator?.label || item.segment_id}</small><p>{item.quote}</p></blockquote>)}</section>
    <Notice title="기록의 검토와 코드 배포는 별도입니다">{note.status === 'accepted' ? '사람이 임시 구현을 수용한 이력입니다.' : note.status === 'resolved' ? '사람이 근거를 확인하고 공백 해소를 검토한 이력입니다.' : '최초 판단은 보존하고 피드백·후속 분석·검토 이력을 추가합니다.'} Git 접근, 범위 확인, 코드 검토와 병합 승인은 기존 절차를 따릅니다.</Notice>
    <section><h4>피드백·검토 이력</h4>{historyChanged ? <p className="task-auto-help">새 이력이 추가되어 최신 기록부터 다시 불러왔습니다. 작성 중 내용은 유지했습니다.</p> : null}{data.history?.some(item => item.detail?.analysis_id) && onRefreshAnalysis ? <Button type="button" variant="ghost" disabled={busy} onClick={onRefreshAnalysis}>보완 분석 상태 새로고침</Button> : null}<div className="implementation-note-history">{data.history?.map(item => <article key={item.id}><strong>{IMPLEMENTATION_NOTE_HISTORY[item.kind] || '기록 변경'}</strong><small>{dateTime(item.created_at)}</small>{item.detail?.text || item.detail?.note ? <p>{item.detail.text || item.detail.note}</p> : null}{item.detail?.analysis_id ? <p className="task-auto-help">보완 분석 · {RISK_STATES[analyses?.find(analysis => analysis.id === item.detail.analysis_id)?.status] || '현재 상태 조회 필요'}</p> : null}{item.detail?.result_evidence?.map((source, index) => <blockquote key={index}><p>{source.quote}</p>{onSourceRevision ? <Button type="button" variant="ghost" disabled={dirty || busy} onClick={() => onSourceRevision(source.id)}>검토 근거 원문</Button> : null}</blockquote>)}</article>)}</div>{data.history_total ? <small>{data.history.length} / {data.history_total}건 표시</small> : null}{data.history_has_more ? <Button type="button" variant="secondary" busy={loading} disabled={busy} onClick={() => load(true)}>이전 이력 더 불러오기</Button> : null}</section>
    <ErrorNotice error={error} />{conflict ? <Notice tone="warning" title="다른 사람이 이 기록을 변경했습니다">입력은 유지했습니다. 최신 이력을 확인한 뒤 다시 제출해 주세요.<Button type="button" variant="secondary" busy={loading} onClick={async () => { const latest = await load(); if (latest) { setDraftVersion(latest.note.version); setConflict(false); setError(null); } }}>최신 이력 불러오기</Button></Notice> : null}
    {!mode ? <div className="implementation-note-actions">{permissions.canWrite ? <Button type="button" variant="secondary" disabled={locked || conflict} onClick={() => changeMode('feedback')}>피드백 남기기</Button> : null}{permissions.canReview && reviewStatus ? <Button type="button" variant="secondary" disabled={locked || conflict} onClick={() => changeMode('review')}>{reviewStatus === 'accepted' ? '임시 구현 수용 검토' : '공백 해소 검토'}</Button> : null}{permissions.canWrite && (note.status === 'feedback_received' || attempt?.action === 'followup') ? <Button type="button" variant="secondary" busy={busy} disabled={conflict} onClick={() => mutate('followup')}>{attempt ? '같은 보완 분석 요청 확인' : '피드백으로 새 보완 분석 요청'}</Button> : null}</div> : <form className="implementation-note-form" onSubmit={event => { event.preventDefault(); if (text.trim() && (mode !== 'review' || evidence)) void mutate(attempt?.action || mode); }}>
      <h4>{mode === 'feedback' ? '사람의 피드백' : reviewStatus === 'accepted' ? '임시 구현 수용 근거' : '작업 공백 해소 근거'}</h4><FormField label={mode === 'feedback' ? '바뀐 판단·확인한 요구사항·보완할 내용' : '원문 결과와 대조한 검토 의견'}><Textarea rows={4} maxLength={10000} value={text} disabled={locked} required onChange={event => setText(event.target.value)} /></FormField>{mode === 'review' ? <RevisionEvidencePicker projectId={projectId} request={request} onChange={setEvidence} disabled={locked} /> : <p className="task-auto-help">피드백 저장은 새 개발 작업을 실행하지 않습니다. 이후 새 보완 분석을 요청할 수 있습니다.</p>}
      {attempt ? <p className="task-auto-help">같은 요청으로 처리 결과를 다시 확인합니다. 입력 내용은 보존됩니다.</p> : null}<div className="implementation-note-actions"><Button type="button" variant="secondary" disabled={locked} onClick={() => changeMode('')}>작성 취소</Button><Button type="submit" busy={busy} disabled={conflict || !text.trim() || mode === 'review' && (!evidence || !reviewStatus) && !attempt}>{attempt ? '같은 요청 다시 확인' : mode === 'feedback' ? '피드백 저장' : '근거와 함께 검토 기록'}</Button></div>
    </form>}
  </>}</article>;
}
