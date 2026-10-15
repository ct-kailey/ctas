import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import { Button } from '../components/ctds/Button/Button';
import { Textarea } from '../components/ctds/Textarea/Textarea';
import { Badge } from '../components/ctds/Badge/Badge';
import { Callout } from '../components/ctds/Callout/Callout';
import { Select } from '../components/ctds/Select/Select';
import { Disclosure } from '../components/ctds/Disclosure/Disclosure';
import { executionError, executionReadiness, localRunRequest, runActive, runLabel, runTone } from './execution-state.mjs';

function time(value) { return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('ko-KR') : '시간 기록 없음'; }
function RunResult({ run }) {
  if (!run) return null;
  return <section className="desktop-stack desktop-run-result" aria-label="로컬 개발 실행 결과">
    <div className="desktop-section-heading"><h3>실행 결과</h3><Badge size="md" variant="soft" status={runTone(run)} data-ctds="badge">{runLabel(run)}</Badge></div>
    <dl className="desktop-facts"><div><dt>프로젝트</dt><dd>{run.projectId}</dd></div><div><dt>대상 저장소</dt><dd><code>{run.repositoryUrl}</code></dd></div><div><dt>기준 커밋</dt><dd><code>{run.baseSha || '확인 중'}</code></dd></div><div><dt>실행 폴더</dt><dd><code>{run.workingFolder || '준비 중'}</code></dd></div><div><dt>시작 / 종료</dt><dd>{time(run.startedAt || run.createdAt)}{run.completedAt ? ` / ${time(run.completedAt)}` : ''}</dd></div></dl>
    {runActive(run) ? <p className="desktop-caption" role="status">실행 상태를 자동으로 확인하고 있습니다. 저장된 실제 진행 기록은 아래에서 볼 수 있습니다.</p> : null}
    {run.errorCode ? <Callout tone="warning" title={executionError(run)} data-ctds="callout"><code>{run.errorCode}</code></Callout> : null}
    {run.summary ? <p className="desktop-run-summary">{run.summary}</p> : null}
    <p className="desktop-caption">이 결과는 로컬 실행 기록입니다. 완료 상태만으로 테스트 통과나 변경사항 승인을 의미하지 않습니다. 원본 저장소에 반영하거나 push·PR·merge하지 않습니다.</p>
    <div className="desktop-stack">
      <Disclosure><Disclosure.Trigger>변경 파일 · {run.changedFiles?.length || 0}개</Disclosure.Trigger><Disclosure.Body><div className="desktop-stack">{run.changedFiles?.length ? <ul className="desktop-file-list">{run.changedFiles.map((file, index) => <li key={`${index}:${file}`}><code>{file}</code></li>)}</ul> : <p className="desktop-caption">기록된 파일 변경이 없습니다.</p>}{run.diff ? <pre className="desktop-code" tabIndex={0} aria-label="실제 코드 변경 내역"><code>{run.diff}</code></pre> : <p className="desktop-caption">표시할 diff가 없습니다.</p>}</div></Disclosure.Body></Disclosure>
      <Disclosure><Disclosure.Trigger>실행 기록 · {run.events?.length || 0}건</Disclosure.Trigger><Disclosure.Body>{run.events?.length ? <ol className="desktop-event-list">{run.events.map((event, index) => <li key={`${index}:${event.at}`}><time dateTime={event.at}>{time(event.at)}</time><span>{event.message}</span></li>)}</ol> : <p className="desktop-caption">아직 저장된 실행 기록이 없습니다.</p>}</Disclosure.Body></Disclosure>
    </div>
    {run.limitations?.length ? <ul className="desktop-limits desktop-caption">{run.limitations.map((value, index) => <li key={index}>{value}</li>)}</ul> : null}
  </section>;
}
export function LocalDevelopment({ state, dirty, native, disabled, api, onRunningChange }) {
  const [prompt, setPrompt] = useState(''), [runs, setRuns] = useState([]), [selectedId, setSelectedId] = useState(''), [selected, setSelected] = useState(null), [loading, setLoading] = useState(false), [pending, setPending] = useState(null), [error, setError] = useState(null), [loadError, setLoadError] = useState(null), [revision, setRevision] = useState(0);
  const lifecycle = useRef({ active: true, sequence: 0, operation: null }), activeRunRef = useRef(false);
  useEffect(() => { lifecycle.current.active = true; return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; }; }, []);
  useEffect(() => {
    if (!native || !api.listLocalRuns) return undefined;
    let active = true, timer, failures = 0; const sequence = ++lifecycle.current.sequence;
    async function load() {
      setLoading(true);
      try {
        const list = await api.listLocalRuns();
        if (!active || sequence !== lifecycle.current.sequence) return;
        setRuns(list);
        const id = list.some(run => run.id === selectedId) ? selectedId : list[0]?.id || '';
        if (id !== selectedId) { setSelectedId(id); return; }
        const detail = id ? await api.getLocalRun(id) : null;
        if (!active || sequence !== lifecycle.current.sequence) return;
        setSelected(detail); setLoadError(null); failures = 0;
        if (list.some(runActive) || runActive(detail)) timer = setTimeout(load, 2000);
      } catch (err) { if (active && sequence === lifecycle.current.sequence) { setLoadError(executionError(err)); if (activeRunRef.current && failures < 3) timer = setTimeout(load, 2000 * (2 ** failures++)); } }
      finally { if (active && sequence === lifecycle.current.sequence) setLoading(false); }
    }
    void load(); return () => { active = false; clearTimeout(timer); };
  }, [api, native, selectedId, revision]);
  const running = runs.some(runActive) || runActive(selected), readiness = executionReadiness(state, { native, dirty });
  activeRunRef.current = running;
  useEffect(() => { onRunningChange?.(running); }, [onRunningChange, running]);
  async function perform(kind, operation) {
    if (lifecycle.current.operation || !native) return;
    const token = Symbol(kind); lifecycle.current.operation = token; lifecycle.current.sequence += 1; setPending(kind); setError(null);
    try {
      const run = await operation();
      if (!lifecycle.current.active || lifecycle.current.operation !== token) return;
      setSelected(run); setSelectedId(run.id); setRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
      if (kind === 'start') setPrompt('');
    } catch (err) { if (lifecycle.current.active && lifecycle.current.operation === token) setError(executionError(err)); }
    finally { if (lifecycle.current.operation === token) { lifecycle.current.operation = null; if (lifecycle.current.active) { setPending(null); setRevision(value => value + 1); } } }
  }
  function start(event) {
    event.preventDefault(); if (!readiness.ready || running || disabled || pending) return;
    try { const request = localRunRequest(prompt, state); void perform('start', () => api.startLocalRun(request)); } catch (err) { setError(executionError(err)); }
  }
  return <section className="desktop-panel desktop-stack" aria-labelledby="desktop-development-title">
    <header className="desktop-section-heading"><div><h2 id="desktop-development-title">로컬 AI 개발</h2><p className="desktop-caption">Codex CLI로 별도 작업 폴더에서 코드를 수정하고 실제 diff를 확인합니다.</p></div><Badge variant="soft" size="md" data-ctds="badge">{state?.profile?.provider === 'claude-code' ? 'Claude Code · 실행 준비 중' : 'Codex'}</Badge></header>
    <form className="desktop-stack" onSubmit={start}>
      <Textarea label="개발할 내용" size="sm" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={!native || Boolean(pending) || running} placeholder="구현할 기능, 수정 범위와 확인할 테스트를 적어 주세요." maxLength={12000} showCount minRows={3} maxRows={8} data-ctds="textarea" />
      <p className="desktop-caption">{readiness.reason} CLI 계정 로그인이 필요합니다.</p>
      {state?.diagnostics?.repository?.clean === false ? <Callout tone="warning" title="커밋하지 않은 변경은 포함되지 않습니다" data-ctds="callout">현재 HEAD 기준으로 작업합니다. 변경 중인 파일까지 작업에 포함하려면 먼저 원본 저장소에서 커밋한 뒤 환경을 다시 확인해 주세요.</Callout> : null}
      <div className="desktop-section-heading"><Button type="submit" size="sm" disabled={!readiness.ready || disabled || loading || running || Boolean(pending) || !prompt.trim()} loading={pending === 'start'} leftIcon={<Play size={16} aria-hidden="true" />} data-ctds="button">개발 시작</Button><span className="desktop-caption">원본 폴더 유지 · 자동 push·PR·merge 없음</span></div>
    </form>
    {error || loadError ? <Callout tone="destructive" role="alert" title={error || loadError} data-ctds="callout" /> : null}
    <div className="desktop-section-heading"><h3>이 기기의 실행 내역</h3><Button type="button" variant="ghost" size="sm" disabled={!native || loading || Boolean(pending)} loading={loading && !running} onClick={() => { setError(null); setRevision(value => value + 1); }} leftIcon={<RefreshCw size={16} aria-hidden="true" />} data-ctds="button">새로고침</Button></div>
    {runs.length ? <Select size="sm" label="실행 선택" value={selectedId} onValueChange={id => { setSelected(null); setSelectedId(id); setError(null); }} disabled={Boolean(pending)} data-ctds="select"><Select.Trigger data-ctds="select-trigger"><Select.Value placeholder="실행 선택" /></Select.Trigger><Select.Content data-ctds="select-content">{runs.map(run => <Select.Item key={run.id} value={run.id}>{`${run.projectId} · ${runLabel(run)} · ${time(run.createdAt)}`}</Select.Item>)}</Select.Content></Select> : <p className="desktop-caption">이 기기에서 시작한 개발 작업이 없습니다.</p>}
    {runActive(selected) ? <div className="desktop-run-action"><Button type="button" size="sm" variant="outline" disabled={Boolean(pending)} loading={pending === 'cancel'} onClick={() => void perform('cancel', () => api.cancelLocalRun(selected.id))} leftIcon={<Square size={14} aria-hidden="true" />} data-ctds="button">실행 취소</Button></div> : null}
    <RunResult run={selected} />
  </section>;
}
