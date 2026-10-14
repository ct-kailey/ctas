import React, { useEffect, useRef, useState } from 'react';
import { projectKindLabel } from './project-scope.mjs';
import { useConfirm } from './confirmation.jsx';
import './record-library.css';
import { ArrowRight, CalendarDays, CheckCheck, ChevronRight, File, Files, FileUp, FolderKanban, Hash, Link, MessageSquare, PenLine, Plus, Search, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, FormField, Modal, dateTime, projectPath, shortId, Input, Textarea, Select, ControlButton, Disclosure, Tabs } from './ui.jsx';

export const DOCUMENT_CATEGORIES = { proposal: '제안서', estimate: '견적서', contract: '계약서', requirements: '요구사항', planning: '기획서', policy: '정책', meeting: '회의록', conversation: '대화 기록', other: '기타 자료' };
export const documentCategory = (doc) => doc?.document_category || ({ specification: 'requirements', conversation: 'conversation' }[doc?.record_kind]) || 'other';
export const categoryRecordKind = (category) => ['requirements', 'planning', 'policy'].includes(category) ? 'specification' : ['meeting', 'conversation'].includes(category) ? 'conversation' : 'note';

export const RECORD_KINDS = { specification: '기획·요구사항', conversation: '대화 기록', decision: '업무 결정', work_item: '작업 기록', note: '참고 메모' };
export const SOURCES = { file: '첨부 파일', editor: '직접 작성', slack: 'Slack', azure_devops: 'Azure DevOps', teams: 'Microsoft Teams', kakaotalk: '카카오톡', discord: 'Discord', email: '이메일', meeting: '회의', other: '기타' };
const EMPTY_HISTORY = { source_type: 'editor', occurred_on: '', decided_on: '', source_created_at: '', channel: '', url: '', external_id: '', participants: [], tags: [] };
const listValue = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
const dateOnly = (value) => value ? String(value).slice(0, 10) : '';
const localCalendarDate = (value) => { const date = new Date(value); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); };
const safeSourceUrl = (value) => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };

export function DomainModal({ project, request, onClose, onCreated }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { const result = await request(`${projectPath(project.id)}/domains`, { method: 'POST', body: { name: form.get('name').trim(), description: form.get('description').trim() } }); await onCreated(result.domain); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Modal title="업무 영역 추가" eyebrow="BUSINESS DOMAIN" busy={busy} onClose={onClose}><form onSubmit={submit}><div className="modal-body"><p className="form-intro">회원, 정산, 검사 운영처럼 업무 맥락을 나눕니다. 같은 영역 안에서도 기획서와 회의 기록은 각각 별도의 문서로 관리할 수 있습니다.</p><FormField label="업무 영역 이름"><Input name="name" autoFocus required maxLength={120} placeholder="예: 회원·인증" /></FormField><FormField label="영역 설명" hint="포함하는 기능과 업무 범위를 적으면 등록 위치를 추천할 때 도움이 됩니다."><Textarea name="description" maxLength={2000} rows={4} placeholder="예: 회원 가입, 로그인, 계정 권한과 접근 정책" /></FormField><ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button type="submit" busy={busy} icon={Plus}>업무 영역 추가</Button></footer></form></Modal>;
}

function InlineText({ text }) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}
export function TextPreview({ text }) {
  if (!text.trim()) return <p className="editor-placeholder">작성한 내용이 이곳에 표시됩니다.</p>;
  const nodes = [], lines = text.split('\n');
  let code = null;
  lines.forEach((line, index) => {
    if (line.startsWith('```')) { if (code) { nodes.push(<pre key={index}>{code.join('\n')}</pre>); code = null; } else code = []; return; }
    if (code) { code.push(line); return; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/), bullet = line.match(/^\s*[-*]\s+(.+)$/), quote = line.match(/^>\s?(.*)$/);
    if (heading) { const Heading = `h${heading[1].length + 1}`; nodes.push(<Heading key={index}><InlineText text={heading[2]} /></Heading>); }
    else if (bullet) nodes.push(<div className="preview-bullet" key={index}><span>•</span><p><InlineText text={bullet[1]} /></p></div>);
    else if (quote) nodes.push(<blockquote key={index}><InlineText text={quote[1]} /></blockquote>);
    else nodes.push(line ? <p key={index}><InlineText text={line} /></p> : <div className="preview-space" key={index} />);
  });
  if (code) nodes.push(<pre key="unclosed-code">{code.join('\n')}</pre>);
  return <div className="text-preview">{nodes}</div>;
}

export function UploadModal({ project, doc, documents = [], domains = [], initialRevision, request, onClose, onDone }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [file, setFile] = useState(null), [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState(initialRevision ? 'editor' : 'file'), [documentId, setDocumentId] = useState(doc?.id || '');
  const [domainId, setDomainId] = useState(doc?.domain_id || domains.find((item) => item.is_default)?.id || domains[0]?.id || '');
  const [category, setCategory] = useState(doc ? documentCategory(doc) : 'requirements'), [title, setTitle] = useState(doc?.title || ''), [text, setText] = useState(initialRevision?.source_text || '');
  const [history, setHistory] = useState({ ...EMPTY_HISTORY, ...initialRevision?.history, source_type: initialRevision ? (initialRevision.history?.source_type === 'file' ? 'editor' : initialRevision.history?.source_type || 'editor') : 'file' });
  const [recommendAcrossDomains, setRecommendAcrossDomains] = useState(!doc);
  const [preview, setPreview] = useState(false), [suggesting, setSuggesting] = useState(false), [recommendation, setRecommendation] = useState(null), [suggestionError, setSuggestionError] = useState(null);
  const editor = useRef(null), suggestionRequest = useRef({ sequence: 0, controller: null });
  const initial = useRef({ title, text, category, history: JSON.stringify(history), domainId, documentId });
  const selectedDocument = documents.find((item) => item.id === documentId);
  const recordKind = selectedDocument?.record_kind || categoryRecordKind(category);
  const locked = busy || suggesting;
  const dirty = Boolean(file) || text !== initial.current.text || title !== initial.current.title || category !== initial.current.category || JSON.stringify(history) !== initial.current.history || domainId !== initial.current.domainId || documentId !== initial.current.documentId;
  useEffect(() => () => { suggestionRequest.current.sequence += 1; suggestionRequest.current.controller?.abort(); }, []);
  useEffect(() => { if (!dirty) return; const warn = (event) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  async function close() { if (!busy && (!dirty || await confirm('등록하지 않은 내용을 닫을까요? 작성한 내용과 선택한 파일은 저장되지 않습니다.'))) { clearSuggestion(); onClose(); } }
  function clearSuggestion() { suggestionRequest.current.sequence += 1; suggestionRequest.current.controller?.abort(); setSuggesting(false); setRecommendation(null); setSuggestionError(null); }
  function updateHistory(key, value) { setHistory((current) => ({ ...current, [key]: value })); }
  function changeMode(next) { clearSuggestion(); setMode(next); setError(null); updateHistory('source_type', next === 'file' ? 'file' : 'editor'); }
  function changeDomain(next) { clearSuggestion(); setDomainId(next); setDocumentId(''); }
  function changeDocument(next) { clearSuggestion(); setDocumentId(next); const target = documents.find((item) => item.id === next); if (target) { setDomainId(target.domain_id); setCategory(documentCategory(target)); } }
  function selectFile(next) {
    if (!next) return; clearSuggestion(); setError(null);
    if (next.size > 20 * 1024 * 1024) { setError(new Error('파일은 20 MB 이하로 등록해 주세요.')); return; }
    if (!/\.(pdf|docx|pptx|xlsx|txt|md)$/i.test(next.name)) { setError(new Error('PDF, DOCX, PPTX, XLSX, TXT, MD 파일을 선택해 주세요.')); return; }
    setFile(next);
  }
  function insertText(before, after = '') {
    const input = editor.current; if (!input) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const next = text.slice(0, start) + before + text.slice(start, end) + after + text.slice(end);
    if (next.length > 200000) return;
    clearSuggestion(); setText(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, end + before.length); });
  }
  async function suggest() {
    suggestionRequest.current.controller?.abort(); const controller = new AbortController(), sequence = ++suggestionRequest.current.sequence;
    suggestionRequest.current.controller = controller; setSuggesting(true); setRecommendation(null); setSuggestionError(null);
    try {
      const result = await request(`${projectPath(project.id)}/registration-suggestions`, { method: 'POST', signal: controller.signal, body: { title: selectedDocument?.title || title.trim() || file?.name || '', text: mode === 'editor' ? text.slice(0, 20000) : '', ...(mode === 'file' && file ? { filename: file.name } : {}), record_kind: recordKind, document_category: category, ...(!recommendAcrossDomains && domainId ? { domain_id: domainId } : {}) } });
      if (sequence === suggestionRequest.current.sequence) setRecommendation(result);
    } catch (err) { if (sequence === suggestionRequest.current.sequence && err.name !== 'AbortError') setSuggestionError(err); }
    finally { if (sequence === suggestionRequest.current.sequence) setSuggesting(false); }
  }
  function applySuggestion() {
    const next = recommendation?.suggestion; if (!next) return;
    const target = documents.find((item) => item.id === next.document_id);
    if (next.action === 'new_revision' && !target) { setSuggestionError(new Error('추천된 문서를 찾을 수 없습니다. 목록을 새로 불러온 후 다시 확인해 주세요.')); return; }
    setDomainId(target?.domain_id || next.domain_id || domainId); setDocumentId(target?.id || ''); if (target) setCategory(documentCategory(target)); setRecommendation({ ...recommendation, applied: true });
  }
  async function submit(event) {
    event.preventDefault();
    if (mode === 'file' && !file) { setError(new Error('등록할 파일을 선택해 주세요.')); return; }
    if (mode === 'editor' && !text.trim()) { setError(new Error('등록할 내용을 작성해 주세요.')); return; }
    if (mode === 'editor' && new TextEncoder().encode(text).byteLength > 200000) { setError(new Error('텍스트는 UTF-8 기준 200 KB 이하로 등록해 주세요. 긴 기록은 파일로 첨부할 수 있습니다.')); return; }
    if (!domainId) { setError(new Error('추가 정보에서 업무 영역을 선택해 주세요.')); return; }
    const recordTitle = selectedDocument?.title || title.trim() || file?.name;
    const recordHistory = { ...history, participants: listValue(history.participants.join(',')), tags: listValue(history.tags.join(',')), occurred_on: history.occurred_on || null, decided_on: history.decided_on || null, source_created_at: history.source_created_at?.trim() || null, channel: history.channel?.trim() || null, url: history.url?.trim() || null, external_id: history.external_id?.trim() || null };
    const common = { title: recordTitle, domain_id: selectedDocument?.domain_id || domainId, record_kind: recordKind, document_category: selectedDocument ? documentCategory(selectedDocument) : category, history: recordHistory, ...(documentId ? { document_id: documentId } : {}) };
    setBusy(true); setError(null);
    try {
      let saved;
      if (mode === 'file') { const data = new FormData(); data.set('file', file); Object.entries(common).forEach(([key, value]) => data.set(key, key === 'history' ? JSON.stringify(value) : value)); saved = await request(`${projectPath(project.id)}/documents`, { method: 'POST', body: data }); }
      else saved = await request(`${projectPath(project.id)}/records`, { method: 'POST', body: { ...common, text } });
      await onDone({ ...saved, title: recordTitle, domain_id: common.domain_id, record_kind: common.record_kind, document_category: common.document_category });
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  const suggestion = recommendation?.suggestion;
  return <Modal title={doc ? '새 버전 등록' : '자료 등록'} wide busy={busy} onClose={close}><form onSubmit={submit}>
    <div className="modal-body unified-capture">
      <div className="unified-capture-project"><strong>{project.name}</strong><Badge tone="quiet">{projectKindLabel(project)}</Badge></div>
      <p className="form-intro">파일을 첨부하거나 내용을 작성하세요. Nora 분석이 끝나면 ‘요구사항·결정’에서 원문과 함께 검토합니다.</p>
      <Tabs value={mode} onValueChange={changeMode} variant="underline" size="sm" data-ctds="tabs"><Tabs.List aria-label="등록 방식"><Tabs.Trigger value="file" disabled={locked} leadingIcon={<FileUp />}>파일 첨부</Tabs.Trigger><Tabs.Trigger value="editor" disabled={locked} leadingIcon={<PenLine />}>직접 작성</Tabs.Trigger></Tabs.List></Tabs>
      <fieldset className="capture-fields unified-capture-fields" disabled={locked}><legend className="sr-only">자료 내용과 분류</legend>
        <div className="unified-capture-primary"><FormField label="분류"><Select value={category} disabled={Boolean(documentId) || locked} onChange={(event) => { clearSuggestion(); setCategory(event.target.value); }}>{Object.entries(DOCUMENT_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></FormField>
        {!documentId ? <FormField label="제목" hint={mode === 'file' ? '비워 두면 파일 이름을 사용합니다.' : undefined}><Input value={title} onChange={(event) => { clearSuggestion(); setTitle(event.target.value); }} required={mode === 'editor'} maxLength={200} placeholder="자료 제목" /></FormField> : <FormField label="문서"><Input value={selectedDocument?.title || ''} readOnly /></FormField>}</div>
        {documents.length ? <FormField label="등록할 버전"><Select value={documentId} onChange={(event) => changeDocument(event.target.value)}><option value="">새 자료로 등록</option>{documents.filter((item) => item.id === documentId || documentCategory(item) === category).map((item) => <option key={item.id} value={item.id}>{item.title} · 새 버전</option>)}</Select></FormField> : null}
        {documentId ? <p className="capture-hint">기존 버전과 확정 이력을 보존하고 새 버전을 추가합니다.</p> : null}
        {mode === 'file' ? <div className={`upload-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!locked) selectFile(event.dataTransfer.files[0]); }}><Input type="file" id="document-file" accept=".pdf,.docx,.pptx,.xlsx,.txt,.md" onChange={(event) => selectFile(event.target.files[0])} className="file-input" /><label htmlFor="document-file"><span className="upload-icon">{file ? <File size={26} strokeWidth={1.5} /> : <FileUp size={28} strokeWidth={1.5} />}</span><strong>{file ? file.name : '파일을 끌어 놓거나 선택하세요'}</strong><span>{file ? `${(file.size / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} KB · 다른 파일 선택` : 'PDF, DOCX, PPTX, XLSX, TXT, MD · 최대 20 MB'}</span></label></div> : <div className="record-editor"><div className="editor-heading"><label htmlFor="record-text">본문</label><Button type="button" variant="ghost" disabled={locked} onClick={() => setPreview(!preview)}>{preview ? '계속 작성' : '미리보기'}</Button></div>{!preview ? <><div className="editor-toolbar" role="group" aria-label="Markdown 서식"><ControlButton type="button" onClick={() => insertText('## ')} aria-label="제목 삽입">제목</ControlButton><ControlButton type="button" onClick={() => insertText('**', '**')} aria-label="굵게 표시">굵게</ControlButton><ControlButton type="button" onClick={() => insertText('- ')} aria-label="목록 삽입">목록</ControlButton><ControlButton type="button" onClick={() => insertText('> ')} aria-label="인용 삽입">인용</ControlButton></div><Textarea ref={editor} id="record-text" value={text} onChange={(event) => { clearSuggestion(); setText(event.target.value); }} rows={12} maxLength={200000} required={!preview} placeholder="문서 내용을 작성하거나 대화·회의록을 붙여 넣으세요." /></> : <div className="editor-preview" aria-label="본문 미리보기"><TextPreview text={text} /></div>}<div className="editor-footnote"><span>입력한 원문을 그대로 보존합니다.</span><span>{(new TextEncoder().encode(text).byteLength / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} / 200 KB</span></div></div>}
        <Disclosure className="unified-capture-extra" open={Boolean(initialRevision) || !domainId}><summary>추가 정보 · 업무 영역, 날짜, 출처</summary><div className="unified-capture-details">
          <div className="form-columns"><FormField label="업무 영역"><Select value={domainId} onChange={(event) => changeDomain(event.target.value)} required disabled={Boolean(documentId) || locked}><option value="" disabled>업무 영역 선택</option>{domains.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></FormField><FormField label="출처"><Select value={history.source_type} onChange={(event) => updateHistory('source_type', event.target.value)}>{Object.entries(SOURCES).filter(([key]) => mode === 'file' || key !== 'file').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></FormField></div>
          <div className="form-columns"><FormField label="발생·대화일"><Input type="date" value={history.occurred_on || ''} onChange={(event) => updateHistory('occurred_on', event.target.value)} /></FormField><FormField label="업무 결정일" hint="날짜 기록이며 요구사항 확정과는 별개입니다."><Input type="date" value={history.decided_on || ''} onChange={(event) => updateHistory('decided_on', event.target.value)} /></FormField></div>
          <div className="form-columns"><FormField label="대화 채널·장소"><Input value={history.channel || ''} onChange={(event) => updateHistory('channel', event.target.value)} maxLength={200} placeholder="#개발 · 고객 회의실" /></FormField><FormField label="출처 링크"><Input type="url" value={history.url || ''} onChange={(event) => updateHistory('url', event.target.value)} maxLength={2000} placeholder="https://…" /></FormField></div>
          <div className="form-columns"><FormField label="참여자" hint="쉼표로 구분해 주세요."><Input value={history.participants.join(', ')} onChange={(event) => updateHistory('participants', event.target.value.split(',').map((item) => item.trimStart()))} onBlur={() => updateHistory('participants', listValue(history.participants.join(',')))} maxLength={3000} /></FormField><FormField label="태그" hint="쉼표로 구분해 주세요."><Input value={history.tags.join(', ')} onChange={(event) => updateHistory('tags', event.target.value.split(',').map((item) => item.trimStart()))} onBlur={() => updateHistory('tags', listValue(history.tags.join(',')))} maxLength={1000} /></FormField></div>
          <div className="form-columns"><FormField label="외부 기록 ID"><Input value={history.external_id || ''} onChange={(event) => updateHistory('external_id', event.target.value)} maxLength={300} placeholder="예: DEVOPS-1234" /></FormField><FormField label="원본 생성 시각" hint="등록일은 자동으로 저장됩니다."><Input value={history.source_created_at || ''} onChange={(event) => updateHistory('source_created_at', event.target.value)} maxLength={50} placeholder="2026-10-14T14:30:00+09:00" /></FormField></div>
        </div></Disclosure>
        <Disclosure className="unified-capture-extra"><summary>Nora로 등록 위치 찾기</summary><div className="unified-capture-details"><p className="capture-hint">{mode === 'file' ? '파일명과 제목으로 업무 영역과 버전 관계를 추천합니다. 본문은 등록 후 분석합니다.' : '본문 앞 20,000자와 제목으로 업무 영역과 버전 관계를 추천합니다.'}</p><label className="checkbox-label"><Input type="checkbox" checked={recommendAcrossDomains} onChange={(event) => { clearSuggestion(); setRecommendAcrossDomains(event.target.checked); }} /><span>전체 업무 영역에서 찾기</span></label><Button type="button" variant="secondary" icon={Sparkles} disabled={locked || !(title.trim() || text.trim() || file || selectedDocument)} busy={suggesting} onClick={suggest}>등록 위치 추천</Button></div></Disclosure>
      </fieldset>
      <ErrorNotice error={suggestionError} />{suggestion ? <section className="suggestion-result" aria-label="Nora 추천 결과"><div className="suggestion-result-heading"><Sparkles size={18} /><strong>{recommendation.applied ? '추천을 적용했습니다.' : '추천 등록 위치'}</strong></div><p className="suggestion-destination">{domains.find((item) => item.id === suggestion.domain_id)?.name || '선택한 업무 영역'}<ChevronRight size={14} />{suggestion.action === 'new_revision' ? `${documents.find((item) => item.id === suggestion.document_id)?.title || '기존 문서'} · 새 버전` : '새 자료'}</p><p>{suggestion.reason}</p>{recommendation.limitations?.length ? <ul>{recommendation.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul> : null}{!recommendation.applied ? <Button type="button" variant="secondary" icon={CheckCheck} onClick={applySuggestion} disabled={busy}>추천 적용</Button> : null}</section> : null}<ErrorNotice error={error} />
    </div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={close} disabled={busy}>취소</Button><Button type="submit" busy={busy} disabled={suggesting || (mode === 'file' ? !file : !text.trim())} icon={Upload}>등록하고 분석 시작</Button></footer>
  </form></Modal>;
}

export function HistoryDetails({ history = {}, createdAt }) {
  const sourceUrl = safeSourceUrl(history.url);
  return <section className="history-details" aria-label="기록의 맥락"><h3>기록의 맥락</h3><dl><div><dt>출처</dt><dd>{SOURCES[history.source_type] || '첨부 파일'}</dd></div><div><dt>등록일</dt><dd>{createdAt ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(createdAt)) : '—'}</dd></div><div><dt>발생·대화일</dt><dd>{dateOnly(history.occurred_on) || '미입력'}</dd></div><div><dt>업무 결정일</dt><dd>{dateOnly(history.decided_on) || '미입력'}</dd></div>{history.channel ? <div><dt>채널·장소</dt><dd>{history.channel}</dd></div> : null}{history.source_created_at ? <div><dt>원본 생성 시각</dt><dd>{history.source_created_at}</dd></div> : null}{history.external_id ? <div><dt>외부 기록 ID</dt><dd>{history.external_id}</dd></div> : null}{history.participants?.length ? <div><dt>참여자</dt><dd>{history.participants.join(', ')}</dd></div> : null}{history.tags?.length ? <div><dt>태그</dt><dd>{history.tags.map((tag, index) => <span className="record-tag" key={`${tag}:${index}`}>{tag}</span>)}</dd></div> : null}{history.url ? <div className="history-source"><dt>출처 링크</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer"><Link size={13} />{history.url}</a> : history.url}</dd></div> : null}</dl>{history.decided_on ? <p>업무 결정일은 기록의 속성입니다. 이 버전의 검토 승인·확정본 지정 이력과 별도로 관리합니다.</p> : null}</section>;
}

export function DocumentList({ documents, onRevision, onUpload, canWrite, compact = false }) {
  if (!documents.length) return <Empty icon={Files} title="아직 등록된 문서·기록이 없습니다" compact={compact}>파일을 첨부하거나 에디터에서 직접 작성해 보세요.<br />대화와 작업 기록도 업무 영역별로 보관할 수 있습니다.</Empty>;
  return <div className="document-list">{documents.map((doc) => <article className="document-card" key={doc.id}><header><div className="file-symbol">{doc.record_kind === 'conversation' ? <MessageSquare size={20} strokeWidth={1.5} /> : <Files size={20} strokeWidth={1.5} />}</div><div><div className="document-context"><span>{doc.domain_name || '기본 업무 영역'}</span><span>{RECORD_KINDS[doc.record_kind] || RECORD_KINDS.specification}</span></div><h3>{doc.title}</h3><span>{doc.revisions?.length || 0}개 버전 · {doc.baseline_revision_id ? '확정본 설정됨' : '확정본 미설정'}</span></div>{canWrite ? <ControlButton className="icon-button" aria-label={`${doc.title} 새 버전 등록`} title="새 버전 등록" onClick={() => onUpload(doc)}><Plus size={18} /></ControlButton> : null}</header><div className="revision-list">{(compact ? (doc.revisions || []).slice(0, 1) : doc.revisions || []).map((revision) => <ControlButton key={revision.id} className="revision-row" onClick={() => onRevision(revision, doc)}><div><span className="revision-id">{shortId(revision.id)}</span><strong>{revision.filename}</strong>{doc.baseline_revision_id === revision.id ? <span className="baseline-tag"><CheckCheck size={12} />확정본</span> : null}</div><div><span className="revision-source">{SOURCES[revision.history?.source_type] || '첨부 파일'}</span>{revision.history?.decided_on ? <span className="revision-history-date">결정 {dateOnly(revision.history.decided_on)}</span> : revision.history?.occurred_on ? <span className="revision-history-date">발생 {dateOnly(revision.history.occurred_on)}</span> : null}<Badge status={revision.status} /><time title="등록일">{dateTime(revision.created_at)}</time><ChevronRight size={14} /></div></ControlButton>)}</div></article>)}</div>;
}

export function DocumentLibrary({ project, projectId, documents, domains, canWrite, canReview, onDomainCreate, onRevision, onUpload }) {
  const [domainId, setDomainId] = useState(''), [kind, setKind] = useState(''), [search, setSearch] = useState(''), [view, setView] = useState('documents'), [dateBy, setDateBy] = useState('occurred_on');
  useEffect(() => { setDomainId(''); setKind(''); setSearch(''); }, [projectId]);
  const query = search.trim().toLocaleLowerCase('ko-KR');
  const filtered = documents.filter((doc) => (!domainId || doc.domain_id === domainId) && (!kind || doc.record_kind === kind) && (!query || [doc.title, doc.domain_name, ...(doc.revisions || []).flatMap((revision) => [revision.filename, revision.history?.channel, revision.history?.external_id, revision.history?.url, ...(revision.history?.tags || []), ...(revision.history?.participants || [])])].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR').includes(query)));
  const timeline = filtered.flatMap((doc) => (doc.revisions || []).map((revision) => ({ doc, revision, date: dateBy === 'created_at' ? localCalendarDate(revision.created_at) : dateOnly(revision.history?.[dateBy]) }))).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.revision.created_at.localeCompare(a.revision.created_at));
  return <section className="document-library"><div className="domain-library-header"><div><h2>{project?.name || '프로젝트'} 문서·기록</h2><p>{projectKindLabel(project)} · 이 프로젝트에 등록된 문서만 표시합니다. 다른 프로젝트 문서는 프로젝트를 전환해 등록하세요.</p></div>{canReview ? <Button variant="secondary" icon={Plus} onClick={onDomainCreate}>업무 영역 추가</Button> : null}</div><Tabs value={domainId || 'all'} onValueChange={(value) => setDomainId(value === 'all' ? '' : value)} variant="underline" size="sm" data-ctds="tabs"><Tabs.List aria-label="업무 영역 필터"><Tabs.Trigger value="all">전체 영역<Badge tone="quiet">{String(documents.length)}</Badge></Tabs.Trigger>{domains.map((domain) => <Tabs.Trigger key={domain.id} value={domain.id} title={domain.description || domain.name}>{domain.name}<Badge tone="quiet">{String(documents.filter((doc) => doc.domain_id === domain.id).length)}</Badge></Tabs.Trigger>)}</Tabs.List></Tabs><div className="library-tools"><label className="library-search"><Search size={16} /><Input aria-label="기록 검색" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목, 채널, 참여자, 태그 검색" /></label><Select aria-label="기록 유형 필터" value={kind} onChange={(event) => setKind(event.target.value)}><option value="">모든 기록 유형</option>{Object.entries(RECORD_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select><Tabs value={view} onValueChange={setView} variant="text" size="sm" data-ctds="tabs"><Tabs.List aria-label="보관함 보기"><Tabs.Trigger value="documents" leadingIcon={<Files />}>문서별</Tabs.Trigger><Tabs.Trigger value="timeline" leadingIcon={<CalendarDays />}>날짜별</Tabs.Trigger></Tabs.List></Tabs></div>{view === 'documents' ? filtered.length === 0 && documents.length > 0 ? <Empty icon={Search} title="조건에 맞는 기록이 없습니다">검색어나 업무 영역, 기록 유형을 바꿔 보세요.</Empty> : <DocumentList documents={filtered} canWrite={canWrite} onUpload={onUpload} onRevision={onRevision} /> : <><div className="timeline-controls"><span>{timeline.length}개 버전 · 날짜가 없는 기록은 아래에 표시됩니다.</span><label>정렬 기준<Select value={dateBy} onChange={(event) => setDateBy(event.target.value)}><option value="occurred_on">발생·대화일</option><option value="decided_on">업무 결정일</option><option value="created_at">등록일</option></Select></label></div>{timeline.length ? <ol className="record-timeline">{timeline.map(({ doc, revision, date }, index) => <li key={revision.id}>{index === 0 || timeline[index - 1].date !== date ? <div className="timeline-date"><CalendarDays size={15} /><time>{date || '날짜 미입력'}</time></div> : null}<ControlButton className="timeline-record" onClick={() => onRevision(revision, doc)}><div><span className="timeline-source">{SOURCES[revision.history?.source_type] || '첨부 파일'}{revision.history?.channel ? ` · ${revision.history.channel}` : ''}</span><strong>{doc.title}</strong><p>{doc.domain_name} · {RECORD_KINDS[doc.record_kind] || RECORD_KINDS.specification} · 등록 {dateTime(revision.created_at)}</p>{revision.history?.tags?.length ? <div>{revision.history.tags.map((tag, tagIndex) => <span className="record-tag" key={`${tag}:${tagIndex}`}>{tag}</span>)}</div> : null}</div><Badge status={revision.status} /><ChevronRight size={16} /></ControlButton></li>)}</ol> : <Empty icon={CalendarDays} title="조건에 맞는 기록이 없습니다">검색어나 업무 영역을 바꿔 보세요.</Empty>}</>}</section>;
}
