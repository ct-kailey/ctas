import { List, ListItem } from './ctds-lists.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { CheckCheck, ClipboardCheck, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge, Button, Disclosure, Empty, ErrorNotice, FormField, Input, Notice, SectionHeading, Textarea, dateTime, projectPath, shortId } from './ui.jsx';
import { projectKindLabel } from './project-scope.mjs';
import './implementation-preparation.css';

const USAGES = { implementation: '이 프로젝트의 구현 문서', reference: '참고 자료 (구현에 사용하지 않음)', mismatch: '다른 프로젝트 문서 (구현에 사용하지 않음)' };

export function ProjectScopeSummary({ project, repository, title = '계획을 만들 프로젝트' }) {
  return <section className="implementation-snapshot" aria-label={title}>
    <h3>{title}</h3>
    <dl><div><dt>프로젝트</dt><dd>{project?.name || '이름 없음'}{project?.project_kind ? ` · ${projectKindLabel(project)}` : ''}</dd></div><div><dt>대상 저장소</dt><dd>{repository?.url || '미설정'}</dd></div><div><dt>프로젝트 목표</dt><dd>{project?.goal || '미설정'}</dd></div><div><dt>기준 브랜치</dt><dd>{repository?.base_branch || '미설정'}{repository?.head_sha ? ` · ${shortId(repository.head_sha)}` : ''}</dd></div></dl>
  </section>;
}

function SourceReview({ source, project, canReview, busy, onReview }) {
  const [usage, setUsage] = useState(''), [reason, setReason] = useState('');
  return <ListItem >
    <header><ListItem.Title>{source.title}</ListItem.Title><Badge tone={source.blockers?.length ? 'amber' : 'green'}>{['reference', 'mismatch'].includes(source.review?.usage) ? '구현에 사용할 수 없음' : source.blockers?.length ? '적용 여부 확인 필요' : '구현 문서 확인됨'}</Badge></header>
    <p className="implementation-source-meta">확정본 {shortId(source.revision_id)} · 원문 발췌 (앞부분 최대 2,000자)</p>
    <blockquote>{source.excerpt || '미리 볼 수 있는 본문이 없습니다. 원문을 확인해 주세요.'}</blockquote>
    <Button asChild variant="ghost"><a href={`${projectPath(project.id)}/revisions/${encodeURIComponent(source.revision_id)}/original`} target="_blank" rel="noopener noreferrer">원문 확인</a></Button>
    {source.blockers?.length ? <List className="implementation-source-blockers">{source.blockers.map((item, index) => <ListItem key={`${item.code}:${index}`}><ListItem.Title>{item.message}</ListItem.Title></ListItem>)}</List> : null}
    {source.review ? <p className="implementation-source-meta">최근 검토: {USAGES[source.review.usage] || source.review.usage} · {dateTime(source.review.reviewed_at)}<br />{source.review.reason}</p> : null}
    {canReview ? <Disclosure key={source.review?.id || 'unreviewed'} defaultOpen={!source.review}><summary>문서의 적용 대상 검토</summary>
      <fieldset disabled={busy} className="implementation-source-classification"><legend>이 문서를 {project.name} 구현에 사용할 수 있나요?</legend>
        {Object.entries(USAGES).map(([value, label]) => <label className="checkbox-label" key={value}><Input type="radio" name={`source-usage-${source.revision_id}`} value={value} checked={usage === value} onChange={() => setUsage(value)} /><span>{label}</span></label>)}
        <FormField label="판단 근거" hint="프로젝트 목표와 문서 내용을 비교해, 이 프로젝트 구현에 사용해도 되는지 적어 주세요."><Textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={2000} placeholder="예: 이 문서는 고객 검사 운영 정책이며, AINS 플랫폼 기능 구현 요구사항이 아닙니다." /></FormField>
        <Button type="button" variant="secondary" icon={CheckCheck} disabled={!usage || reason.trim().length < 3} onClick={() => onReview(source, usage, reason.trim())}>적용 여부 기록</Button>
      </fieldset>
    </Disclosure> : source.blockers?.length ? <p className="role-note">프로젝트 관리자 또는 검토자가 문서 적용 대상을 확인해야 합니다.</p> : null}
  </ListItem>;
}

export function ImplementationPlanComposer({ project, settings, sources, request, canWrite, canReview, onSettings, onCreated, classificationId, initialSelected = [], onDirtyChange, onBusyChange }) {
  const route = projectPath(project.id);
  const [selected, setSelected] = useState(initialSelected), [preparation, setPreparation] = useState(null), [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [locked, setLocked] = useState(false);
  const pendingRequest = useRef(null), lifecycle = useRef({ active: true, sequence: 0 });
  const contextReady = Boolean(settings?.goal?.trim() && settings?.repository_url && settings?.base_branch && settings?.project_kind && settings.project_kind !== 'unspecified');
  const sourceVersion = sources.map(doc => `${doc.id}:${doc.baseline_revision_id}`).join(',');
  useEffect(() => { lifecycle.current.active = true; return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; }; }, []);
  useEffect(() => {
    lifecycle.current.sequence += 1; setPreparation(null); setAcknowledged(false);
    // An uncertain POST retains its idempotency key until the result is recovered.
    if (!pendingRequest.current) { setBusy(false); setSelected(values => values.filter(id => sources.some(doc => doc.baseline_revision_id === id))); }
  }, [settings?.version, sourceVersion]);
  useEffect(() => { onDirtyChange?.(selected.length > 0 || locked); return () => onDirtyChange?.(false); }, [selected.length, locked, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  function changeSelection(revisionId, checked) {
    lifecycle.current.sequence += 1; setPreparation(null); setAcknowledged(false); setError(null);
    setSelected(values => checked ? [...values, revisionId] : values.filter(id => id !== revisionId));
  }
  async function prepare() {
    const sequence = ++lifecycle.current.sequence;
    setBusy(true); setError(null); setAcknowledged(false);
    try {
      const response = await request(`${route}/implementation-plan-preparations`, { method: 'POST', body: { revision_ids: [...selected] } });
      if (lifecycle.current.active && sequence === lifecycle.current.sequence) setPreparation(response.preparation);
    } catch (err) { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setError(err); }
    finally { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setBusy(false); }
  }
  async function reviewSource(source, usage, reason) {
    const sequence = ++lifecycle.current.sequence;
    setBusy(true); setError(null);
    try {
      await request(`${route}/implementation-source-reviews`, { method: 'POST', body: { revision_id: source.revision_id, expected_settings_version: preparation.project.settings_version, usage, intended_project_id: usage === 'implementation' ? project.id : null, reason } });
      if (lifecycle.current.active && sequence === lifecycle.current.sequence) await prepare();
    } catch (err) { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setError(err); }
    finally { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setBusy(false); }
  }
  async function createPlan() {
    if (!pendingRequest.current && (!preparation || preparation.status !== 'ready' || !acknowledged)) return;
    setError(null); setBusy(true); setLocked(true);
    if (!pendingRequest.current) pendingRequest.current = { request_id: crypto.randomUUID(), revision_ids: [...selected], preparation_id: preparation.id, acknowledge_project_sources: true, ...(classificationId ? { classification_id: classificationId } : {}) };
    try {
      const result = await request(`${route}/implementation-plans`, { method: 'POST', body: pendingRequest.current });
      if (!lifecycle.current.active) return;
      pendingRequest.current = null; setLocked(false); setPreparation(null); setSelected([]); setAcknowledged(false);
      await onCreated(result.plan);
    } catch (err) {
      if (lifecycle.current.active) {
        setError(err);
        if (err.status >= 400 && err.status < 500 && err.status !== 408) { pendingRequest.current = null; setLocked(false); setPreparation(null); setAcknowledged(false); }
      }
    } finally { if (lifecycle.current.active) setBusy(false); }
  }
  return <section className="implementation-create"><SectionHeading title="AI 작업 계획 만들기" />
    <p>이 프로젝트의 기획·요구사항 확정본을 최대 5개 선택하세요. 프로젝트 목표·저장소·문서의 적용 대상을 확인한 후 Nora에 전달합니다.</p>
    <ProjectScopeSummary project={{ ...project, ...settings }} repository={{ url: settings?.repository_url, base_branch: settings?.base_branch, head_sha: settings?.repository_check?.head_sha }} />
    {!contextReady ? <Notice tone="warning" title="프로젝트 용도·목표·저장소를 먼저 확인해 주세요.">{onSettings ? <Button type="button" variant="ghost" icon={Settings2} onClick={onSettings}>프로젝트 설정 열기</Button> : <p>프로젝트 관리의 저장소·AI 설정에서 용도와 구현 대상을 저장하세요.</p>}</Notice> : null}
    {sources.length ? <fieldset className="baseline-choices" disabled={busy || locked || !canWrite}><legend>구현에 사용할 기획·요구사항 확정본</legend>{<List>{sources.map(doc => <ListItem key={doc.id}><ListItem.Title><label className="checkbox-label"><Input type="checkbox" checked={selected.includes(doc.baseline_revision_id)} disabled={!selected.includes(doc.baseline_revision_id) && selected.length >= 5} onChange={event => changeSelection(doc.baseline_revision_id, event.target.checked)} /><span>{doc.title}</span></label></ListItem.Title><ListItem.Meta><span>{doc.domain_name}</span><ListItem.MetaDivider /><span>확정본 {shortId(doc.baseline_revision_id)}</span></ListItem.Meta></ListItem>)}</List>}</fieldset> : <Empty compact icon={ClipboardCheck} title="이 프로젝트의 확정 문서가 필요합니다">문서·기록 보관함에 해당 프로젝트의 기획서를 등록하고 확정본을 지정해 주세요.</Empty>}
    {!locked ? <Button type="button" variant={preparation ? 'secondary' : 'primary'} icon={ShieldCheck} busy={busy} disabled={!canWrite || !contextReady || !selected.length} onClick={prepare}>{preparation ? '프로젝트·문서 다시 확인' : '프로젝트·문서 적합성 확인'}</Button> : null}
    {preparation ? <section className="implementation-preparation" aria-label="계획 생성 전 확인"><SectionHeading title="선택 문서의 적용 대상 확인" /><ProjectScopeSummary project={preparation.project} repository={preparation.repository} title="이번 요청의 프로젝트·저장소" />
      <p>아래 문서가 현재 프로젝트 목표와 저장소를 구현하기 위한 요구사항인지 확인하세요. 참고 자료나 다른 프로젝트 문서는 선택에서 제외해야 합니다.</p>
      {preparation.status === 'blocked' ? <Notice tone="warning" title="계획 생성을 보류했습니다."><p>문서의 적용 대상을 검토하거나 선택 문서를 변경해 주세요.</p></Notice> : <Notice tone="success" title="선택 문서의 적용 대상이 확인되었습니다."><p>프로젝트·저장소·문서를 최종 확인하면 계획을 요청할 수 있습니다.</p></Notice>}
      {preparation.blockers?.length ? <List className="implementation-source-blockers">{preparation.blockers.map((item, index) => <ListItem key={`${item.code}:${index}`}><ListItem.Title>{item.message}</ListItem.Title></ListItem>)}</List> : null}
      {<List>{preparation.sources.map(source => <SourceReview key={`${preparation.id}:${source.revision_id}`} source={source} project={preparation.project} canReview={canReview} busy={busy || locked} onReview={reviewSource} />)}</List>}
      {preparation.status === 'ready' ? <><label className="checkbox-label implementation-plan-ack"><Input type="checkbox" checked={acknowledged} disabled={busy || locked} onChange={event => setAcknowledged(event.target.checked)} /><span><strong>{preparation.project.name}</strong>의 목표와 <strong>{preparation.repository.url}</strong>, 위 문서가 같은 구현 대상을 가리키는지 확인했습니다.</span></label><small className="implementation-source-meta">설정·확정본·검토가 바뀌거나 확인 유효 시간이 지나면 다시 확인해야 합니다.</small></> : null}
    </section> : null}
    <ErrorNotice error={error} />
    {locked && !busy ? <p className="implementation-retry-note">응답을 확인하지 못했습니다. 같은 요청으로 처리 여부를 확인하며 중복 계획 생성을 방지합니다.</p> : null}
    {locked || preparation?.status === 'ready' ? <Button type="button" icon={Sparkles} busy={busy} disabled={!canWrite || (!locked && !acknowledged)} onClick={createPlan}>{locked ? '같은 계획 요청 다시 확인' : '확인한 문서로 AI 계획 생성'}</Button> : null}
    {!canWrite ? <p className="role-note">작업 계획 요청은 실무자 이상의 권한이 필요합니다.</p> : null}
  </section>;
}
