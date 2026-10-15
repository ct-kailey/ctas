import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, FileText, Files, FolderPlus, Plus, Search } from 'lucide-react';
import { Badge, Button, Disclosure, Empty, ErrorNotice, Input, Modal, Select, Spinner, dateTime, projectPath } from './ui.jsx';
import { ListItem, ListItemLeadingIcon } from './components/ctds/ListItem';
import { DOCUMENT_CATEGORIES, SOURCES, documentCategory } from './records.jsx';
import { CommercialContentPreview } from './commercial.jsx';
import './record-library.css';

const timestamp = (doc) => doc.updated_at || doc.latest_revision?.created_at || doc.revisions?.[0]?.created_at || doc.created_at || '';
const revisionStatus = (revision, doc) => doc.baseline_revision_id === revision?.id ? ['green', '확정본'] : revision?.status === 'ready' ? ['quiet', '원문 추출 완료'] : ['failed', 'uncertain', 'rejected'].includes(revision?.status) ? ['red', '처리 확인 필요'] : ['quiet', '원문 처리 중'];

export function UnifiedRecordLibrary({ project, documents = [], domains = [], request, canWrite, canReview, onUpload, onReviewRevision, onReviewCommercial, onDomainCreate, onOpenCommercial, onOpenTool }) {
  const [category, setCategory] = useState(''), [domainId, setDomainId] = useState(''), [query, setQuery] = useState('');
  const [commercial, setCommercial] = useState(null), [error, setError] = useState(null), [reading, setReading] = useState(null);
  const sequence = useRef(0);
  const load = useCallback(async (signal) => {
    const seq = ++sequence.current;
    try {
      const result = await request(`${projectPath(project.id)}/commercial`, { signal });
      if (seq === sequence.current) { setCommercial(result.documents || []); setError(null); }
    } catch (err) { if (seq === sequence.current && err.name !== 'AbortError') setError(err); }
  }, [project.id, request]);
  useEffect(() => { setCategory(''); setDomainId(''); setQuery(''); setCommercial(null); setError(null); setReading(null); const controller = new AbortController(); load(controller.signal); return () => { sequence.current++; controller.abort(); }; }, [load]);
  const all = [...documents.map((doc) => ({ ...doc, category: documentCategory(doc), source: 'record' })), ...(commercial || []).map((doc) => ({ ...doc, category: doc.kind, source: 'commercial' }))].sort((a, b) => timestamp(b).localeCompare(timestamp(a)));
  const search = query.trim().toLocaleLowerCase('ko-KR');
  const filtered = all.filter((doc) => (!category || doc.category === category) && (!domainId || (domainId === 'commercial' ? doc.source === 'commercial' : doc.domain_id === domainId)) && (!search || [doc.title, doc.domain_name, DOCUMENT_CATEGORIES[doc.category], ...(doc.revisions || []).flatMap((revision) => [revision.filename, revision.history?.channel, ...(revision.history?.tags || []), ...(revision.history?.participants || [])])].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR').includes(search)));
  return <section className="unified-record-library" aria-label="문서·기록 보관함">
    <div className="unified-library-filters"><Input aria-label="자료 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 채널, 참여자 검색" /><Select aria-label="자료 분류 필터" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">모든 분류</option>{Object.entries(DOCUMENT_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select>{domains.length > 1 ? <Select aria-label="업무 영역 필터" value={domainId} onChange={(event) => setDomainId(event.target.value)}><option value="">모든 업무 영역</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}{commercial?.length ? <option value="commercial">사내 양식 문서</option> : null}</Select> : null}</div>
    <ErrorNotice error={error} onRetry={() => load()} />
    {commercial === null && !error ? <Spinner label="등록된 자료를 불러오고 있습니다." /> : <>
      <p className="unified-library-count">{filtered.length}개 자료{search || category || domainId ? ` · 전체 ${all.length}개` : ''}</p>
      {filtered.length ? <ul className="unified-record-list">{filtered.map((doc) => {
        const legacy = doc.source === 'commercial';
        const latest = legacy ? doc.latest_revision : doc.revisions?.[0];
        const [tone, state] = legacy ? [latest?.approved ? 'green' : 'quiet', latest?.approved ? '내부 승인됨' : '문서 초안'] : revisionStatus(latest, doc);
        return <li key={`${doc.source}:${doc.id}`}>
          <ListItem layout="stacked" variant="system" data-ctds="list-item" leading={<ListItemLeadingIcon size="md"><FileText size={18} /></ListItemLeadingIcon>} from={doc.title} body={<span className="unified-record-meta">{DOCUMENT_CATEGORIES[doc.category] || '기타 자료'} · {legacy ? '사내 양식 문서' : doc.domain_name || '기본 업무 영역'} · {latest?.created_at ? dateTime(latest.created_at) : '등록일 미확인'}{!legacy ? ` · ${doc.revisions?.length || 0}개 버전` : ` · v${latest?.sequence || 1}`}</span>} trailing={<div className="unified-record-actions"><Badge tone={tone}>{state}</Badge><Button type="button" variant="secondary" disabled={!latest} onClick={() => legacy ? setReading(doc.id) : onReviewRevision(latest.id)}>{legacy ? '문서 보기' : '검토하기'}<ArrowRight size={14} /></Button>{!legacy && canWrite ? <Button type="button" variant="ghost" icon={Plus} onClick={() => onUpload(doc)} aria-label={`${doc.title} 새 버전 등록`}>새 버전</Button> : null}</div>} />
          {!legacy && doc.revisions?.length > 1 ? <Disclosure className="unified-record-versions"><summary>이전 버전 {doc.revisions.length - 1}개</summary><ul>{doc.revisions.slice(1).map((revision) => <li key={revision.id}><ListItem layout="stacked" data-ctds="list-item" from={revision.filename} body={`${SOURCES[revision.history?.source_type] || '첨부 파일'} · ${dateTime(revision.created_at)}`} trailing={<><Badge tone={revisionStatus(revision, doc)[0]}>{revisionStatus(revision, doc)[1]}</Badge><Button type="button" variant="ghost" onClick={() => onReviewRevision(revision.id)}>이 버전 검토</Button></>} /></li>)}</ul></Disclosure> : null}
        </li>;
      })}</ul> : <Empty icon={search || category || domainId ? Search : Files} title={all.length ? '조건에 맞는 자료가 없습니다.' : '프로젝트 자료를 등록하세요.'} action={!all.length && canWrite ? <Button type="button" onClick={() => onUpload()}>자료 등록</Button> : null}>{all.length ? '검색어나 분류를 바꿔 보세요.' : '파일을 첨부하거나 내용을 직접 작성하세요.'}</Empty>}
    </>}
    {onOpenTool || onOpenCommercial || (canReview && onDomainCreate) ? <Disclosure className="unified-library-tools"><summary>자료 수집·관리 도구</summary><div className="unified-library-tool-actions">{onOpenTool ? <><Button type="button" variant="secondary" onClick={() => onOpenTool('channels')}>수집한 대화</Button><Button type="button" variant="secondary" onClick={() => onOpenTool('transcriptions')}>회의 녹음·전사</Button>{canWrite ? <Button type="button" variant="secondary" onClick={() => onOpenTool('integrations')}>외부 도구 연결</Button> : null}</> : null}{onOpenCommercial ? <Button type="button" variant="secondary" onClick={() => onOpenCommercial()}>사내 양식·계약 관리</Button> : null}{canReview && onDomainCreate ? <Button type="button" variant="ghost" icon={FolderPlus} onClick={onDomainCreate}>업무 영역 추가</Button> : null}</div></Disclosure> : null}
    {reading ? <CommercialRecordReader key={`${project.id}:${reading}`} project={project} documentId={reading} request={request} onClose={() => setReading(null)} onReview={onReviewCommercial} onOpenCommercial={onOpenCommercial} /> : null}
  </section>;
}

function CommercialRecordReader({ project, documentId, request, onClose, onReview, onOpenCommercial }) {
  const [doc, setDoc] = useState(null), [revisionId, setRevisionId] = useState(''), [error, setError] = useState(null);
  const sequence = useRef(0);
  const load = useCallback(async (signal) => {
    const seq = ++sequence.current;
    try { const result = await request(`${projectPath(project.id)}/commercial/documents/${documentId}`, { signal }); if (sequence.current === seq) { setDoc(result.document); setRevisionId((current) => current || result.document.latest_revision_id); setError(null); } }
    catch (err) { if (sequence.current === seq && err.name !== 'AbortError') setError(err); }
  }, [project.id, documentId, request]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => { sequence.current++; controller.abort(); }; }, [load]);
  const revision = doc?.revisions?.find((item) => item.id === revisionId) || doc?.latest_revision;
  return <Modal title={doc?.title || '문서 원문'} wide onClose={onClose}>
    <div className="modal-body unified-commercial-original"><ErrorNotice error={error} onRetry={() => load()} />{!doc && !error ? <Spinner /> : revision ? <><div className="unified-commercial-heading"><Badge tone="quiet">{DOCUMENT_CATEGORIES[doc.kind]}</Badge><Select aria-label="문서 버전 선택" value={revision.id} onChange={(event) => setRevisionId(event.target.value)}>{doc.revisions.map((item) => <option key={item.id} value={item.id}>v{item.sequence} · {dateTime(item.created_at)}{item.approved ? ' · 내부 승인됨' : ''}</option>)}</Select></div><p className="unified-record-meta">{revision.author_name || '등록자'} · {dateTime(revision.created_at)}</p>{revision.reason ? <p className="unified-commercial-reason">{revision.reason}</p> : null}<CommercialContentPreview content={revision.content} />{revision.decision ? <Disclosure className="unified-commercial-decision"><summary>이 버전의 내부 검토 기록</summary><p>{revision.decision.decision === 'approved' ? '승인' : '반려'} · {revision.decision.reason}</p>{revision.decision.decision === 'approved' && !revision.approved ? <p>프로젝트 조건이 변경되어 내부 재검토가 필요합니다.</p> : null}</Disclosure> : null}</> : null}</div>
    <footer className="modal-actions">{onOpenCommercial && doc ? <Button type="button" variant="ghost" onClick={() => { onClose(); onOpenCommercial(documentId); }}>양식 편집·계약 관리</Button> : null}<Button type="button" variant="secondary" onClick={onClose}>닫기</Button>{onReview && revision ? <Button type="button" onClick={() => { onClose(); onReview({ documentId, revisionId: revision.id }); }}>Nora 분석·검토<ArrowRight size={14} /></Button> : null}</footer>
  </Modal>;
}
