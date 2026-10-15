import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowRight, CheckCheck, File, FileUp, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react';
import { Badge, Button, ErrorNotice, FormField, JobExecution, Modal, SourceNotices, Spinner, dateTime, projectPath, shortId, Input, Textarea, Disclosure, Notice } from './ui.jsx';
import { HistoryDetails, RECORD_KINDS } from './records.jsx';
import { useSharedView } from './shared-view.jsx';
import { PROJECT_KINDS } from './project-scope.mjs';
import { createProjectRequest, NORA_WORKSPACE_PATTERN, retainProjectRequest } from './nora-workspace-state.mjs';

export function ProjectModal({ request, onClose, onCreated }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const pendingRequest = useRef(null), createdProject = useRef(null);
  async function submit(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(null);
    pendingRequest.current ||= createProjectRequest(Object.fromEntries(data), crypto.randomUUID());
    try {
      if (!createdProject.current) { const result = await request('/api/projects', { method: 'POST', body: pendingRequest.current }); createdProject.current = result.project; }
      await onCreated(createdProject.current); pendingRequest.current = null;
    } catch (err) { if (!createdProject.current && !retainProjectRequest(err)) pendingRequest.current = null; setError(err); } finally { setBusy(false); }
  }
  const locked = busy || Boolean(pendingRequest.current);
  return <Modal title="새 프로젝트 만들기" eyebrow="PROJECT SETUP" busy={busy} onClose={onClose}><form onSubmit={submit}><div className="modal-body"><p className="form-intro">문서와 결정 기록을 함께 관리할 작업 공간입니다.<br />생성한 계정에 프로젝트 관리자 권한이 부여됩니다.</p><FormField label="프로젝트 이름"><Input autoFocus name="name" required maxLength={160} disabled={locked} placeholder="예: 고객 포털 고도화" /></FormField><fieldset className="project-kind-choices" disabled={locked}><legend>프로젝트 용도</legend>{Object.entries(PROJECT_KINDS).filter(([value]) => value !== 'unspecified').map(([value, label]) => <label className="checkbox-label" key={value}><Input type="radio" name="project_kind" value={value} required /><span>{label}</span></label>)}</fieldset><FormField label="Nora 워크스페이스 ID" hint="Nora에서 이 프로젝트의 워크스페이스를 먼저 만든 뒤 t_로 시작하는 ID를 복사해 붙여 넣으세요."><Input name="nora_workspace_id" required pattern={NORA_WORKSPACE_PATTERN} maxLength={130} autoComplete="off" spellCheck={false} disabled={locked} placeholder="t_…" /></FormField><p className="inline-note">프로젝트의 문서·결정 맥락은 등록한 Nora 워크스페이스에서 관리합니다. Git 연결은 프로젝트 설정에서 선택하세요.</p>{pendingRequest.current && !busy ? <Notice tone="warning" title="프로젝트 생성 결과를 확인해 주세요">입력 내용을 유지했습니다. 아래 버튼으로 같은 생성 요청의 결과를 확인할 수 있습니다.</Notice> : null}<ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button type="submit" busy={busy} icon={ArrowRight}>{pendingRequest.current ? '같은 생성 요청 확인' : '프로젝트 만들기'}</Button></footer></form></Modal>;
}

export function RevisionModal({ project, doc, revisionId, request, canWrite, canReview, onClose, onChanged, onReview, onEdit, onImplementation }) {
  const sharedView = useSharedView();
  const [revision, setRevision] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [publishing, setPublishing] = useState(false);
  const route = `${projectPath(project.id)}/revisions/${encodeURIComponent(revisionId)}`;
  useEffect(() => {
    const controller = new AbortController();
    request(route, { signal: controller.signal }).then((data) => setRevision(data.revision)).catch((err) => { if (err.name !== 'AbortError') setError(err); });
    return () => controller.abort();
  }, [request, route]);
  useEffect(() => {
    if (!revision || !['queued', 'running', 'processing', 'extracting'].includes(revision.status)) return;
    const timer = setInterval(() => request(route).then((data) => setRevision(data.revision)).catch(setError), 5000);
    return () => clearInterval(timer);
  }, [revision?.status, request, route]);
  async function publish(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { await request(`${route}/publish-initial`, { method: 'POST', body: { reason: data.get('reason').trim(), acknowledge_extraction: data.get('acknowledge') === 'on' } }); await onChanged('첫 확정본으로 지정했습니다.'); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  async function startReview() {
    setBusy(true); setError(null);
    try { const result = await request(`${projectPath(project.id)}/reviews`, { method: 'POST', body: { revision_id: revisionId } }); onReview(result.review_id); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  const extracted = revision?.document_json;
  return <Modal title={doc.title} eyebrow={`REVISION ${shortId(revisionId)}`} busy={busy} wide onClose={onClose}><div className="modal-body"><ErrorNotice error={error} />{!revision ? error ? null : <Spinner /> : <><div className="revision-meta"><div><span>원본 파일</span><strong>{revision.filename}</strong></div><div><span>등록일</span><strong>{dateTime(revision.created_at)}</strong></div><Badge status={revision.status} />{!sharedView ? <Button asChild variant="secondary"><a href={`${route}/original`}><ArrowDownToLine size={15} />원본 내려받기</a></Button> : null}</div><div className="revision-domain"><span>{revision.domain_name || doc.domain_name}</span><span>{RECORD_KINDS[revision.record_kind || doc.record_kind] || RECORD_KINDS.specification}</span></div><RevisionProgress revision={revision} doc={doc} onImplementation={onImplementation} /><HistoryDetails history={revision.history} createdAt={revision.created_at} />{typeof revision.source_text === 'string' ? <Disclosure className="original-text"><summary>등록한 텍스트 원문</summary><pre>{revision.source_text}</pre></Disclosure> : null}{revision.sha256 ? <Disclosure className="checksum"><summary>원본 무결성 정보</summary><code>SHA-256 {revision.sha256}</code></Disclosure> : null}{extracted ? <><div className="section-heading extraction-heading"><h3>추출·정리된 원문</h3><span>{extracted.segments?.length || 0}개 구간</span></div><SourceNotices warnings={extracted.extraction?.warnings} incomplete={extracted.extraction?.complete === false} /><div className="segments">{(extracted.segments || []).map((segment) => <article key={segment.segment_id} className="segment"><header><strong>{segment.locator?.label || segment.segment_id}</strong>{segment.requirement_key ? <code>{segment.requirement_key}</code> : null}{segment.extraction_status !== 'ok' ? <Badge status="needs_review" /> : null}</header><pre>{segment.text}</pre></article>)}</div></> : revision.status === 'failed' ? <ErrorNotice error={{ message: '문서 처리에 실패했습니다. 작업 이력에서 원인을 확인한 뒤 재시도해 주세요.', code: revision.error_code }} /> : <Notice className={`notice ${revision.status === 'uncertain' ? 'warning' : 'subtle'}`}><FileUp size={18} /><p>{revision.status === 'uncertain' ? '문서 처리 결과를 확인해야 합니다. 관리자에게 실행 이력 확인을 요청해 주세요.' : '문서의 텍스트를 추출하고 정리하고 있습니다. 완료되면 이곳에 표시됩니다.'}</p></Notice>}
      {publishing ? <form className="initial-publish" onSubmit={publish}><h3>이 버전을 첫 확정본으로 지정</h3><p>이후 등록되는 버전은 이 문서를 기준으로 변경 사항을 비교합니다.</p><FormField label="확정 사유"><Textarea name="reason" required minLength={3} maxLength={4000} rows={3} placeholder="예: 담당자 확인을 마친 현재 운영 요구사항입니다." /></FormField><label className="checkbox-label"><Input name="acknowledge" type="checkbox" required /><span>원문과 추출 내용, 내용 확인 사항을 대조했습니다.</span></label><div className="inline-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => setPublishing(false)}>돌아가기</Button><Button type="submit" icon={CheckCheck} busy={busy}>첫 확정본 지정</Button></div></form> : null}
      {!canReview && !doc.baseline_revision_id ? <p className="role-note"><ShieldCheck size={15} />첫 확정본은 관리자 또는 검토자가 지정할 수 있습니다.</p> : null}
    </>}</div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>닫기</Button>{canWrite && typeof revision?.source_text === 'string' && onEdit ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onEdit(revision)}>내용을 편집해 새 버전</Button> : null}{revision?.status === 'ready' && !publishing && !sharedView ? doc.baseline_revision_id === revisionId ? <span className="current-baseline"><CheckCheck size={17} />현재 확정한 문서</span> : doc.baseline_revision_id ? <Button icon={ArrowRight} busy={busy} disabled={!canWrite} onClick={startReview}>확정본과 비교</Button> : <Button icon={CheckCheck} disabled={!canReview} onClick={() => setPublishing(true)}>확정본으로 지정</Button> : null}</footer></Modal>;
}


function RevisionProgress({ revision, doc, onImplementation }) {
  const done = revision.status === 'ready', stopped = ['failed', 'uncertain'].includes(revision.status);
  const baseline = doc.baseline_revision_id === revision.id;
  const steps = [
    { title: '원문 등록', detail: '파일과 이력 보존', state: 'done' },
    { title: '자동 추출·정리', detail: done ? '검증·내용 정리 완료' : stopped ? '작업 확인 필요' : '텍스트 추출·내용 정리', state: done ? 'done' : stopped ? 'stopped' : 'current' },
    { title: '사람의 확인', detail: baseline ? '확정본 지정됨' : '원문·적용 기준 대조', state: baseline ? 'done' : done ? 'current' : 'waiting' },
    { title: '다음 작업 선택', detail: '변경 검토·AI 작업 계획', state: 'waiting' },
  ];
  return <section className="revision-progress" aria-label="문서 처리 단계"><header><strong>{done ? '문서 추출·정리 완료' : stopped ? '문서 처리 상태를 확인해 주세요' : '등록한 문서를 자동으로 처리하고 있습니다'}</strong></header><ol>{steps.map((step, index) => <li key={step.title} className={step.state}><span className="revision-step-index">{step.state === 'done' ? <CheckCheck size={13} /> : String(index + 1).padStart(2, '0')}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div></li>)}</ol><p>{done ? '여기까지는 원문을 읽고 구조화한 단계입니다. 코드 구현·테스트·PR 생성은 시작되지 않았습니다.' : '문서를 등록하면 추출·정리가 자동으로 시작됩니다. 별도의 실행 버튼을 누를 필요가 없습니다.'}</p>{done ? <div className="revision-next-hint"><ArrowRight size={14} /><span>{baseline ? '이 문서는 현재 확정본입니다. 수정본을 새 버전으로 등록하면 변경 검토를 시작할 수 있습니다.' : doc.baseline_revision_id ? '원문을 확인한 후 아래의 ‘확정본과 비교’로 변경 사항을 분석하세요.' : '처음 등록한 문서는 원문과 적용 기준을 확인한 뒤 아래의 ‘확정본으로 지정’을 진행하세요.'}</span></div> : null}{done && (revision.record_kind || doc.record_kind) === 'specification' && onImplementation ? <Button type="button" variant="secondary" icon={ArrowRight} onClick={onImplementation}>AI 작업 계획으로</Button> : null}</section>;
}

export function RetryModal({ project, job, request, onClose, onDone }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), uncertain = job.status === 'uncertain';
  async function submit(event) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { await request(`${projectPath(project.id)}/jobs/${encodeURIComponent(job.id)}/retry`, { method: 'POST', body: { reason: data.get('reason').trim(), ...(uncertain ? { acknowledge_duplicate_risk: data.get('acknowledge') === 'on' } : {}) } }); await onDone(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Modal title="분석 작업 다시 실행" eyebrow={`JOB ${shortId(job.id)}`} busy={busy} onClose={onClose}><form onSubmit={submit}><div className="modal-body"><Notice className={`notice ${uncertain ? 'warning' : 'subtle'}`}><AlertTriangle size={19} /><p>{uncertain ? '이전 요청이 Nora에서 완료되었을 수 있습니다. Nora 실행 이력을 먼저 확인해 주세요. 재시도하면 분석이 중복 실행되고 추가 비용이 발생할 수 있습니다.' : '실패 원인을 확인하고 해결한 후 다시 실행해 주세요. 원문과 버전은 그대로 유지됩니다.'}</p></Notice><JobExecution job={job} />{job.error_code ? <p className="error-code">오류 코드: <code>{job.error_code}</code></p> : null}<FormField label="재시도 사유"><Textarea autoFocus name="reason" required minLength={3} maxLength={4000} rows={3} placeholder="확인한 원인과 조치 내용을 남겨 주세요." /></FormField>{uncertain ? <label className="checkbox-label"><Input name="acknowledge" type="checkbox" required /><span>실행 이력을 확인했으며, 중복 실행과 추가 비용 가능성을 이해했습니다.</span></label> : null}<ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button type="submit" icon={RefreshCw} busy={busy}>재시도</Button></footer></form></Modal>;
}
