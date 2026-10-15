import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, Plus, RefreshCw, Search } from 'lucide-react';
import { Badge, Button, ControlButton, Disclosure, Empty, ErrorNotice, FormField, Input, Modal, Notice, Select, Spinner, Textarea, projectPath } from './ui.jsx';
import { MetricCard } from './components/ctds/MetricCard/MetricCard';
import { TableCellMeter } from './components/ctds/TableCell/TableCellMeter';
import { List, ListItem } from './ctds-lists.jsx';
import { EventListItem } from './components/ctds/EventListItem/EventListItem';
import { ProgressBar } from './components/ctds/ProgressBar/ProgressBar';
import { useConfirm } from './confirmation.jsx';
import { useSharedView } from './shared-view.jsx';
import { retainProjectRequest } from './nora-workspace-state.mjs';
import { EMPTY_JOURNEY_FILTERS, JOURNEY_EVENT_TYPES, JOURNEY_MILESTONES, JOURNEY_SOURCE_LABELS, JOURNEY_STAGES, groupJourneyEvents, journeyCanRecord, journeyDateTime, journeyEventKey, journeyEventQuery, journeyMilestonePayload, journeyProgress, journeySourceRefs, journeyTimeLabel, mergeJourneyPage } from './project-journey-state.mjs';
import './project-journey.css';

const noop = () => {};
const number = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString('ko-KR') : '—';
const fieldText = value => typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) ? value.filter(item => typeof item === 'string' || typeof item === 'number').join(' · ') : '—';

function useJourneyRead(path, request, refreshKey = 0) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(Boolean(path));
  const lifecycle = useRef({ active: true, sequence: 0, controller: null });
  const load = useCallback(async () => {
    lifecycle.current.controller?.abort();
    const controller = new AbortController(), sequence = ++lifecycle.current.sequence;
    lifecycle.current.controller = controller;
    const current = () => lifecycle.current.active && !controller.signal.aborted && sequence === lifecycle.current.sequence;
    if (!path) { setData(null); setError(null); setLoading(false); return; }
    setLoading(true);
    try { const value = await request(path, { signal: controller.signal }); if (current()) { setData({ path, value }); setError(null); return value; } }
    catch (err) { if (current() && err.name !== 'AbortError') setError(err); }
    finally { if (current()) setLoading(false); }
  }, [path, request, refreshKey]);
  useEffect(() => { lifecycle.current.active = true; setData(null); setError(null); void load(); return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.controller?.abort(); }; }, [load]);
  return { data: data?.path === path ? data.value : null, error, loading, load };
}

function useJourneyEvents(route, query, request) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const lifecycle = useRef({ active: true, sequence: 0, controller: null, page: null, more: false });
  const load = useCallback(async (more = false) => {
    lifecycle.current.controller?.abort();
    const controller = new AbortController(), sequence = ++lifecycle.current.sequence;
    lifecycle.current.controller = controller; lifecycle.current.more = more;
    const previous = more ? lifecycle.current.page : null, cursor = previous?.next_cursor || '';
    const current = () => lifecycle.current.active && !controller.signal.aborted && sequence === lifecycle.current.sequence;
    setLoading(true);
    try {
      const result = await request(`${route}/events?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal: controller.signal });
      if (current()) { const page = mergeJourneyPage(previous, result, cursor); lifecycle.current.page = page; setData({ query, page }); setError(null); }
    } catch (err) { if (current() && err.name !== 'AbortError') setError(err); }
    finally { if (current()) setLoading(false); }
  }, [query, route, request]);
  useEffect(() => { lifecycle.current.active = true; lifecycle.current.page = null; setData(null); setError(null); void load(); return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.controller?.abort(); }; }, [load]);
  return { data: data?.query === query ? data.page : null, error, loading, load, retry: () => load(lifecycle.current.more) };
}

function JourneyProgress({ data, onNavigate }) {
  let progress;
  try { progress = journeyProgress(data); } catch (error) { return <ErrorNotice error={error} />; }
  return <section className="project-journey-progress" aria-label="프로젝트 전체 작업 진행률">
    <div className="project-journey-metrics">
      <MetricCard label="전체 작업 완료율" value={progress.percent === null ? '미등록' : `${Math.round(progress.percent * 10) / 10}%`} variant="line" data-ctds="metric-card" />
      {[['진행 중', 'in_progress'], ['검토 대기', 'qa'], ['확인 필요', 'blocked']].map(([label, key]) => <MetricCard key={key} label={label} value={`${number(progress[key])}건`} variant="line" data-ctds="metric-card" />)}
    </div>
    <div className="project-journey-progress-caption">
      <div className="project-journey-inline">{progress.percent !== null ? <TableCellMeter value={progress.percent} labelPosition="none" aria-label={`전체 작업 ${progress.total}건 중 ${progress.done}건 완료`} data-ctds="table-cell-meter" /> : null}<strong>완료 {number(progress.done)} / 전체 {number(progress.total)}건</strong>{onNavigate ? <Button type="button" variant="ghost" rightIcon={<ArrowRight size={14} />} onClick={() => onNavigate('work-items')}>작업 보드</Button> : null}</div>
      <p className="project-journey-help">{progress.percent === null ? '작업을 등록하면 진행률이 표시됩니다.' : '실행 작업 기준 · 검토 전 초안은 제외'}</p>
      {progress.unvalidated_drafts > 0 || progress.open_temporary_decisions > 0 ? <p className="project-journey-help">{progress.unvalidated_drafts > 0 ? `검토 전 초안 ${number(progress.unvalidated_drafts)}건` : ''}{progress.unvalidated_drafts > 0 && progress.open_temporary_decisions > 0 ? ' · ' : ''}{progress.open_temporary_decisions > 0 ? `검토할 임시 구현 ${number(progress.open_temporary_decisions)}건` : ''}</p> : null}
      {progress.open_work_gaps > 0 || progress.completed_partial_tasks > 0 ? <Notice tone="warning">{progress.open_work_gaps > 0 ? '보완할 작업 공백이 있습니다. ' : ''}{progress.completed_partial_tasks > 0 ? '일부 범위만 구현한 완료 작업이 있습니다. ' : ''}작업 상세에서 전달 범위를 확인해 주세요.</Notice> : null}
    </div>
  </section>;
}

function JourneyFilters({ filters, stages, onChange }) {
  const [draft, setDraft] = useState(filters), [error, setError] = useState(null);
  useEffect(() => setDraft(filters), [filters]);
  const field = key => ({ value: draft[key], onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })) });
  return <form className="project-journey-filter" onSubmit={event => { event.preventDefault(); try { journeyEventQuery(draft); setError(null); onChange(draft); } catch (err) { setError(err); } }}>
    <div className="project-journey-filter-fields"><FormField label="프로젝트 단계"><Select {...field('stage')}><option value="">전체 단계</option>{Object.entries(JOURNEY_STAGES).map(([value, label]) => { const count = stages?.find(item => item.id === value)?.event_count; return <option key={value} value={value}>{label}{typeof count === 'number' ? ` · ${number(count)}건` : ''}</option>; })}</Select></FormField><FormField label="기록 유형"><Select {...field('type')}><option value="">모든 기록</option>{Object.entries(JOURNEY_EVENT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField><FormField label="시작일 · KST"><Input type="date" {...field('from')} /></FormField><FormField label="종료일 · KST"><Input type="date" {...field('to')} /></FormField></div>
    <div className="project-journey-inline"><Button type="submit" variant="secondary">필터 적용</Button><Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY_JOURNEY_FILTERS); setError(null); onChange(EMPTY_JOURNEY_FILTERS); }}>전체 기간·단계</Button><span className="project-journey-help">발생일 기준 · 미확인 기록은 등록일 기준</span></div><ErrorNotice error={error} />
  </form>;
}

function JourneySources({ refs, onOpenSource }) {
  const sources = journeySourceRefs(refs);
  if (!sources.length) return <p className="project-journey-help">연결된 원문·작업이 없습니다.</p>;
  return <List className="project-journey-source-list">{sources.map(ref => <ListItem key={`${ref.type}:${ref.id}`}><ListItem.Title>{onOpenSource ? <Button type="button" variant="secondary" rightIcon={<ArrowRight size={14} />} onClick={() => onOpenSource(ref)}>{ref.title || JOURNEY_SOURCE_LABELS[ref.type]}</Button> : <strong>{ref.title || JOURNEY_SOURCE_LABELS[ref.type]}</strong>}</ListItem.Title><ListItem.Meta>{JOURNEY_SOURCE_LABELS[ref.type]}</ListItem.Meta></ListItem>)}</List>;
}

function JourneyFields({ fields }) {
  if (!Array.isArray(fields) || !fields.length) return null;
  return <dl className="project-journey-facts">{fields.map((field, index) => <div key={index}><dt>{fieldText(field.label)}</dt><dd>{fieldText(field.value)}</dd></div>)}</dl>;
}

function JourneyEventDetail({ route, event, request, onClose, onOpenSource, onRecord }) {
  const remote = useJourneyRead(`${route}/events/${encodeURIComponent(event.type)}/${encodeURIComponent(event.id)}`, request);
  const item = remote.data?.event || event, detail = remote.data?.detail;
  const refs = journeySourceRefs([...(item.source_refs || []), ...(detail?.source_refs || [])]);
  return <Modal title={item.title || '프로젝트 기록'} eyebrow="프로젝트 타임라인" onClose={onClose}>
    <div className="modal-body project-journey-detail"><div className="project-journey-inline"><Badge tone="quiet">{JOURNEY_STAGES[item.stage] || '프로젝트'}</Badge><Badge tone="quiet">{JOURNEY_EVENT_TYPES[item.type] || '기록'}</Badge></div>
      <dl className="project-journey-facts"><div><dt>{journeyTimeLabel(item)} · KST</dt><dd>{journeyDateTime(item.occurred_at)}</dd></div><div><dt>시스템 등록 시각 · KST</dt><dd>{journeyDateTime(item.recorded_at)}</dd></div>{item.actor?.name ? <div><dt>기록한 사람</dt><dd>{item.actor.name}</dd></div> : null}</dl>
      <ErrorNotice error={remote.error} onRetry={remote.load} />{remote.loading && !detail ? <Spinner label="기록 상세를 확인하고 있습니다" /> : null}
      {detail?.description || item.description ? <p className="project-journey-description">{detail?.description || item.description}</p> : null}<JourneyFields fields={detail?.fields} />
      <section className="project-journey-related"><h3>관련 문서·작업</h3><JourneySources refs={refs} onOpenSource={onOpenSource ? ref => { onClose(); onOpenSource(ref); } : null} /></section>
    </div><footer className="modal-actions">{onRecord ? <Button type="button" variant="secondary" onClick={() => onRecord(journeySourceRefs(refs, true))}>연결된 주요 일정 기록</Button> : null}<Button type="button" variant="secondary" onClick={onClose}>닫기</Button></footer>
  </Modal>;
}

/** Detail fallback for existing implementation/analysis records with no dedicated screen. */
export function JourneySourceDetail({ projectId, request, sourceRef, onClose, onOpenSource }) {
  return <JourneySourceDetailContent key={`${projectId}:${sourceRef?.type}:${sourceRef?.id}`} projectId={projectId} request={request} sourceRef={sourceRef} onClose={onClose} onOpenSource={onOpenSource} />;
}

function JourneySourceDetailContent({ projectId, request, sourceRef, onClose, onOpenSource }) {
  const valid = journeySourceRefs([sourceRef])[0], path = valid ? `${projectPath(projectId)}/journey/sources/${encodeURIComponent(valid.type)}/${encodeURIComponent(valid.id)}` : null;
  const remote = useJourneyRead(path, request), data = remote.data;
  return <Modal title={data?.source?.title || JOURNEY_SOURCE_LABELS[valid?.type] || '관련 기록'} onClose={onClose}>
    <div className="modal-body project-journey-detail">{!valid ? <ErrorNotice error={new Error('관련 기록의 참조를 확인할 수 없습니다.')} /> : <><ErrorNotice error={remote.error} onRetry={remote.load} />{remote.loading && !data ? <Spinner label="관련 기록 상세를 불러오고 있습니다" /> : null}{data ? <>{data.description ? <p className="project-journey-description">{data.description}</p> : null}<JourneyFields fields={data.fields} /><section className="project-journey-related"><h3>관련 문서·작업</h3><JourneySources refs={(data.source_refs || []).filter(ref => ref.type !== valid.type || ref.id !== valid.id)} onOpenSource={onOpenSource ? ref => { onClose(); onOpenSource(ref); } : null} /></section></> : null}</>}</div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>닫기</Button></footer>
  </Modal>;
}

function MilestoneSources({ projectId, request, refs, onChange, disabled }) {
  const [input, setInput] = useState(''), [query, setQuery] = useState(null), [offset, setOffset] = useState(0), [attempt, setAttempt] = useState(0);
  const path = query === null ? null : `${projectPath(projectId)}/context/search?${new URLSearchParams({ query, include_unapproved: 'true', limit: '10', offset: String(offset) })}`;
  const remote = useJourneyRead(path, request, attempt), choices = journeySourceRefs((remote.data?.items || []).map(source => ({ ...source.internal_ref, type: source.internal_ref?.type || source.type, id: source.internal_ref?.id || source.id, title: source.title })), true);
  const find = () => { setQuery(input.trim()); setOffset(0); setAttempt(value => value + 1); };
  return <section className="project-journey-related"><h3>연결할 자료 · 선택 사항</h3>{refs.length ? <List className="project-journey-source-list">{refs.map(ref => <ListItem key={`${ref.type}:${ref.id}`} trailing={<Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange(refs.filter(item => item.type !== ref.type || item.id !== ref.id))}>연결 해제</Button>}><ListItem.Title>{ref.title || JOURNEY_SOURCE_LABELS[ref.type]}</ListItem.Title></ListItem>)}</List> : null}
    <div className="project-journey-inline"><Input aria-label="일정에 연결할 자료 검색" placeholder="이 프로젝트의 문서·작업 검색" maxLength={500} disabled={disabled} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); find(); } }} /><Button type="button" variant="secondary" icon={Search} disabled={disabled} busy={remote.loading} onClick={find}>찾기</Button></div>
    <ErrorNotice error={remote.error} onRetry={remote.load} />{remote.loading ? <Spinner label="연결할 자료를 찾고 있습니다" /> : remote.data ? <><List className="project-journey-source-options">{choices.map(ref => { const checked = refs.some(item => item.type === ref.type && item.id === ref.id); return <ListItem key={`${ref.type}:${ref.id}`}><label className="checkbox-label"><Input type="checkbox" checked={checked} disabled={disabled || !checked && refs.length >= 20} onChange={() => onChange(checked ? refs.filter(item => item.type !== ref.type || item.id !== ref.id) : [...refs, ref])} /><span>{ref.title || JOURNEY_SOURCE_LABELS[ref.type]}<small>{JOURNEY_SOURCE_LABELS[ref.type]}</small></span></label></ListItem>; })}</List>{!choices.length ? <p className="project-journey-help">이 페이지에 연결 가능한 자료가 없습니다. 다른 검색어나 다음 페이지를 확인하세요.</p> : null}<div className="project-journey-inline">{offset > 0 ? <Button type="button" variant="ghost" disabled={disabled} onClick={() => setOffset(value => Math.max(0, value - 10))}>이전 자료</Button> : null}{remote.data.has_more ? <Button type="button" variant="ghost" disabled={disabled} onClick={() => setOffset(value => value + 10)}>다음 자료</Button> : null}</div></> : null}
  </section>;
}

function JourneyMilestoneForm({ projectId, route, request, seed, canRecord, onDirty, onClose, onCreated }) {
  const [draft, setDraft] = useState({ kind: '', title: '', description: '', occurred_at: '', stage: '' }), [refs, setRefs] = useState(seed), [attempt, setAttempt] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const active = useRef(true), confirm = useConfirm(), dirty = Boolean(attempt || busy || Object.values(draft).some(Boolean) || refs.length);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  const locked = busy || Boolean(attempt), field = key => ({ value: draft[key], disabled: locked || !canRecord, onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })) });
  async function close() { if (!busy && (!dirty || await confirm(attempt ? '기록 요청의 처리 결과가 아직 확인되지 않았습니다. 입력을 닫을까요?' : '작성 중인 주요 일정 기록을 버릴까요?'))) onClose(); }
  async function submit(event) {
    event.preventDefault(); if (!canRecord || busy) return;
    let body; try { body = attempt || journeyMilestonePayload(draft, refs, crypto.randomUUID()); } catch (err) { setError(err); return; }
    setAttempt(body); setBusy(true); setError(null);
    try { const result = await request(`${route}/milestones`, { method: 'POST', body }); if (active.current) { setAttempt(null); onDirty(false); onCreated(result); } }
    catch (err) { if (active.current) { setError(err); if (!retainProjectRequest(err)) setAttempt(null); } }
    finally { if (active.current) setBusy(false); }
  }
  return <Modal title="주요 일정 기록" onClose={close} busy={busy}><form onSubmit={submit}>
    <div className="modal-body project-journey-detail"><Notice title="실제로 발생한 일을 기록합니다">계약 체결·전달·종료 이력을 남깁니다. 기록 저장은 작업 완료 처리, 계약 승인, 코드 병합을 실행하지 않습니다.</Notice><FormField label="일정 종류"><Select {...field('kind')} required><option value="">종류 선택</option>{Object.entries(JOURNEY_MILESTONES).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</Select></FormField>
      {draft.kind === 'custom' ? <FormField label="프로젝트 단계"><Select {...field('stage')} required><option value="">단계 선택</option>{Object.entries(JOURNEY_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField> : null}
      <FormField label="제목"><Input {...field('title')} required maxLength={300} /></FormField><FormField label="실제 발생 시각 · KST" hint="나중에 등록한 기록도 실제 발생한 날짜에 표시합니다. 미래 예약 일정은 입력하지 않습니다."><Input {...field('occurred_at')} type="datetime-local" required /></FormField><FormField label="설명 · 선택 사항"><Textarea {...field('description')} rows={4} maxLength={10000} /></FormField>
      <MilestoneSources projectId={projectId} request={request} refs={refs} onChange={setRefs} disabled={locked || !canRecord} /><ErrorNotice error={error} />{attempt ? <p className="project-journey-help">응답이 불확실하면 같은 요청으로 처리 결과를 확인합니다. 입력 내용은 유지됩니다.</p> : null}
    </div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>취소</Button><Button type="submit" busy={busy} disabled={!canRecord}>{attempt ? '같은 기록 요청 확인' : '일정 기록 저장'}</Button></footer>
  </form></Modal>;
}

export function ProjectJourney(props) { return <ProjectJourneyContent key={props.project.id} {...props} />; }

function ProjectJourneyContent({ project, request, canWrite = false, onDirty = noop, notify = noop, onOpenSource, onNavigate }) {
  const route = `${projectPath(project.id)}/journey`, summary = useJourneyRead(route, request), sharedView = useSharedView(), headingId = useId();
  const [filters, setFilters] = useState(EMPTY_JOURNEY_FILTERS), [selected, setSelected] = useState(null), [milestoneSeed, setMilestoneSeed] = useState(null);
  const query = journeyEventQuery(filters), timeline = useJourneyEvents(route, query, request), groups = useMemo(() => groupJourneyEvents(timeline.data?.events), [timeline.data?.events]);
  const canRecord = journeyCanRecord(canWrite, sharedView, summary.data?.permissions), loading = summary.loading || timeline.loading;
  const refresh = () => Promise.allSettled([summary.load(), timeline.load()]);
  function record(refs = []) { setSelected(null); setMilestoneSeed(refs.slice(0, 20)); }
  const filterActive = Object.values(filters).some(Boolean);
  return <section className="project-journey" aria-labelledby={headingId}>
    <header className="project-journey-header"><div><h2 id={headingId}>프로젝트 진행</h2></div><div className="project-journey-inline"><Button type="button" variant="ghost" icon={RefreshCw} busy={loading} onClick={refresh}>새로고침</Button>{canRecord ? <Button type="button" variant="secondary" icon={Plus} onClick={() => record()}>주요 일정 기록</Button> : null}</div></header>
    {loading ? <ProgressBar position="inline" aria-label="프로젝트 기록 조회" data-ctds="progress-bar" /> : null}<ErrorNotice error={summary.error} onRetry={summary.load} />{summary.loading && !summary.data ? <p className="project-journey-help" role="status">프로젝트 전체 진행률을 확인하고 있습니다.</p> : summary.data ? <><JourneyProgress data={summary.data.progress} onNavigate={onNavigate} />{summary.error ? <p className="project-journey-help" role="status">이전 조회의 진행률을 표시하고 있습니다.</p> : null}</> : null}
    <ErrorNotice error={timeline.error} onRetry={timeline.retry} /><Disclosure className="project-journey-timeline"><summary>전체 이력{summary.data?.summary ? ` · ${number(summary.data.summary.event_count)}건` : ''}</summary>
      <Disclosure><summary>기간·유형 필터{filterActive ? ' · 적용 중' : ''}</summary><JourneyFilters filters={filters} stages={summary.data?.stages} onChange={setFilters} /></Disclosure>
      {timeline.loading && !timeline.data ? <Spinner label="프로젝트 이력을 불러오고 있습니다" /> : timeline.data ? <>
        {/* EventListItem uses local calendar fields; keep its date block aligned with the KST day group. */}
        {groups.length ? <List className="project-journey-events" aria-label="날짜별 프로젝트 이력">{groups.flatMap(group => group.events.map(event => <EventListItem key={journeyEventKey(event)} role="listitem" variant="line" size="sm" data-ctds="event-list-item" date={new Date(`${group.day}T12:00:00`)} title={<ControlButton type="button" variant="ghost" onClick={() => setSelected(event)}>{event.title || JOURNEY_EVENT_TYPES[event.type]}</ControlButton>} meta={[
          { label: JOURNEY_STAGES[event.stage] || '프로젝트' },
          { label: JOURNEY_EVENT_TYPES[event.type] },
          { label: `${journeyTimeLabel(event)} ${journeyDateTime(event.occurred_at)} KST` },
          ...(event.description ? [{ label: <span className="project-journey-excerpt">{event.description}</span> }] : []),
        ]} />))}</List> : <Empty compact icon={CheckCheck} title={filterActive ? '이 조건의 기록이 없습니다' : '아직 타임라인 기록이 없습니다'}>{filterActive ? '기간·단계를 넓혀 다른 기록을 확인해 주세요.' : '문서·작업·주요 일정 기록이 시간순으로 표시됩니다.'}</Empty>}
        <div className="project-journey-pagination"><p className="project-journey-help">{number(timeline.data.events.length)} / {number(timeline.data.total)}건 표시 · {journeyDateTime(timeline.data.snapshot_at)} KST 조회 기준</p>{!timeline.data.has_more && timeline.data.events.length < timeline.data.total ? <p className="project-journey-help">조회 중 기록이 변경되었습니다. 누락된 이력을 확인하려면 새로고침해 주세요.</p> : null}{timeline.data.has_more ? <Button type="button" variant="secondary" busy={timeline.loading} onClick={() => timeline.load(true)}>다음 이력 더 불러오기</Button> : null}</div>
      </> : null}
    </Disclosure>
    {selected ? <JourneyEventDetail key={journeyEventKey(selected)} route={route} event={selected} request={request} onClose={() => setSelected(null)} onOpenSource={onOpenSource} onRecord={canRecord ? record : null} /> : null}
    {milestoneSeed !== null ? <JourneyMilestoneForm projectId={project.id} route={route} request={request} seed={milestoneSeed} canRecord={canRecord} onDirty={onDirty} onClose={() => setMilestoneSeed(null)} onCreated={() => { setMilestoneSeed(null); notify('주요 일정을 기록했습니다.'); void refresh(); }} /> : null}
  </section>;
}
