import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowRight, Check, CheckCheck, FileText, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, Disclosure, Empty, ErrorNotice, FormField, Input, JobExecution, Notice, Select, SourceNotices, Spinner, Textarea, dateTime, projectPath } from './ui.jsx';
import { useSharedView } from './shared-view.jsx';
import { confirmSourceAnalysis } from './source-review-confirm.mjs';
import { ReviewDetail } from './review.jsx';
import { CommercialContentPreview } from './commercial.jsx';
import { DOCUMENT_CATEGORIES, HistoryDetails, RECORD_KINDS } from './records.jsx';
import { candidateBlockers, sourceCandidatesForRevision, sourceReviewDocuments, sourceReviewForRevision, sourceReviewSelection, sourceRunsForRevision } from './source-review-state.mjs';
import './source-review.css';

const EMPTY = [];
const ACTIVE = new Set(['queued', 'running', 'processing', 'extracting', 'waiting_approval', 'finalizing']);
const COMMERCIAL_KINDS = { proposal: '제안서', estimate: '견적서', contract: '계약서' };
const KINDS = { requirement: '요구사항', decision: '결정사항', question: '질문', change: '변경사항', note: '업무 메모', knowledge: '재사용 지식', retrospective: '작업 회고', meeting: '회의·대화' };

function useReviewData(request, route) {
  const [data, setData] = useState(null), [error, setError] = useState(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    const results = await Promise.allSettled([request(`${route}/context`), request(`${route}/context/ai-runs`), request(`${route}/commercial`)]);
    if (sequence.current !== id) return;
    const [context, ai, commercial] = results;
    // Failure to load a review source must stay visible; never present an empty result as success.
    setData({ context: context.status === 'fulfilled' ? context.value : null, ai: ai.status === 'fulfilled' ? ai.value : null, commercial: commercial.status === 'fulfilled' ? commercial.value : null });
    setError(results.find((result) => result.status === 'rejected')?.reason || null);
  }, [request, route]);
  useEffect(() => { setData(null); load(); return () => { sequence.current += 1; }; }, [load]);
  const active = data?.ai?.runs?.some((run) => ACTIVE.has(run.status));
  useEffect(() => { if (!active) return; const timer = setInterval(() => { if (!document.hidden) load(); }, 5000); return () => clearInterval(timer); }, [active, load]);
  return { data, error, load };
}

/** One place to read a source, inspect actual Nora output, and record a human decision. */
export function SourceReviewWorkspace({ project, documents = EMPTY, reviews = EMPTY, jobs = EMPTY, request, canWrite, canReview, onChanged, notify, onOpenContext, onOpenRecords, onOpenCommercial, onRetry, initialRevisionId, initialCommercialRevisionId, initialCommercialDocumentId, onDirty, guardNavigation }) {
  const route = projectPath(project.id), sharedView = useSharedView();
  const state = useReviewData(request, route);
  const [selectedId, setSelectedId] = useState(initialRevisionId || initialCommercialRevisionId || ''), [selectedReviewId, setSelectedReviewId] = useState(null);
  const [commercialDetails, setCommercialDetails] = useState({}), [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState(null), [dirty, setDirty] = useState(false);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => { setSelectedId(initialRevisionId || initialCommercialRevisionId || ''); setSelectedReviewId(null); }, [project.id, initialRevisionId, initialCommercialRevisionId]);
  useEffect(() => { setCommercialDetails({}); }, [project.id]);
  const catalog = useMemo(() => sourceReviewDocuments([
    ...documents.map((document) => ({ ...document, source_type: 'revision' })),
    ...(state.data?.commercial?.documents || []).map((document) => ({ ...document, source_type: 'commercial_revision', record_kind: document.kind, revisions: (commercialDetails[document.id]?.revisions || (document.latest_revision ? [document.latest_revision] : EMPTY)).map((revision) => ({ ...revision, status: 'ready', created_at: revision.created_at || document.updated_at || document.created_at })) })),
  ]), [documents, state.data?.commercial?.documents, commercialDetails]);
  const selected = sourceReviewSelection(catalog, selectedId, initialRevisionId || initialCommercialRevisionId);
  // Keep the source being reviewed stable when another user uploads a newer file.
  useEffect(() => { if (!selectedId && selected && !initialRevisionId && !initialCommercialRevisionId) setSelectedId(selected.revision.id); }, [selectedId, selected?.revision.id, initialRevisionId, initialCommercialRevisionId]);
  const commercialDocumentId = selected?.document.source_type === 'commercial_revision' ? selected.document.id : !selected && initialCommercialRevisionId ? initialCommercialDocumentId : null;
  const commercialLatest = state.data?.commercial?.documents?.find((document) => document.id === commercialDocumentId)?.latest_revision?.id;
  useEffect(() => {
    if (!commercialDocumentId || commercialDetails[commercialDocumentId]?.latest_revision?.id === commercialLatest) return;
    const controller = new AbortController(); setDetailLoading(true); setDetailError(null);
    request(`${route}/commercial/documents/${encodeURIComponent(commercialDocumentId)}`, { signal: controller.signal }).then(({ document }) => { if (!controller.signal.aborted) setCommercialDetails((old) => ({ ...old, [document.id]: document })); }).catch((error) => { if (!controller.signal.aborted) setDetailError(error); }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [request, route, commercialDocumentId, commercialLatest]);
  const review = selected?.document.source_type === 'revision' ? sourceReviewForRevision(reviews, selected?.revision.id) : null;
  const selectedReview = selectedReviewId || review?.id;
  async function changed(message) { if (message) notify?.(message); await Promise.allSettled([state.load(), Promise.resolve().then(() => onChanged?.({ quiet: true }))]); }
  function choose(id) { const apply = () => { setSelectedId(id); setSelectedReviewId(null); }; if (guardNavigation) guardNavigation(apply); else if (!dirty) apply(); }
  return <section className="source-review-workspace" aria-label="문서 분석·확정">
    <header className="source-review-intro"><div><h2>원문을 확인하고 요구사항·결정을 확정하세요</h2><p>등록한 자료와 Nora 분석을 함께 보고, 적용할 내용을 검토합니다.</p></div><Button type="button" variant="secondary" icon={RefreshCw} onClick={state.load}>새로고침</Button></header>
    <ErrorNotice error={state.error} onRetry={state.load} />
    <ErrorNotice error={detailError} />
    {!selected ? !state.data || detailLoading ? <Spinner label="검토할 자료를 불러오고 있습니다" /> : <Empty icon={FileText} title={selectedId ? '요청한 문서 버전을 찾을 수 없습니다' : '등록된 문서·기록이 없습니다'} action={onOpenRecords ? <Button type="button" onClick={onOpenRecords}>문서·기록으로</Button> : null}>{selectedId ? '현재 프로젝트에 속한 버전인지 문서·기록에서 확인해 주세요.' : '문서·기록에 자료를 등록하면 이곳에서 원문과 분석 결과를 검토할 수 있습니다.'}</Empty> : <>
      <div className="source-review-selectors"><FormField label="검토할 문서·기록"><Select value={selected.document.id} onChange={(event) => choose(catalog.find((document) => document.id === event.target.value)?.revisions[0]?.id || '')}>{catalog.map((document) => <option key={`${document.source_type}:${document.id}`} value={document.id}>{document.title}</option>)}</Select></FormField><FormField label="문서 버전"><Select value={selected.revision.id} onChange={(event) => choose(event.target.value)}>{selected.document.revisions.map((revision, index) => <option key={revision.id} value={revision.id}>{index === 0 ? '최신 · ' : ''}{revision.label || revision.filename || `v${revision.sequence || selected.document.revisions.length - index}`} · {dateTime(revision.created_at)}{selected.document.baseline_revision_id === revision.id ? ' · 확정본' : ''}</option>)}</Select></FormField></div>
      <SourceReviewDocument key={`${project.id}:${selected.document.source_type}:${selected.revision.id}`} project={project} doc={selected.document} revisionId={selected.revision.id} reviewId={selectedReview} request={request} canWrite={canWrite && !sharedView} canReview={canReview && !sharedView} context={state.data?.context} ai={state.data?.ai} jobs={jobs} onChanged={changed} onRefresh={state.load} onReview={setSelectedReviewId} onOpenContext={onOpenContext} onOpenCommercial={onOpenCommercial} onRetry={onRetry} onDirty={setDirty} guardNavigation={guardNavigation} />
    </>}
  </section>;
}

function SourceReviewDocument({ project, doc, revisionId, reviewId, request, canWrite, canReview, context, ai, jobs, onChanged, onRefresh, onReview, onOpenContext, onOpenCommercial, onRetry, onDirty, guardNavigation }) {
  const sharedView = useSharedView(), commercial = doc.source_type === 'commercial_revision';
  const route = projectPath(project.id), contextRoute = `${route}/context`, revisionRoute = `${route}/revisions/${encodeURIComponent(revisionId)}`;
  const [revision, setRevision] = useState(null), [source, setSource] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [requestPayload, setRequestPayload] = useState(null), [selectedRunId, setSelectedRunId] = useState(null);
  const [directRun, setDirectRun] = useState(null), [runRefresh, setRunRefresh] = useState(0);
  
  const alive = useRef(true);
  const [dirtyFields, setDirtyFields] = useState({});
  const updateDirty = useCallback((field, value) => setDirtyFields((old) => old[field] === value ? old : { ...old, [field]: value }), []);
  const analysisDirty = useCallback((value) => updateDirty('analysis', value), [updateDirty]);
  const initialDirty = useCallback((value) => updateDirty('initial', value), [updateDirty]);
  useEffect(() => { onDirty?.(Boolean(requestPayload) || Object.values(dirtyFields).some(Boolean)); }, [requestPayload, dirtyFields, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  const loadSource = useCallback(async () => {
    try {
      const data = await request(commercial ? `${contextRoute}/sources/commercial_revision/${encodeURIComponent(revisionId)}` : revisionRoute);
      if (!alive.current) return;
      if (commercial) { setSource(data.source); setRevision({ ...doc.revisions.find((item) => item.id === revisionId), source_text: data.source.text, status: 'ready' }); }
      else setRevision(data.revision);
      setError(null);
    } catch (err) { if (alive.current) setError(err); }
  }, [request, commercial, contextRoute, revisionId, revisionRoute]);
  useEffect(() => { alive.current = true; loadSource(); return () => { alive.current = false; }; }, [loadSource]);
  useEffect(() => { if (!ACTIVE.has(revision?.status) && !ACTIVE.has(revision?.analysis?.status) && revision?.analysis?.queue_status !== 'pending') return; const timer = setInterval(() => { if (!document.hidden) { loadSource(); onRefresh(); } }, 5000); return () => clearInterval(timer); }, [revision?.status, revision?.analysis?.status, loadSource, onRefresh]);
  const listedRuns = sourceRunsForRevision(ai?.runs, revisionId, doc.source_type);
  const runs = directRun && !listedRuns.some((item) => item.id === directRun.id) ? [directRun, ...listedRuns] : listedRuns;
  const run = selectedRunId ? runs.find((item) => item.id === selectedRunId) : runs[0];
  const missingRunId = selectedRunId && !run ? selectedRunId : !runs.length ? revision?.analysis?.run_id : null;
  useEffect(() => { if (!selectedRunId && run) setSelectedRunId(run.id); }, [selectedRunId, run?.id]);
  useEffect(() => {
    if (!missingRunId) return;
    const controller = new AbortController();
    request(`${contextRoute}/ai-runs/${encodeURIComponent(missingRunId)}`, { signal: controller.signal }).then(({ run: detail }) => {
      if (controller.signal.aborted) return;
      if (!sourceRunsForRevision([detail], revisionId, doc.source_type).length) throw new Error('선택한 원문과 분석 근거가 일치하지 않습니다.');
      setDirectRun(detail); setSelectedRunId(detail.id);
    }).catch((err) => { if (!controller.signal.aborted) setError(err); });
    return () => controller.abort();
  }, [request, contextRoute, missingRunId, revisionId, doc.source_type, runRefresh]);
  const candidates = sourceCandidatesForRevision(context?.candidates, revisionId, doc.source_type);
  const merged = sourceCandidatesForRevision(context?.records, revisionId, doc.source_type);
  const currentCandidates = candidates.filter((item) => item.status === 'pending');
  const job = [...jobs].filter((item) => item.entity_id === revisionId || item.revision_id === revisionId).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
  const changedDocument = !commercial && doc.baseline_revision_id && doc.baseline_revision_id !== revisionId;
  async function refresh(message) { await onChanged(message); await loadSource(); }
  async function analyze() {
    setBusy(true); setError(null);
    try {
      const currentSource = source || (await request(`${contextRoute}/sources/${doc.source_type}/${encodeURIComponent(revisionId)}`)).source;
      if (!alive.current) return;
      const payload = requestPayload || { request_id: crypto.randomUUID(), source_refs: [{ type: doc.source_type, id: revisionId, sha256: currentSource.sha256 }], domain_id: currentSource.domain_id || null, expected_context_version: context.version };
      setRequestPayload(payload);
      const response = await request(`${contextRoute}/ai-runs`, { method: 'POST', body: payload });
      if (!alive.current) return;
      setSelectedRunId(response.run.id); setRequestPayload(null); await onRefresh();
    } catch (err) { if (alive.current) { setError(err); if (err.status >= 400 && err.status < 500 && err.status !== 408) setRequestPayload(null); } }
    finally { if (alive.current) setBusy(false); }
  }
  function startAnalysis() { if (requestPayload || !Object.values(dirtyFields).some(Boolean)) analyze(); else guardNavigation?.(analyze); }
  async function compare() {
    setBusy(true); setError(null);
    try { const result = await request(`${route}/reviews`, { method: 'POST', body: { revision_id: revisionId } }); if (alive.current) { onReview(result.review_id); await onChanged(); } }
    catch (err) { if (alive.current) setError(err); } finally { if (alive.current) setBusy(false); }
  }
  function openEvidence(ref) {
    if (ref.type === doc.source_type && ref.id === revisionId) { document.getElementById('source-review-original')?.focus(); return; }
    onOpenContext?.(ref);
  }
  return <>
    <ErrorNotice error={error} onRetry={() => { loadSource(); setRunRefresh((value) => value + 1); }} />
    {!revision ? !error ? <Spinner label="원문을 불러오고 있습니다" /> : null : <div className="source-review-columns">
      <section className="source-review-original" id="source-review-original" tabIndex={-1} aria-label="등록한 원문"><header><div><span className="source-review-eyebrow">원문</span><h3>{doc.title}</h3><p>{commercial ? COMMERCIAL_KINDS[doc.record_kind] : DOCUMENT_CATEGORIES[doc.document_category] || RECORD_KINDS[doc.record_kind]}{doc.domain_name ? ` · ${doc.domain_name}` : ''}</p></div>{!commercial ? <Badge status={revision.status} /> : <Badge tone={source?.approved ? 'green' : 'quiet'}>{source?.approved ? '내부 승인됨' : '계약 문서 초안'}</Badge>}</header>
        {!sharedView && !commercial ? <Button type="button" variant="secondary" asChild><a href={`${revisionRoute}/original`}><ArrowDownToLine size={15} />원본 파일 내려받기</a></Button> : null}
        {commercial && revision.content ? <CommercialContentPreview content={revision.content} /> : typeof revision.source_text === 'string' ? <pre className="source-review-text">{revision.source_text}</pre> : revision.document_json ? <><p className="source-review-caption">파일에서 추출한 원문입니다. 표·그림·배치는 원본 파일과 대조해 주세요.</p><div className="source-review-segments">{(revision.document_json.segments || []).map((segment) => <article key={segment.segment_id}><header><strong>{segment.locator?.label || '원문 구간'}</strong>{segment.requirement_key ? <code>{segment.requirement_key}</code> : null}</header><pre>{segment.text}</pre></article>)}</div></> : ACTIVE.has(revision.status) ? <Spinner label="문서에서 원문을 추출하고 있습니다" /> : <Notice tone="warning" title="원문을 표시할 수 없습니다">문서 처리 상태를 확인해 주세요.</Notice>}
        <Disclosure><summary>등록 정보·내용 확인 사항</summary><HistoryDetails history={revision.history} createdAt={revision.created_at} /><SourceNotices warnings={revision.document_json?.extraction?.warnings} incomplete={revision.document_json?.extraction?.complete === false} /></Disclosure>
      </section>
      <section className="source-review-analysis" aria-label="Nora 분석과 검토"><header><span className="source-review-eyebrow">Nora 분석 · 사람의 확정</span><h3>요구사항·결정 요약</h3></header>
        {revision.status !== 'ready' ? <section className="source-review-pending"><p>{ACTIVE.has(revision.status) ? '원문 추출이 끝나면 분석과 검토를 진행할 수 있습니다.' : revision.status === 'uncertain' ? '이전 실행이 완료되었을 수 있습니다. 관리자에게 Nora 실행 결과 확인을 요청해 주세요.' : '원문 처리에 실패했습니다. 원인을 확인하고 재시도해 주세요.'}</p>{job ? <><JobExecution job={job} />{onRetry && ['failed', 'uncertain'].includes(job.status) ? <Button type="button" variant="secondary" disabled={!canWrite || (job.status === 'uncertain' && project.role !== 'owner')} onClick={() => onRetry(job)}>처리 재시도 검토</Button> : null}</> : null}</section> : <>
          {revision.analysis?.queue_status === 'blocked' && !run ? <Notice tone="warning" title="자동 분석을 시작하지 못했습니다"><p>원문과 Nora 연결 상태를 확인한 뒤 아래에서 다시 분석해 주세요.</p>{revision.analysis.error_code ? <small>{revision.analysis.error_code}</small> : null}</Notice> : null}
          {!ai ? <p className="source-review-caption">Nora 분석 정보를 불러오지 못했습니다. 새로고침으로 다시 확인해 주세요.</p> : !run && missingRunId ? error ? <Notice tone="warning" title="이 원문의 분석을 확인할 수 없습니다">오류를 해결하고 다시 불러와 주세요. 다른 분석으로 바꾸거나 중복 실행하지 않습니다.</Notice> : <Spinner label="이 원문의 Nora 분석을 불러오고 있습니다" /> : !run && ai.enabled && (revision.analysis?.queue_status === 'pending' || (revision.analysis?.queue_status === 'submitted' && ACTIVE.has(revision.analysis?.status))) ? <Spinner label="Nora가 등록한 자료를 자동으로 분석하고 있습니다" /> : !run ? <Empty compact icon={Sparkles} title="아직 Nora 분석 결과가 없습니다" action={canWrite ? <Button type="button" icon={Sparkles} busy={busy} disabled={!ai.enabled || !context} onClick={startAnalysis}>{requestPayload ? '같은 분석 요청 확인' : 'Nora로 요약·분석'}</Button> : null}>{ai.enabled ? '이 문서를 근거로 요구사항, 결정, 확인할 질문을 분석합니다.' : 'Nora 자료 분석 연결을 확인해야 합니다. 원문은 그대로 보존되어 있습니다.'}</Empty> : <>
            {runs.length > 1 ? <FormField label="Nora 분석 이력"><Select value={run.id} onChange={(event) => { const id = event.target.value; if (guardNavigation) guardNavigation(() => setSelectedRunId(id)); else if (!Object.values(dirtyFields).some(Boolean)) setSelectedRunId(id); }}>{runs.map((item) => <option key={item.id} value={item.id}>{dateTime(item.created_at)} · {item.result?.summary || item.reviewed_candidate?.summary || '자료 분석'}</option>)}</Select></FormField> : null}
            <SourceNoraResult key={run.id} run={run} route={contextRoute} request={request} canReview={canReview} version={context?.version} onChanged={refresh} onOpenSource={openEvidence} onOpenContext={onOpenContext} onDirty={analysisDirty} />
            {!ACTIVE.has(run.status) && canWrite ? <div className="source-review-reanalyze"><Button type="button" variant="secondary" disabled={!ai.enabled || !context || run.status === 'uncertain'} busy={busy} onClick={startAnalysis}>{requestPayload ? '같은 분석 요청 확인' : '최신 내용으로 다시 분석'}</Button>{run.status === 'uncertain' ? <small>실행 결과 확인 전에는 중복 분석을 시작하지 않습니다.</small> : null}</div> : null}
          </>}
          {requestPayload && !busy ? <Notice tone="warning" title="분석 요청 결과를 확인하지 못했습니다">같은 분석 요청으로 다시 확인하여 중복 실행을 방지합니다.</Notice> : null}
          {currentCandidates.length ? <section className="source-review-candidates"><h3>확정할 내용</h3>{currentCandidates.map((candidate) => <InlineCandidate key={candidate.id} candidate={candidate} route={contextRoute} version={context?.version} request={request} canReview={canReview} onDirty={(value) => updateDirty(candidate.id, value)} onRefine={() => onOpenContext?.({ type: 'candidate', id: candidate.id })} onChanged={async (message) => { await refresh(message); }} />)}</section> : null}
          {merged.length ? <section className="source-review-confirmed"><h3><CheckCheck size={17} />이 원문에서 확정한 내용</h3>{merged.map((item) => <article key={item.id}><span>{KINDS[item.kind] || item.kind}</span><strong>{item.title}</strong><p>{item.body}</p></article>)}</section> : null}
          {changedDocument ? <Disclosure className="source-review-document-confirm"><summary>이전 확정본과 문서 버전 비교</summary>{reviewId ? <ReviewDetail key={reviewId} embedded project={project} id={reviewId} request={request} canWrite={canWrite} canReview={canReview} onChanged={() => refresh()} notify={(message) => onChanged(message)} onRetry={onRetry} /> : <Empty compact icon={Sparkles} title="새 버전의 변경 분석이 필요합니다" action={canWrite ? <Button type="button" icon={Sparkles} busy={busy} onClick={compare}>변경 내용 분석</Button> : null}>현재 확정본과 새 버전의 차이, 영향 범위, 확인할 질문을 이 화면에 표시합니다.</Empty>}</Disclosure> : !commercial ? <InitialSourceConfirmation project={project} doc={doc} revisionId={revisionId} request={request} canReview={canReview && !ACTIVE.has(run?.status) && revision.analysis?.queue_status !== 'pending'} onChanged={refresh} onDirty={initialDirty} /> : canWrite && onOpenCommercial ? <Button type="button" variant="secondary" icon={ArrowRight} onClick={() => onOpenCommercial(doc.id)}>계약 문서 편집·내부 승인</Button> : null}
        </>}
      </section>
    </div>}
  </>;
}

function InlineCandidate({ candidate, route, version, request, canReview, onRefine, onChanged, onDirty }) {
  const [reason, setReason] = useState(''), [acknowledged, setAcknowledged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const dirtyCallback = useRef(onDirty); dirtyCallback.current = onDirty;
  useEffect(() => { dirtyCallback.current?.(Boolean(reason.trim() || acknowledged || busy)); }, [reason, acknowledged, busy]);
  useEffect(() => () => dirtyCallback.current?.(false), []);
  const blockers = candidateBlockers(candidate, version), blocked = Object.values(blockers).some(Boolean);
  async function decide(decision) {
    setBusy(true); setError(null);
    try { await request(`${route}/candidates/${encodeURIComponent(candidate.id)}/decision`, { method: 'POST', body: { decision, reason: reason.trim(), expected_context_version: version, expected_candidate_sha256: candidate.content_sha256 } }); await onChanged(decision === 'merged' ? '검토한 내용을 요구사항·결정으로 확정했습니다.' : '반려 사유를 기록했습니다.'); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <article className="source-review-candidate"><Badge tone="amber">{KINDS[candidate.kind] || candidate.kind} · 확정 전</Badge><h4>{candidate.title}</h4><p>{candidate.body}</p>{candidate.rationale ? <Disclosure><summary>판단 근거</summary><p>{candidate.rationale}</p></Disclosure> : null}{blocked ? <Notice tone="warning" title="확정 전에 추가 확인이 필요합니다"><p>{blockers.stale ? '분석 이후 확정 기록이 변경되었습니다. 최신 내용과 대조한 수정안을 작성해 주세요. ' : ''}{blockers.questions ? '답변을 확인해야 하는 질문이 있습니다. ' : ''}{blockers.conflicts ? '기존 결정과의 충돌을 해결해야 합니다.' : ''}</p><Button type="button" variant="secondary" onClick={onRefine}>질문·충돌 검토</Button></Notice> : null}{canReview ? <><FormField label="확정·반려 사유"><Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={5000} disabled={busy} placeholder="원문과 적용 조건을 확인한 결과" /></FormField><label className="checkbox-label"><Input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy} /><span>원문·분석 내용·기존 결정과의 관계를 확인했습니다.</span></label><div className="source-review-actions"><Button type="button" variant="secondary" disabled={busy || !reason.trim()} onClick={() => decide('rejected')}>반려</Button><Button type="button" icon={Check} busy={busy} disabled={!reason.trim() || !acknowledged || blocked} onClick={() => decide('merged')}>요구사항·결정으로 확정</Button></div></> : <p className="source-review-caption"><ShieldCheck size={15} />관리자 또는 검토자가 확정할 수 있습니다.</p>}<ErrorNotice error={error} /></article>;
}

function SourceNoraResult({ run, route, request, canReview, version, onChanged, onOpenSource, onOpenContext, onDirty }) {
  const result = run.result || run.reviewed_candidate;
  const [selected, setSelected] = useState([]), [reason, setReason] = useState(''), [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null), [waiting, setWaiting] = useState(false), [confirmed, setConfirmed] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const stale = run.context_version !== version;
  const reviewable = ['waiting_approval', 'ready', 'finalizing'].includes(run.status);
  const locked = busy || Boolean(pending);
  const confirmation = confirmed || run.confirmation;
  useEffect(() => { onDirty?.(!confirmation && Boolean(selected.length || reason.trim() || acknowledged || pending || busy)); }, [confirmation, selected, reason, acknowledged, pending, busy, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  async function confirm(event) {
    event.preventDefault();
    if (!canReview || busy || (!pending && (!acknowledged || !selected.length || !reason.trim() || stale))) return;
    setBusy(true); setError(null); setWaiting(false);
    const payload = pending || { selected_indices: [...selected].sort((a, b) => a - b), expected_sha256: run.reviewed_sha256, expected_context_version: run.context_version, reason: reason.trim() };
    setPending(payload);
    try {
      const response = await confirmSourceAnalysis({ request, route, runId: run.id, payload });
      if (!mounted.current) return;
      if (response.pending) { setWaiting(true); await onChanged(); return; }
      setConfirmed({ ...response, selected_indices: payload.selected_indices }); setPending(null);
      await onChanged(`${response.record_ids?.length || payload.selected_indices.length}개 항목을 요구사항·결정으로 확정했습니다.`);
    } catch (err) {
      if (!mounted.current) return;
      setError(err);
      // A definite rejection can be reviewed again. An ambiguous network result keeps
      // the exact snapshot for idempotent confirmation, including its original version.
      if (err.status >= 400 && err.status < 500 && err.status !== 408) { setPending(null); if (err.status === 409) await onChanged(); }
    } finally { if (mounted.current) setBusy(false); }
  }
  async function reject() {
    setBusy(true); setError(null);
    try { await request(`${route}/ai-runs/${encodeURIComponent(run.id)}/decision`, { method: 'POST', body: { decision: 'rejected', reason: reason.trim(), expected_sha256: run.reviewed_sha256 } }); setSelected([]); setReason(''); setAcknowledged(false); await onChanged('분석 결과를 반려했습니다. 원문은 보존됩니다.'); }
    catch (err) { if (mounted.current) setError(err); } finally { if (mounted.current) setBusy(false); }
  }
  return <article className="source-nora-result">
    <div className="source-nora-status"><Badge tone={confirmation ? 'green' : ['failed', 'uncertain'].includes(run.status) ? 'amber' : run.status === 'rejected' ? 'quiet' : 'blue'}>{confirmation ? '선택한 내용 확정됨' : { queued: '분석 대기', running: 'Nora 분석 중', waiting_approval: '내용 확인 후 확정', finalizing: '검토 결과 반영 중', ready: '내용 확인 후 확정', rejected: '분석 반려', failed: '분석 실패', uncertain: '실행 결과 확인 필요' }[run.status] || run.status}</Badge><time>{dateTime(run.created_at)}</time></div>
    {result ? <><p className="source-nora-summary">{result.summary}</p>{result.warnings?.length ? <Notice tone="warning" title="검토할 사항"><ul>{result.warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message || JSON.stringify(warning)}</li>)}</ul></Notice> : null}
      {run.source_refs?.length > 1 ? <Disclosure><summary>함께 분석한 원문 {run.source_refs.length}개</summary>{run.source_refs.map((ref) => <Button key={`${ref.type}:${ref.id}`} type="button" variant="ghost" onClick={() => onOpenSource(ref)}>{ref.title || '원문 확인'}</Button>)}</Disclosure> : null}
      <div className="source-nora-items">{!result.items?.length ? <p className="source-review-caption">이 분석에서 확정할 요구사항·결정 항목을 찾지 못했습니다. 원문을 확인해 주세요.</p> : null}{result.items?.map((item, index) => <section key={index} className="source-nora-item"><div className="source-nora-item-heading">{canReview && !confirmation && reviewable ? <Input type="checkbox" aria-label={`${item.title} 확정 대상으로 선택`} checked={selected.includes(index)} disabled={locked || stale || item.conflicts_with?.length > 0} onChange={(event) => setSelected((old) => event.target.checked ? [...old, index] : old.filter((value) => value !== index))} /> : null}<div><span>{KINDS[item.kind] || { fact: '사실', worklog: '작업 맥락', conflict: '충돌' }[item.kind] || item.kind}</span><h4>{item.title}</h4></div></div><p>{item.content}</p><div className="source-nora-tags">{confirmation ? <Badge tone={confirmation.selected_indices?.includes(index) ? 'green' : 'quiet'}>{confirmation.selected_indices?.includes(index) ? '확정됨' : '미확정'}</Badge> : null}<Badge tone={item.certainty === 'agreed' ? 'green' : 'quiet'}>{{ agreed: '고객 합의', ambiguous: '추가 확인 필요', proposed: '검토 제안' }[item.certainty] || '합의 여부 확인 필요'}</Badge><Badge tone={item.scope === 'change_request' ? 'amber' : 'quiet'}>{{ in_scope: '기존 범위 내', change_request: '변경 요청', unknown: '범위 확인 필요' }[item.scope] || '범위 확인 필요'}</Badge></div>{item.rationale ? <p className="source-nora-rationale"><strong>판단 근거</strong>{item.rationale}</p> : null}{item.evidence?.map((evidence, evidenceIndex) => { const ref = run.source_refs?.find((source) => `${source.type}:${source.id}` === evidence.source_id); return <blockquote key={evidenceIndex}><p>{evidence.quote}</p>{ref ? <Button type="button" variant="ghost" onClick={() => onOpenSource(ref)}>{ref.title || '왼쪽 원문 확인'}</Button> : <small>원문 연결을 확인해 주세요.</small>}</blockquote>; })}{item.conflicts_with?.length ? <Notice tone="warning" title="기존 결정과 충돌 가능성이 있습니다">충돌을 해결한 뒤 확정해야 합니다.</Notice> : null}</section>)}</div>
    </> : ACTIVE.has(run.status) ? <Spinner label="Nora가 원문과 기존 요구사항을 분석하고 있습니다" /> : null}
    {['failed', 'uncertain'].includes(run.status) ? <Notice tone="warning" title={run.status === 'uncertain' ? '이전 실행 결과를 확인해야 합니다' : '분석을 완료하지 못했습니다'}><p>{run.status === 'uncertain' ? '관리자가 Nora 실행 이력을 확인한 뒤 후속 처리해야 합니다.' : '연결 설정과 원문을 확인한 후 다시 분석할 수 있습니다.'}</p>{run.error_code ? <small>{run.error_code}</small> : null}</Notice> : null}
    {confirmation ? <Notice tone="success" title="선택한 내용을 확정했습니다">확정 기록에 원문 근거와 검토 의견이 함께 저장되었습니다.</Notice> : result && reviewable ? <form className="source-nora-confirm" onSubmit={confirm}><h4>적용할 내용을 선택하고 확정하세요</h4>{stale && !pending ? <Notice tone="warning" title="분석 이후 확정 기록이 바뀌었습니다">최신 내용으로 다시 분석하거나, 질문·충돌을 검토해 주세요.</Notice> : null}{canReview ? <><FormField label="검토 의견"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={4000} disabled={locked} placeholder="원문과 분석 결과를 대조한 내용" /></FormField><label className="checkbox-label"><Input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={locked} /><span>선택한 항목의 원문·적용 범위·합의 여부를 확인했습니다.</span></label>{waiting || pending && !busy ? <Notice tone="warning" title={waiting ? 'Nora의 검토 결과를 반영하고 있습니다' : '확정 요청 결과를 확인하지 못했습니다'}>선택한 항목과 의견을 유지했습니다. 아래 버튼으로 같은 요청을 이어서 확인해 주세요.</Notice> : null}<div className="source-review-actions">{run.status === 'waiting_approval' && !pending ? <Button type="button" variant="secondary" disabled={busy || !reason.trim()} onClick={reject}>반려</Button> : null}<Button type="submit" icon={CheckCheck} busy={busy} disabled={!pending && (!acknowledged || !selected.length || !reason.trim() || stale)}>{pending ? '같은 확정 요청 확인' : `선택한 내용 확정${selected.length ? ` · ${selected.length}개` : ''}`}</Button></div><p className="source-review-caption">확정한 내용만 프로젝트 요구사항·결정에 반영합니다. 고객 합의 상태와 계약 체결 여부는 별도로 유지합니다.</p></> : <p className="source-review-caption"><ShieldCheck size={15} />관리자 또는 검토자가 원문을 확인하고 확정할 수 있습니다.</p>}{onOpenContext && (stale || result.items?.some((item) => item.conflicts_with?.length)) ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenContext({ type: 'ai_run', id: run.id })}>질문·충돌 상세 검토</Button> : null}</form> : null}
    <ErrorNotice error={error} />
  </article>;
}

function InitialSourceConfirmation({ project, doc, revisionId, request, canReview, onChanged, onDirty }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function publish(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { await request(`${projectPath(project.id)}/revisions/${encodeURIComponent(revisionId)}/publish-initial`, { method: 'POST', body: { reason: data.get('reason').trim(), acknowledge_extraction: data.get('acknowledge') === 'on' } }); onDirty?.(false); await onChanged('이 버전을 문서 비교에 사용할 첫 확정본으로 지정했습니다.'); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  if (doc.baseline_revision_id) return <p className="source-review-caption"><CheckCheck size={16} />이 문서는 현재 버전 비교에 사용하는 확정본입니다.</p>;
  return <Disclosure className="source-review-document-confirm"><summary>문서 전체를 버전 비교의 확정본으로 지정</summary><p>이후 새 버전의 변경 내용을 비교할 원문을 정합니다. 위 요구사항·결정의 확정과는 별도로 기록됩니다.</p>{canReview ? <form onSubmit={publish} onChange={() => onDirty?.(true)}><FormField label="문서 확정 사유"><Textarea name="reason" required minLength={3} maxLength={4000} rows={2} disabled={busy} /></FormField><label className="checkbox-label"><Input name="acknowledge" type="checkbox" required disabled={busy} /><span>원문과 추출 내용, 내용 확인 사항을 대조했습니다.</span></label><Button type="submit" icon={CheckCheck} variant="secondary" busy={busy}>문서 확정본 지정</Button><ErrorNotice error={error} /></form> : <p>관리자 또는 검토자가 지정할 수 있습니다.</p>}</Disclosure>;
}
