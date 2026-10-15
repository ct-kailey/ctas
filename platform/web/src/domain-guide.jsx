import { List, ListItem } from './ctds-lists.jsx';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, BookOpen, Check, FileText, History, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Disclosure, Empty, ErrorNotice, FormField, Input, Notice, Spinner, Textarea, projectPath } from './ui.jsx';
import { ListItemLeadingIcon } from './components/ctds/ListItem';
import { useConfirm } from './confirmation.jsx';
import { GUIDE_SECTIONS, canReviewGuide, chooseGuideVersion, formatGuideText, guideAuthority, guideContents, guideDate, guideEvidence, guideFlowLayout, guideIsStale, guideNeedsConnection, guidePermissions, guideRunState, guideSourceRevision, guideSourceUrl, guideVersionState } from './domain-guide-state.mjs';
import './domain-guide.css';

function Evidence({ ids, sources, prefix, status, showAuthority = true }) {
  const evidence = guideEvidence(ids, sources), authority = guideAuthority(ids, sources, status);
  return <div className="domain-guide-evidence">
    {showAuthority ? <Badge tone={authority.tone}>{authority.label}</Badge> : null}
    {evidence.map(source => { const index = sources.findIndex(item => item.id === source.id); return <a key={source.id} href={`#${prefix}-source-${index}`} aria-label={`근거 ${index + 1}: ${formatGuideText(source.title, sources)}`}>근거 {index + 1}</a>; })}
  </div>;
}

function FlowDiagram({ workflow, sources, prefix, index }) {
  const layout = guideFlowLayout(workflow), markerId = `${prefix}-arrow-${index}`, titleId = `${prefix}-flow-${index}`;
  const nodeLabel = id => layout.nodes.find(node => node.id === id)?.label || '';
  return <section className="domain-guide-flow" aria-labelledby={titleId}>
    <h4 id={titleId}>{workflow.title || `업무 흐름 ${index + 1}`}</h4>
    <Evidence ids={workflow.evidence_ids} sources={sources} prefix={prefix} />
    {layout.nodes.length ? <>
      <div className="domain-guide-flow-scroll" tabIndex={0} role="region" aria-label={`${workflow.title || '업무 흐름'} 도식. 좁은 화면에서는 가로로 이동할 수 있습니다.`}>
        <svg className="domain-guide-flow-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-labelledby={titleId}>
          <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" className="domain-guide-arrow" /></marker></defs>
          {layout.edges.map(edge => <g key={edge.key}><path d={edge.path} className="domain-guide-edge" markerEnd={`url(#${markerId})`} />{edge.label ? <text x={edge.labelX} y={edge.labelY} className="domain-guide-edge-label"><title>{edge.label}</title>{edge.displayLabel}</text> : null}</g>)}
          {layout.nodes.map(node => <g key={node.id}>
            <title>{node.label}</title>
            {node.kind === 'decision' ? <polygon className="domain-guide-node decision" points={`${node.x + 100},${node.y} ${node.x + 200},${node.y + 52} ${node.x + 100},${node.y + 104} ${node.x},${node.y + 52}`} /> : <rect className={`domain-guide-node ${node.kind}`} x={node.x} y={node.y} width={node.width} height={node.height} rx={['start', 'end'].includes(node.kind) ? 52 : 0} />}
            <foreignObject x={node.x + (node.kind === 'decision' ? 45 : 16)} y={node.y + 16} width={node.width - (node.kind === 'decision' ? 90 : 32)} height={node.height - 32}><div className="domain-guide-node-label"><span>{node.label}</span></div></foreignObject>
          </g>)}
        </svg>
      </div>
      {layout.edges.some(edge => edge.numbered) ? <dl className="domain-guide-flow-legend" aria-label="연결 번호별 전체 설명">{layout.edges.filter(edge => edge.numbered).map(edge => <div key={edge.key}><dt>{edge.displayLabel} {edge.label}</dt><dd>{edge.fromLabel} → {edge.toLabel}</dd></div>)}</dl> : null}
      <Disclosure><summary>단계별 설명과 연결 관계</summary>
        <List className="domain-guide-flow-details">{layout.nodes.map(node => <ListItem key={node.id}><ListItem.Title>{node.label}</ListItem.Title>{node.kind === 'decision' ? <span> · 판단</span> : null}<Evidence ids={node.evidence_ids} sources={sources} prefix={prefix} /></ListItem>)}</List>
        {layout.edges.map(edge => <p key={edge.key}>{nodeLabel(edge.from)} → {edge.label ? `${edge.label} → ` : ''}{nodeLabel(edge.to)}</p>)}
      </Disclosure>
    </> : <p className="domain-guide-help">등록된 흐름 단계가 없습니다.</p>}
  </section>;
}

function GuideBody({ version, projectId, prefix, onSourceRevision, navigationDisabled }) {
  const sources = Array.isArray(version.snapshot?.sources) ? version.snapshot.sources : [], guide = guideContents(version.guide, sources);
  return <article className="domain-guide-content">
    <section id={`${prefix}-overview`} className="domain-guide-section" tabIndex={-1}>
      <h3>프로젝트 이해</h3><h2>{guide.title || '프로젝트 도메인 가이드'}</h2>
      <p className="domain-guide-prose">{guide.summary || '프로젝트 개요가 아직 정리되지 않았습니다.'}</p>
      <Evidence ids={guide.summaryEvidenceIds} sources={sources} prefix={prefix} />
    </section>
    <section id={`${prefix}-glossary`} className="domain-guide-section" tabIndex={-1}>
      <h3>핵심 용어</h3>
      {guide.glossary.length ? <dl className="domain-guide-glossary">{guide.glossary.map((item, index) => <div key={index}><dt>{item.term}</dt><dd><p className="domain-guide-prose">{item.definition}</p><Evidence ids={item.evidence_ids} sources={sources} prefix={prefix} /></dd></div>)}</dl> : <p className="domain-guide-help">이번 가이드에 정리된 용어가 없습니다.</p>}
    </section>
    <section id={`${prefix}-workflows`} className="domain-guide-section" tabIndex={-1}>
      <h3>업무 흐름</h3><p className="domain-guide-help">둥근 도형은 시작·종료, 사각형은 과정, 마름모는 판단입니다.</p>
      {guide.workflows.length ? guide.workflows.map((flow, index) => <FlowDiagram key={index} workflow={flow} sources={sources} prefix={prefix} index={index} />) : <p className="domain-guide-help">근거 자료에서 업무 흐름을 정리하지 못했습니다.</p>}
    </section>
    <section id={`${prefix}-policies`} className="domain-guide-section" tabIndex={-1}>
      <h3>업무 기준·정책</h3><p className="domain-guide-help">확정 근거와 참고 근거를 구분합니다. 가이드 검토 완료가 원문 정책의 확정을 대신하지 않습니다.</p>
      {guide.sections.length ? guide.sections.map((section, index) => <section className="domain-guide-policy" key={section.id || index}><h4>{section.title}</h4><p className="domain-guide-prose">{section.body}</p><Evidence ids={section.evidence_ids} sources={sources} prefix={prefix} status={section.status} /></section>) : <p className="domain-guide-help">정리된 업무 기준이 없습니다. 정책이 없음을 의미하지는 않습니다.</p>}
    </section>
    <section id={`${prefix}-changes`} className="domain-guide-section" tabIndex={-1}>
      <h3>최근 변경</h3>
      {guide.changes.length ? <List className="domain-guide-entry-list">{guide.changes.map((change, index) => <ListItem key={index}><ListItem.Title>{change.summary}</ListItem.Title><Evidence ids={change.evidence_ids} sources={sources} prefix={prefix} /></ListItem>)}</List> : <p className="domain-guide-help">이번 버전에 정리된 변경사항이 없습니다.</p>}
    </section>
    <section id={`${prefix}-questions`} className="domain-guide-section" tabIndex={-1}>
      <h3>확인 필요사항</h3>
      {guide.questions.length ? <List className="domain-guide-entry-list">{guide.questions.map((question, index) => <ListItem key={index}><ListItem.Title>{question.question}</ListItem.Title><ListItem.Description>{question.reason}</ListItem.Description><Evidence ids={question.evidence_ids} sources={sources} prefix={prefix} status="needs_confirmation" /></ListItem>)}</List> : <p className="domain-guide-help">가이드에 등록된 확인 항목이 없습니다. 자료 전체에 대한 검증 결과는 아닙니다.</p>}
    </section>
    <section id={`${prefix}-sources`} className="domain-guide-section" tabIndex={-1}>
      <h3>근거 자료 <span className="domain-guide-help">{sources.length}건</span></h3>
      <p className="domain-guide-help">이 버전을 작성할 때 사용한 자료입니다. 이후 변경된 원문과는 내용이 다를 수 있습니다.</p>
      {sources.length ? <List className="domain-guide-source-list">{sources.map((source, index) => {
        const revisionId = guideSourceRevision(source), url = guideSourceUrl(source, projectId);
        return <ListItem id={`${prefix}-source-${index}`} key={source.id || index} tabIndex={-1} data-ctds="list-item" leading={<ListItemLeadingIcon><FileText size={16} /></ListItemLeadingIcon>} trailing={<Badge tone={source.authority === 'confirmed' ? 'green' : 'quiet'}>{source.authority === 'confirmed' ? '확정 근거' : '참고 근거'}</Badge>}><ListItem.Title>{`${index + 1}. ${formatGuideText(source.title, sources) || '제목 없는 자료'}`}</ListItem.Title><ListItem.Meta>{`${formatGuideText(source.domain_name, sources) || '프로젝트 공통'} · ${guideDate(source.occurred_at)}`}</ListItem.Meta>
          <Disclosure><summary>가이드 작성 시점의 원문 발췌</summary><p className="domain-guide-prose">{formatGuideText(source.body, sources) || '저장된 발췌 내용이 없습니다.'}</p></Disclosure>
          {revisionId && onSourceRevision ? <Button type="button" variant="ghost" disabled={navigationDisabled} onClick={() => onSourceRevision(revisionId)}>원문 버전 열기</Button> : url ? <a href={url} target="_blank" rel="noopener noreferrer">원문 자료 열기 <span className="domain-guide-help">(새 탭)</span></a> : null}
        </ListItem>;
      })}</List> : <p className="domain-guide-help">표시할 원문 근거가 없습니다.</p>}
    </section>
  </article>;
}

export function DomainGuide({ project, request, notify, onDirty, onSourceRevision, onOpenSettings }) {
  const route = `${projectPath(project.id)}/domain-guide`, prefix = `domain-guide-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`, confirm = useConfirm();
  const [response, setResponse] = useState(null), [selectedId, setSelectedId] = useState(''), [historical, setHistorical] = useState(null);
  const [error, setError] = useState(null), [busy, setBusy] = useState(''), [loadingVersion, setLoadingVersion] = useState(false);
  const [comment, setComment] = useState(''), [acknowledged, setAcknowledged] = useState(false), [enableAuto, setEnableAuto] = useState(true);
  const lifecycle = useRef({ projectId: project.id, active: true, sequence: 0, detailSequence: 0 }), mutation = useRef(false);
  const data = response?.projectId === project.id ? response.data : null;
  const permissions = guidePermissions(project, data), version = chooseGuideVersion(data, selectedId, historical?.projectId === project.id ? historical.version : null);
  const run = guideRunState(data?.run), state = guideVersionState(version), stale = guideIsStale(version, data?.source), dirty = Boolean(comment.trim() || acknowledged);
  const current = () => lifecycle.current.active && lifecycle.current.projectId === project.id;

  const load = useCallback(async ({ signal, quiet = false } = {}) => {
    const sequence = ++lifecycle.current.sequence;
    try {
      const result = await request(route, { signal });
      if (!lifecycle.current.active || lifecycle.current.projectId !== project.id || sequence !== lifecycle.current.sequence) return;
      if (result.project?.id && result.project.id !== project.id) throw new Error('프로젝트의 가이드 응답을 확인하지 못했습니다. 다시 불러와 주세요.');
      setResponse({ projectId: project.id, data: result }); if (!quiet) setError(null);
    } catch (err) { if (lifecycle.current.active && lifecycle.current.projectId === project.id && sequence === lifecycle.current.sequence && err.name !== 'AbortError') setError(err); }
  }, [project.id, request, route]);

  useEffect(() => {
    lifecycle.current = { projectId: project.id, active: true, sequence: lifecycle.current.sequence + 1, detailSequence: lifecycle.current.detailSequence + 1 };
    mutation.current = false; setResponse(null); setSelectedId(''); setHistorical(null); setComment(''); setAcknowledged(false); setError(null); setBusy(''); setLoadingVersion(false); setEnableAuto(true);
    const controller = new AbortController(); void load({ signal: controller.signal });
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; lifecycle.current.detailSequence += 1; controller.abort(); };
  }, [load, project.id]);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => { if (!document.hidden && !mutation.current) void load({ quiet: true }); }, run.active ? 5000 : 30000);
    return () => clearInterval(timer);
  }, [Boolean(data), run.active, load]);
  useEffect(() => { onDirty?.(dirty || Boolean(busy)); return () => onDirty?.(false); }, [dirty, busy, onDirty]);

  async function mutate(suffix, body, success, method = 'POST', resetReview = false) {
    if (mutation.current) return;
    const operation = lifecycle.current, stillCurrent = () => current() && lifecycle.current === operation;
    mutation.current = true; setBusy(suffix || 'refresh'); setError(null);
    try {
      await request(`${route}${suffix}`, { method, body });
      if (!stillCurrent()) return;
      if (resetReview) { setComment(''); setAcknowledged(false); setSelectedId(''); setHistorical(null); }
      await load(); if (stillCurrent()) notify?.(success);
    } catch (err) { if (stillCurrent()) { await load({ quiet: true }); if (stillCurrent()) setError(err); } }
    finally { if (stillCurrent()) { mutation.current = false; setBusy(''); } }
  }

  async function selectVersion(id) {
    if (mutation.current || loadingVersion || id === version?.id) return;
    const operation = lifecycle.current, stillCurrent = () => current() && lifecycle.current === operation;
    if (dirty && !await confirm('작성 중인 검토 의견을 비우고 다른 버전을 볼까요?', { confirmLabel: '버전 전환' })) return;
    if (!stillCurrent()) return;
    const known = [data?.published, data?.draft].find(item => item?.id === id);
    setComment(''); setAcknowledged(false); setSelectedId(id); setHistorical(known ? { projectId: project.id, version: known } : null); setError(null);
    if (known) return;
    const sequence = ++lifecycle.current.detailSequence; setLoadingVersion(true);
    try {
      const result = await request(`${route}/versions/${encodeURIComponent(id)}`);
      if (!stillCurrent() || sequence !== lifecycle.current.detailSequence) return;
      if (result.project?.id && result.project.id !== project.id || result.version?.id !== id) throw new Error('선택한 가이드 버전을 확인하지 못했습니다.');
      setHistorical({ projectId: project.id, version: result.version });
    } catch (err) { if (stillCurrent() && sequence === lifecycle.current.detailSequence) setError(err); }
    finally { if (stillCurrent() && sequence === lifecycle.current.detailSequence) setLoadingVersion(false); }
  }

  async function downloadPdf() {
    if (!version || mutation.current) return;
    const operation = lifecycle.current, stillCurrent = () => current() && lifecycle.current === operation;
    mutation.current = true; setBusy('pdf'); setError(null);
    try {
      const result = await fetch(`${route}/versions/${encodeURIComponent(version.id)}/pdf`, { credentials: 'same-origin', headers: { Accept: 'application/pdf' } });
      if (!result.ok) { const body = await result.json().catch(() => null); throw new Error(body?.error?.message || 'PDF를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
      if (!(result.headers.get('content-type') || '').includes('application/pdf')) throw new Error('PDF 응답을 확인하지 못했습니다. 다시 시도해 주세요.');
      const blob = await result.blob(); if (!stillCurrent()) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `AINS-도메인-가이드-v${version.number}.pdf`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { if (stillCurrent()) setError(err); }
    finally { if (stillCurrent()) { mutation.current = false; setBusy(''); } }
  }

  async function retryUncertain() {
    if (!permissions.canReview || !run.uncertain || !data.run?.id || busy || dirty) return;
    const operation = lifecycle.current;
    const accepted = await confirm('이전 실행은 결과 미확인 이력으로 남습니다. 새 가이드 생성으로 추가 비용이 발생할 수 있습니다.', { title: '새 가이드 초안을 요청할까요?', confirmLabel: '새 초안 요청' });
    if (accepted && current() && lifecycle.current === operation) await mutate(`/runs/${encodeURIComponent(data.run.id)}/retry`, { acknowledge: true }, '이전 실행 이력을 보존하고 새 가이드 초안을 요청했습니다.');
  }

  function pinReviewVersion() {
    // Automatic refresh may create a newer draft while the reviewer is typing.
    // Keep the comment and acknowledgment attached to the version they actually read.
    if (version) { setSelectedId(version.id); setHistorical({ projectId: project.id, version }); }
  }

  const canGenerate = permissions.canRefresh && !busy && !dirty && !run.active && !run.uncertain && !data?.source?.error && data?.source?.source_count > 0;
  const reviewArgs = { project, data, version, busy: Boolean(busy), acknowledged, comment };
  return <div className="domain-guide">
    <header className="domain-guide-heading"><div className="domain-guide-actions">
      <Button type="button" variant="ghost" icon={RefreshCw} disabled={Boolean(busy)} onClick={() => load()}>새로고침</Button>
      {permissions.canRefresh && (data?.published || data?.draft) ? <Button type="button" variant="secondary" icon={RefreshCw} disabled={!canGenerate} busy={busy === '/refresh'} onClick={() => mutate('/refresh', {}, '최신 근거로 가이드 초안 갱신을 요청했습니다.')}>초안 업데이트</Button> : null}
    </div></header>
    <ErrorNotice error={error} onRetry={() => load()} />
    {onOpenSettings && guideNeedsConnection(error, data) ? <div className="domain-guide-actions"><Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={onOpenSettings}>Nora 연결 설정</Button></div> : null}
    {!data ? !error ? <Spinner label="프로젝트 도메인 가이드를 불러오고 있습니다" /> : null : <>
      <div className="domain-guide-statusbar"><span>{data.published ? `현재 검토 완료본 v${data.published.number}` : '검토 완료본 없음'}</span><span>{data.source?.source_count ?? 0}건의 근거</span><span>자동 초안 갱신 {data.settings?.auto_refresh ? '켜짐' : '꺼짐'}</span>{data.draft ? <Button type="button" variant="ghost" disabled={Boolean(busy) || loadingVersion} onClick={() => selectVersion(data.draft.id)}>초안 v{data.draft.number} 검토</Button> : null}</div>
      {data.source?.error ? <Notice tone="warning" title="최신 근거를 확인하지 못했습니다.">{data.source.error.message || '연결과 원문 접근 상태를 확인하고 다시 불러와 주세요.'} 기존 가이드는 작성 당시의 근거로 계속 읽을 수 있습니다.</Notice> : null}
      {data.settings?.last_error_code ? <Notice tone="warning" title="자동 초안 갱신을 확인해 주세요.">{data.settings.last_error_message || '자동 갱신을 진행하지 못했습니다. 연결 상태를 확인하고 수동 갱신을 요청해 주세요.'}</Notice> : null}
      {data.source?.changed || stale ? <Notice tone="warning" title="가이드 작성 이후 근거가 변경되었습니다.">기존 검토 완료본은 유지됩니다. 최신 자료로 초안을 갱신하고 변경 내용을 검토해 주세요.</Notice> : null}
      {data.run && run.active ? <Notice tone="neutral" title={run.label}><p role="status">초안이 준비되면 이 화면에서 검토할 수 있습니다.</p></Notice> : null}
      {data.run && (run.failed || run.uncertain) ? <Notice tone="warning" title={run.label} actions={run.uncertain && permissions.canReview ? <Button type="button" variant="secondary" disabled={Boolean(busy) || dirty} onClick={retryUncertain}>확인 후 새 초안 요청</Button> : null}>{run.uncertain ? 'Nora의 처리 결과를 아직 확인하지 못했습니다. 상태를 새로고침해 결과를 확인해 주세요.' : data.run.error_message || 'Nora 연결과 등록된 자료를 확인한 뒤 초안 갱신을 다시 요청해 주세요.'} 기존 검토 완료본은 유지됩니다.</Notice> : null}
      {!data.published && !data.draft && !selectedId ? <section className="domain-guide-start">
        <Empty icon={BookOpen} title="아직 도메인 가이드가 없습니다">등록한 자료로 초안을 만들고 담당자가 검토합니다.</Empty>
        {permissions.canConfigure ? <label className="domain-guide-check"><Input type="checkbox" checked={enableAuto} disabled={Boolean(busy) || run.active} onChange={event => setEnableAuto(event.target.checked)} />새 이력이 생기면 가이드 초안 자동 갱신</label> : null}
        {permissions.canRefresh ? <Button type="button" icon={BookOpen} disabled={!canGenerate} busy={busy === '/refresh'} onClick={() => mutate('/refresh', permissions.canConfigure ? { enable_auto: enableAuto } : {}, '첫 도메인 가이드 초안 작성을 요청했습니다.')}>가이드 초안 만들기</Button> : <p className="domain-guide-help">프로젝트 담당자에게 가이드 초안 작성을 요청해 주세요.</p>}
        {data.source?.source_count === 0 ? <p className="domain-guide-help">먼저 프로젝트 자료를 등록하고 원문 처리 상태를 확인해 주세요.</p> : null}
      </section> : null}
      {version || selectedId ? <div className="domain-guide-layout">
        <aside className="domain-guide-sidebar" aria-label="가이드 목차와 버전">
          <nav aria-label="도메인 가이드 목차"><h3>목차</h3>{GUIDE_SECTIONS.map(item => <a key={item.id} href={`#${prefix}-${item.id}`}>{item.label}</a>)}</nav>
          <Disclosure><summary><History size={16} /> 버전 이력</summary><List className="domain-guide-version-list">{(data.versions || []).map(item => <ListItem key={item.id} data-ctds="list-item" leading={<ListItemLeadingIcon><FileText size={16} /></ListItemLeadingIcon>} trailing={<Button type="button" variant="ghost" aria-pressed={version?.id === item.id} disabled={Boolean(busy) || loadingVersion} onClick={() => selectVersion(item.id)}>{version?.id === item.id ? '읽는 중' : '보기'}</Button>}><ListItem.Title>{`v${item.number} · ${guideVersionState(item).label}`}</ListItem.Title><ListItem.Meta>{guideDate(item.created_at)}</ListItem.Meta></ListItem>)}</List></Disclosure>
        </aside>
        <div className="domain-guide-reading">
          {loadingVersion ? <Spinner label="선택한 가이드 버전을 불러오고 있습니다" /> : version ? <>
            <div className="domain-guide-version-heading"><div className="domain-guide-version-meta"><strong>v{version.number}</strong><Badge tone={state.tone}>{state.label}</Badge>{stale ? <Badge tone="amber">최신 근거와 다름</Badge> : null}<span>{guideDate(version.created_at)}</span></div><Button type="button" variant="secondary" icon={ArrowDownToLine} busy={busy === 'pdf'} disabled={Boolean(busy)} onClick={downloadPdf}>PDF 다운로드</Button></div>
            {version.status === 'draft' ? <Notice tone="warning" title="아직 검토하지 않은 초안입니다.">원문 근거와 변경사항을 대조해 주세요. 승인 전까지 현재 검토 완료본은 바뀌지 않습니다.</Notice> : null}
            {version.review_comment ? <p className="domain-guide-review-comment"><strong>검토 의견</strong> {formatGuideText(version.review_comment, version.snapshot?.sources)}</p> : null}
            <GuideBody version={version} projectId={project.id} prefix={prefix} onSourceRevision={onSourceRevision} navigationDisabled={dirty || Boolean(busy)} />
            {permissions.canReview && version.status === 'draft' ? <form className="domain-guide-review" onSubmit={event => { event.preventDefault(); if (canReviewGuide(reviewArgs)) void mutate(`/versions/${encodeURIComponent(version.id)}/review`, { decision: 'approve', comment: comment.trim() }, '검토한 가이드를 새 완료본으로 반영했습니다.', 'POST', true); }}>
              <h3><ShieldCheck size={19} />초안 검토</h3>
              <FormField label="검토 의견" hint="반려할 때는 보완할 내용을 입력해 주세요."><Textarea rows={3} maxLength={2000} value={comment} disabled={Boolean(busy)} onChange={event => { pinReviewVersion(); setComment(event.target.value); }} /></FormField>
              <label className="domain-guide-check"><Input type="checkbox" checked={acknowledged} disabled={Boolean(busy) || stale || Boolean(data.source?.error)} onChange={event => { pinReviewVersion(); setAcknowledged(event.target.checked); }} />원문 근거와 변경사항을 확인했습니다.</label>
              {stale ? <p className="domain-guide-help">근거가 변경된 초안은 승인할 수 없습니다. 최신 근거로 새 초안을 요청해 주세요.</p> : null}
              {data.draft?.id !== version.id ? <p className="domain-guide-help">새 초안이 작성되었습니다. 위의 초안 검토 버튼에서 최신 버전을 선택해 주세요. 작성 중인 의견은 현재 읽는 버전에 유지됩니다.</p> : null}
              <div className="domain-guide-actions"><Button type="button" variant="secondary" disabled={!canReviewGuide({ ...reviewArgs, decision: 'reject' })} busy={busy.endsWith('/review')} onClick={() => mutate(`/versions/${encodeURIComponent(version.id)}/review`, { decision: 'reject', comment: comment.trim() }, '보완 의견과 함께 가이드 초안을 반려했습니다.', 'POST', true)}>보완 요청·반려</Button><Button type="submit" icon={Check} disabled={!canReviewGuide(reviewArgs)} busy={busy.endsWith('/review')}>가이드 검토 완료</Button></div>
            </form> : version.status === 'draft' ? <p className="domain-guide-help">관리자와 검토자가 초안을 검토하고 완료본으로 반영할 수 있습니다.</p> : null}
          </> : !error ? <Empty compact title="선택한 버전을 찾지 못했습니다">버전 이력에서 다른 가이드를 선택해 주세요.</Empty> : null}
        </div>
      </div> : null}
      <Disclosure className="domain-guide-settings"><summary>자동 갱신 설정</summary><p className="domain-guide-help">새 이력은 초안에 반영하고, 검토 후 완료본으로 적용합니다.</p>
        {permissions.canConfigure ? <label className="domain-guide-check"><Input type="checkbox" checked={Boolean(data.settings?.auto_refresh)} disabled={Boolean(busy) || dirty} onChange={event => mutate('/settings', { auto_refresh: event.target.checked }, '자동 초안 갱신 설정을 저장했습니다.', 'PUT')} />새 이력이 생기면 초안 자동 갱신</label> : <p className="domain-guide-help">자동 갱신 설정은 프로젝트 관리자가 변경할 수 있습니다.</p>}
      </Disclosure>
    </>}
  </div>;
}
