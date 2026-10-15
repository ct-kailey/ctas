import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database, Monitor, Pencil, RefreshCw, Server } from 'lucide-react';
import { Badge, Button, Disclosure, ErrorNotice, FormField, Input, Notice, Select, Spinner, Textarea, dateTime, projectPath } from './ui.jsx';
import { Checkbox } from './components/ctds/Checkbox/Checkbox';
import { TASK_AREAS, TASK_AREA_STATUSES, saveTaskArea, taskAreaAssigneeNames, taskAreaDraft, taskAreaHistoryChanges, taskAreaIsDirty, taskAreaMembers, taskAreaProgress, taskAreaProgressLabel, taskAreaRows, taskAreaStatus } from './task-areas-state.mjs';
import './task-areas.css';

const AREA_ICONS = { screen: Monitor, server: Server, database: Database };

export function TaskAreaSummary({ value, unavailable = false }) {
  if (!value) return <small className="task-areas-summary-pending">{unavailable ? '영역별 진행 확인 필요' : '영역별 진행 조회 중'}</small>;
  const rows = taskAreaRows(value.areas), progress = taskAreaProgress(rows);
  return <span className="task-areas-summary" aria-label={`영역별 진행 · ${taskAreaProgressLabel(progress)}`}>
    <span className="task-areas-summary-states">{rows.map(row => { const state = taskAreaStatus(row.status); return <Badge key={row.area} tone={state.tone}>{TASK_AREAS.find(area => area.key === row.area).label} · {state.label}</Badge>; })}</span>
    <small>{taskAreaProgressLabel(progress)}</small>
  </span>;
}

function AreaSnapshot({ row, members }) {
  const names = taskAreaAssigneeNames(row, members);
  return <div className="task-area-snapshot">
    <p>{row.description || '작업 내용이 아직 없습니다.'}</p>
    {row.reference ? <code>{row.reference}</code> : null}
    <span className="task-area-assignees">담당자 · {names.length ? names.join(', ') : '미지정'}</span>
  </div>;
}

function TaskAreaLane({ row, members, membersReady, canWrite, disabled, onSave, onReload, onDirty }) {
  const area = TASK_AREAS.find(item => item.key === row.area), Icon = AREA_ICONS[row.area], status = taskAreaStatus(row.status);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(() => taskAreaDraft(row)), [error, setError] = useState(null), [stale, setStale] = useState(false);
  const dirty = editing && taskAreaIsDirty(row, draft), callbacks = useRef({ onDirty }); callbacks.current = { onDirty };
  useEffect(() => { if (!editing) setDraft(taskAreaDraft(row)); }, [row, editing]);
  useEffect(() => { callbacks.current.onDirty(row.area, dirty); return () => callbacks.current.onDirty(row.area, false); }, [row.area, dirty]);
  const update = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  async function save(event) {
    event.preventDefault(); if (disabled || stale) return; setError(null);
    try { const result = await onSave(row, draft); if (result) { setEditing(false); setStale(false); } }
    catch (err) { if (err.name === 'AbortError') return; setError(err); if (err.status === 409) { setStale(true); await onReload(); } }
  }
  function discard() { setDraft(taskAreaDraft(row)); setEditing(false); setError(null); setStale(false); }
  return <section className="task-area-lane" aria-label={`${area.label} 작업`}>
    <div className="task-area-label"><Icon aria-hidden="true" /><strong>{area.label}</strong><span>{area.hint}</span></div>
    <div className="task-area-content ains-section-stack">
      <header className="task-area-toolbar"><Badge tone={status.tone}>{status.label}</Badge>{canWrite && !editing ? <Button type="button" variant="ghost" icon={Pencil} disabled={disabled || !membersReady} onClick={() => { setDraft(taskAreaDraft(row)); setEditing(true); }}>담당·상태 편집</Button> : null}</header>
      {!editing ? <AreaSnapshot row={row} members={members} /> : <form className="task-area-form ains-section-stack" onSubmit={save}>
        <ErrorNotice error={error} />
        {stale ? <Notice tone="warning" title="다른 사용자가 이 영역을 수정했습니다" actions={<Button type="button" variant="secondary" disabled={disabled} onClick={() => { setDraft(taskAreaDraft(row)); setStale(false); setError(null); }}>최신 내용으로 다시 작성</Button>}>작성 중인 내용은 아래에 유지했습니다. 최신 저장 내용을 확인한 뒤 다시 작성해 주세요.<AreaSnapshot row={row} members={members} /></Notice> : null}
        <FormField label={`${area.label} 작업 내용`}><Textarea rows={2} maxLength={10000} value={draft.description} disabled={disabled || stale} onChange={event => update('description', event.target.value)} placeholder={area.hint} /></FormField>
        <FormField label={area.referenceLabel}><Input maxLength={2000} value={draft.reference} disabled={disabled || stale} onChange={event => update('reference', event.target.value)} placeholder={area.placeholder} /></FormField>
        <FormField label={`${area.label} 진행 상태`}><Select value={draft.status} disabled={disabled || stale} onChange={event => update('status', event.target.value)}>{TASK_AREA_STATUSES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></FormField>
        <fieldset className="task-area-people" disabled={disabled || stale}><legend>담당자 · 여러 명 선택 가능</legend>
          {taskAreaMembers(members).length ? <div className="task-area-people-options">{taskAreaMembers(members).map(member => <Checkbox key={member.id} checked={draft.assignee_ids.includes(member.id)} onChange={event => update('assignee_ids', event.target.checked ? [...draft.assignee_ids, member.id] : draft.assignee_ids.filter(id => id !== member.id))}>{member.name || member.email}</Checkbox>)}</div> : <p>배정할 구성원이 없습니다. 프로젝트 구성원을 먼저 추가해 주세요.</p>}
          {draft.assignee_ids.some(id => !taskAreaMembers(members).some(member => member.id === id)) ? <Notice tone="warning" title={['done', 'not_applicable'].includes(draft.status) ? '이전 담당자 이력을 보존하고 있습니다' : '현재 배정할 수 없는 담당자가 있습니다'} actions={<Button type="button" variant="secondary" disabled={disabled || stale} onClick={() => update('assignee_ids', draft.assignee_ids.filter(id => taskAreaMembers(members).some(member => member.id === id)))}>이전 담당자 해제</Button>}>진행할 작업으로 바꾸거나 담당자를 변경할 때는 현재 프로젝트 구성원 중 다시 선택해 주세요.</Notice> : null}
        </fieldset>
        <div className="task-area-actions"><Button type="button" variant="secondary" disabled={disabled} onClick={discard}>취소</Button><Button type="submit" disabled={disabled || stale || !dirty || !membersReady}>영역 작업 저장</Button></div>
      </form>}
    </div>
  </section>;
}

export function TaskAreasPanel({ projectId, taskId, request, canWrite, disabled = false, onDirty, onBusy, onChanged }) {
  const taskPath = `${projectPath(projectId)}/task-automation/tasks/${encodeURIComponent(taskId)}`;
  const [data, setData] = useState(null), [members, setMembers] = useState([]), [membersReady, setMembersReady] = useState(false), [membersError, setMembersError] = useState(null);
  const [error, setError] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [dirtyAreas, setDirtyAreas] = useState({});
  const lifecycle = useRef({ active: true, controller: null, mutation: null, sequence: 0 }), callbacks = useRef({ onDirty, onBusy, onChanged }); callbacks.current = { onDirty, onBusy, onChanged };
  const load = useCallback(async () => {
    lifecycle.current.controller?.abort(); const controller = new AbortController(), sequence = ++lifecycle.current.sequence; lifecycle.current.controller = controller;
    const current = () => lifecycle.current.active && lifecycle.current.sequence === sequence && !controller.signal.aborted;
    setLoading(true);
    const results = await Promise.allSettled([request(`${taskPath}/areas`, { signal: controller.signal }), ...(canWrite ? [request(`${projectPath(projectId)}/members`, { signal: controller.signal })] : [])]);
    if (!current()) return;
    if (results[0].status === 'fulfilled') { setData(results[0].value); setError(null); } else if (results[0].reason.name !== 'AbortError') setError(results[0].reason);
    if (canWrite) { if (results[1].status === 'fulfilled') { setMembers(results[1].value.members || []); setMembersReady(true); setMembersError(null); } else if (results[1].reason.name !== 'AbortError') { setMembersReady(false); setMembersError(results[1].reason); } }
    setLoading(false);
  }, [request, taskPath, projectId, canWrite]);
  useEffect(() => {
    lifecycle.current.active = true; setData(null); setMembers([]); setMembersReady(false); setError(null); setMembersError(null); setDirtyAreas({}); setBusy(false); void load();
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.controller?.abort(); lifecycle.current.mutation?.abort(); lifecycle.current.mutation = null; callbacks.current.onDirty?.(false); callbacks.current.onBusy?.(false); };
  }, [load]);
  useEffect(() => { callbacks.current.onDirty?.(busy || Object.values(dirtyAreas).some(Boolean)); callbacks.current.onBusy?.(busy); }, [busy, dirtyAreas]);
  const laneDirty = useCallback((area, value) => setDirtyAreas(current => current[area] === value ? current : { ...current, [area]: value }), []);
  async function save(row, draft) {
    if (lifecycle.current.mutation || !canWrite || disabled || !membersReady) return null;
    lifecycle.current.controller?.abort(); lifecycle.current.sequence += 1; setLoading(false);
    const controller = new AbortController(); lifecycle.current.mutation = controller; setBusy(true);
    const current = () => lifecycle.current.active && lifecycle.current.mutation === controller && !controller.signal.aborted;
    try {
      const result = await saveTaskArea({ request, taskPath, row, draft, members, canWrite, signal: controller.signal, isActive: current });
      if (!current()) return null;
      if (result) { setData(result); callbacks.current.onChanged?.(result); }
      return result;
    } catch (err) { if (current()) throw err; return null; }
    finally { if (current()) { lifecycle.current.mutation = null; setBusy(false); } }
  }
  const rows = useMemo(() => data ? taskAreaRows(data.areas) : [], [data]), progress = data ? taskAreaProgress(rows) : null;
  return <section className="task-areas ains-section-stack" aria-label="화면·서버·DB 담당과 진행 상태">
    <header className="task-areas-heading"><div><h3>영역별 담당·진행</h3><p>화면·서버·DB 작업을 나눠 여러 담당자와 진행 상황을 기록합니다.</p></div><div className="task-area-actions">{progress ? <strong>{taskAreaProgressLabel(progress)}</strong> : null}<Button type="button" variant="ghost" icon={RefreshCw} disabled={disabled || busy || Object.values(dirtyAreas).some(Boolean)} onClick={load} aria-label="영역별 작업 새로고침">새로고침</Button></div></header>
    <ErrorNotice error={error || membersError} onRetry={load} />
    {loading && !data ? <Spinner label="영역별 작업을 불러오고 있습니다" /> : data ? <>
      {/* CTDS has no task swimlane primitive. These structural lanes compose its controls and status badges. */}
      <div className="task-areas-lanes">{rows.map(row => <TaskAreaLane key={`${taskId}:${row.area}`} row={row} members={members} membersReady={membersReady} canWrite={canWrite} disabled={disabled || busy} onSave={save} onReload={load} onDirty={laneDirty} />)}</div>
      <p className="task-areas-footnote">영역 상태는 협업 진행 기록입니다. AI 실행·Task 완료·코드 병합은 기존 승인 흐름에서 진행합니다. ‘작업 없음’ 영역은 진행률에서 제외합니다.</p>
      {data.history?.length ? <Disclosure><summary>담당·진행 변경 이력 · 최근 {data.history.length}건</summary><div className="task-area-history">{data.history.map((event, index) => <article key={event.id || index}><strong>{TASK_AREAS.find(area => area.key === event.area)?.label || '영역'} · {taskAreaHistoryChanges(event)}</strong><span>{event.actor_name || event.actor?.name || '프로젝트 구성원'} · {dateTime(event.created_at)}</span></article>)}</div>{data.history_has_more ? <p className="task-areas-footnote">최근 변경 50건을 표시합니다.</p> : null}</Disclosure> : null}
    </> : null}
  </section>;
}
