import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCheck, ChevronRight, Hash, Inbox, Link2, MessageSquare, Pause, Play, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react';
import { ChannelWorkflow } from './channel-workflow.jsx';
import { Badge, Button, Empty, ErrorNotice, FormField, Modal, SectionHeading, Spinner, dateTime, projectPath, shortId } from './ui.jsx';

const PROVIDERS = { kakaotalk: '카카오톡', discord: 'Discord', slack: 'Slack', teams: 'Microsoft Teams', other: '기타 채널' };
const KIND_LABELS = { conversation: '대화', decision: '업무 결정', work_item: '할 일', note: '메모' };
const CLASSIFICATIONS = { decision: '결정 후보', action_item: '후속 작업', requirement_change: '요구사항 변경', discussion: '논의', noise: '보관 필요성 낮음' };
const RUNNING = new Set(['queued', 'running']);
const REVIEWABLE = new Set(['needs_review', 'failed', 'uncertain']);
const COMPLETE = new Set(['accepted', 'dismissed']);
const EVENT_KINDS = { created: '작성', updated: '수정', deleted: '삭제' };
const emptyMessage = () => ({ id: crypto.randomUUID(), author: '', text: '', sent_at: '', url: '' });

function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

function preciseTime(value) {
  if (!value) return '미입력';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(parsed);
}

function InboxStatus({ item }) {
  if (item.status === 'accepted') return <Badge tone="green">기록 등록됨</Badge>;
  if (item.status === 'dismissed') return <Badge tone="quiet">보관 제외</Badge>;
  return <Badge status={item.status} />;
}

export function ChannelInbox({ project, domains, request, canWrite, canReview, onChanged, notify, onDirty, guardNavigation, initialItemId, onOpenClassification, onOpenQuestion, onOpenSource }) {
  const [sources, setSources] = useState([]), [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(null), [filter, setFilter] = useState('pending');
  const [selectedId, setSelectedId] = useState(initialItemId || null), [modal, setModal] = useState(null), [toggling, setToggling] = useState(null);
  const [detailDirty, setDetailDirty] = useState(false), [modalDirty, setModalDirty] = useState(false);
  useEffect(() => { onDirty?.(detailDirty || modalDirty); return () => onDirty?.(false); }, [detailDirty, modalDirty, onDirty]);
  function closeModal() { if (!modalDirty || window.confirm('작성한 내용을 닫을까요? 저장하지 않은 출처 입력은 사라집니다.')) { setModal(null); setModalDirty(false); } }
  const lifecycle = useRef({ active: true, sequence: 0 }), importDrafts = useRef(new Map());
  const route = projectPath(project.id);
  const navigate = action => guardNavigation ? guardNavigation(action) : action();
  useEffect(() => { if (initialItemId) setSelectedId(initialItemId); }, [initialItemId]);
  const load = useCallback(async ({ signal, quiet = false } = {}) => {
    const sequence = ++lifecycle.current.sequence;
    if (!quiet) setLoading(true);
    try {
      const [sourceResult, inboxResult] = await Promise.all([
        request(`${route}/channel-sources`, { signal }), request(`${route}/channel-inbox`, { signal }),
      ]);
      if (!lifecycle.current.active || sequence !== lifecycle.current.sequence) return;
      setSources(sourceResult.sources); setItems(inboxResult.items); setError(null);
    } catch (err) {
      if (lifecycle.current.active && sequence === lifecycle.current.sequence && err.name !== 'AbortError') setError(err);
    } finally { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setLoading(false); }
  }, [request, route]);
  useEffect(() => {
    lifecycle.current.active = true;
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; controller.abort(); };
  }, [load]);
  const hasRunning = items.some((item) => RUNNING.has(item.status));
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => { if (!document.hidden) load({ quiet: true }); }, 5000);
    return () => clearInterval(timer);
  }, [hasRunning, load]);
  async function toggle(source) {
    setToggling(source.id); setError(null);
    try {
      await request(`${route}/channel-sources/${encodeURIComponent(source.id)}`, { method: 'PATCH', body: { manual_intake_enabled: !source.manual_intake_enabled } });
      if (!lifecycle.current.active) return;
      notify(source.manual_intake_enabled ? '이 출처의 수동 가져오기를 일시 중지했습니다.' : '이 출처의 수동 가져오기를 허용했습니다.');
      await load({ quiet: true });
    } catch (err) { if (lifecycle.current.active) setError(err); }
    finally { if (lifecycle.current.active) setToggling(null); }
  }
  async function changed(message) {
    if (!lifecycle.current.active) return;
    notify(message); await Promise.all([load({ quiet: true }), onChanged({ quiet: true })]);
  }
  function openImport(source) {
    let draft = importDrafts.current.get(source.id);
    if (!draft) { draft = { conversationKey: '', messages: [emptyMessage()], payload: null, attempted: false }; importDrafts.current.set(source.id, draft); }
    setModal({ type: 'import', source, draft });
  }
  const visible = items.filter((item) => filter === 'all' || (filter === 'completed' ? COMPLETE.has(item.status) : !COMPLETE.has(item.status)));
  const pendingCount = items.filter((item) => !COMPLETE.has(item.status)).length;
  return <section className="channels-workspace">
    {selectedId ? <ChannelItem key={`${project.id}:${selectedId}`} id={selectedId} route={route} request={request} domains={domains} canReview={canReview} onBack={() => navigate(() => setSelectedId(null))} onChanged={changed} onDirty={setDetailDirty} onOpenClassification={onOpenClassification} onOpenQuestion={onOpenQuestion} onOpenSource={onOpenSource} /> : <>
      <div className="channel-stage-note"><span className="channel-stage-icon"><MessageSquare size={23} strokeWidth={1.5} /></span><div><span className="eyebrow">COLLECT · UNDERSTAND · REVIEW</span><h2>대화를 근거 있는 기록으로.</h2><p>지금은 대화를 직접 가져와 분석하고 검토합니다. 실제 채널 연결과 자동 감시는 대상·권한을 지정한 뒤 활성화합니다.</p></div><Badge tone="quiet">실제 채널 미연결</Badge></div>
      <ErrorNotice error={error} onRetry={() => load()} />
      <section className="channel-sources-panel" aria-label="수집 출처"><SectionHeading eyebrow="CHANNEL SOURCES" title="수집할 출처">{canReview ? <Button variant="secondary" icon={Plus} onClick={() => setModal({ type: 'source' })}>출처 준비</Button> : null}</SectionHeading>
        {loading && !sources.length ? <Spinner label="출처를 불러오고 있습니다" /> : sources.length ? <div className="channel-source-grid">{sources.map((source) => <article className="channel-source-card" key={source.id}><div className="channel-source-heading"><span className={`channel-provider-icon provider-${source.provider}`}><MessageSquare size={18} /></span><div><span>{PROVIDERS[source.provider] || '기타 채널'}</span><h3>{source.name}</h3></div><Badge tone="quiet">미연결</Badge></div><p className="channel-source-id"><Hash size={12} />{source.external_channel_id}</p><div className="channel-source-meta"><span>{domains.find((domain) => domain.id === source.default_domain_id)?.name || '검토 시 업무 영역 선택'}</span><span>{source.enabled && source.manual_intake_enabled ? '수동 가져오기 허용' : '수동 가져오기 중지'}</span></div><div className="channel-source-actions"><Button variant="secondary" icon={Upload} disabled={!canWrite || !source.enabled || !source.manual_intake_enabled} onClick={() => openImport(source)}>대화 가져오기</Button>{canReview ? <button className="text-button" disabled={Boolean(toggling) || !source.enabled} onClick={() => toggle(source)} aria-label={`${source.name} 수동 가져오기 ${source.manual_intake_enabled ? '중지' : '허용'}`}>{source.manual_intake_enabled ? <Pause size={13} /> : <Play size={13} />}{source.manual_intake_enabled ? '일시 중지' : '허용'}</button> : null}</div></article>)}</div> : error ? null : <Empty compact icon={MessageSquare} title="첫 대화 출처를 준비하세요">채널 이름과 식별자를 등록하면 수동으로 대화를 가져올 수 있습니다.<br />계정 로그인이나 자동 감시는 시작되지 않습니다.</Empty>}
      </section>
      <section className="channel-inbox-panel" aria-label="대화 검토함"><SectionHeading eyebrow="HUMAN REVIEW INBOX" title={`확인할 대화 ${pendingCount}건`}><button className="text-button" onClick={() => load()} disabled={loading}><RefreshCw size={13} />새로고침</button></SectionHeading><div className="filter-tabs" role="group" aria-label="수집 기록 필터">{[['pending', '검토 대기'], ['completed', '처리 완료'], ['all', '전체']].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'channel-filter-active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
        {loading && !items.length ? <Spinner label="검토함을 불러오고 있습니다" /> : visible.length ? <div className="channel-inbox-list">{visible.map((item) => <button className="channel-inbox-row" key={item.id} onClick={() => setSelectedId(item.id)}><span className="channel-inbox-symbol"><MessageSquare size={18} /></span><div className="channel-inbox-main"><div className="channel-inbox-labels"><span>{PROVIDERS[item.provider] || PROVIDERS[item.input_snapshot?.source?.provider] || '대화'}</span><span>{item.source_name || item.input_snapshot?.source?.name}</span>{item.analysis?.classification ? <span>{CLASSIFICATIONS[item.analysis.classification] || '분석 결과'}</span> : null}</div><strong>{item.analysis?.title || item.conversation_key || item.input_snapshot?.conversation_key || '수집한 대화'}</strong><p>{item.analysis?.summary || (RUNNING.has(item.status) ? '대화의 맥락과 결정 후보를 정리하고 있습니다.' : '원문과 처리 상태를 확인해 주세요.')}</p><small>수집 {dateTime(item.created_at)}{item.evidence_changed || item.provenance_changed ? <span className="channel-stale-label"><AlertTriangle size={12} />출처 변경 확인 필요</span> : null}</small></div><InboxStatus item={item} /><ChevronRight size={16} /></button>)}</div> : error ? null : <Empty compact icon={Inbox} title={filter === 'completed' ? '처리한 대화가 없습니다' : '확인할 대화가 없습니다'}>가져온 대화는 검토함에 보관됩니다.<br />검토자가 확인한 내용만 문서·기록 보관함에 등록합니다.</Empty>}
      </section>
    </>}
    {modal?.type === 'source' ? <SourceModal route={route} domains={domains} request={request} onDirty={setModalDirty} onClose={closeModal} onDone={async () => { setModal(null); await changed('출처를 준비했습니다. 대화를 직접 가져올 수 있습니다.'); }} /> : null}
    {modal?.type === 'import' ? <ImportModal key={modal.source.id} source={modal.source} draft={modal.draft} route={route} request={request} onDirty={setModalDirty} onClose={closeModal} onDone={async (inbox) => { importDrafts.current.delete(modal.source.id); setModal(null); if (inbox?.id) setSelectedId(inbox.id); await changed('대화를 검토함에 저장했습니다. 분석 후 내용을 확인해 주세요.'); }} /> : null}
  </section>;
}

function SourceModal({ route, domains, request, onClose, onDone, onDirty }) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  const [provider, setProvider] = useState('slack'), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    try {
      await request(`${route}/channel-sources`, { method: 'POST', body: {
        provider, name: form.get('name').trim(), external_channel_id: form.get('channel').trim(),
        external_workspace_id: form.get('workspace').trim() || null, default_domain_id: form.get('domain') || null,
      } });
      await onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Modal title="대화 출처 준비" eyebrow="PREPARE A SOURCE" busy={busy} onClose={onClose}><form onSubmit={submit} onChange={() => setDirty(true)}><div className="modal-body"><p className="form-intro">대상 출처만 등록합니다. 실제 계정 연결이나 자동 수집은 실행되지 않습니다.</p><FormField label="채널 서비스"><select value={provider} onChange={(event) => setProvider(event.target.value)}>{Object.entries(PROVIDERS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></FormField><FormField label="표시 이름"><input name="name" required maxLength={200} placeholder="예: 회원 서비스 의사결정" /></FormField><FormField label={provider === 'kakaotalk' ? '대화방 식별자 또는 정확한 대화방 이름' : '채널 식별자'} hint="이 출처에서 수집할 단일 대화방·채널을 구분하는 값입니다."><input name="channel" required maxLength={300} placeholder={provider === 'kakaotalk' ? '예: 회원개발 업무방' : '예: C0123456789'} /></FormField><FormField label="워크스페이스·서버 식별자 (선택)"><input name="workspace" maxLength={300} placeholder="소속 워크스페이스 또는 서버 ID" /></FormField><FormField label="기본 업무 영역"><select name="domain" defaultValue=""><option value="">검토 시 선택</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select></FormField><ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>취소</Button><Button type="submit" icon={Plus} busy={busy}>출처 준비</Button></footer></form></Modal>;
}

function ImportModal({ source, draft, route, request, onClose, onDone, onDirty }) {
  const [conversationKey, setConversationKey] = useState(draft.conversationKey), [messages, setMessages] = useState(draft.messages);
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(null), [attempted, setAttempted] = useState(draft.attempted);
  const dirty = Boolean(conversationKey || attempted || messages.some(message => message.author || message.text || message.sent_at || message.url));
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  const total = messages.reduce((count, message) => count + message.text.length, 0);
  const locked = busy || attempted;
  function updateMessages(next) { draft.messages = next; setMessages(next); }
  function updateMessage(id, field, value) { updateMessages(messages.map((message) => message.id === id ? { ...message, [field]: value } : message)); }
  async function submit(event) {
    event.preventDefault();
    if (total > 20000) { setError(new Error('한 번에 가져올 수 있는 대화는 총 20,000자까지입니다.')); return; }
    if (!draft.payload) {
      draft.payload = { batch_id: crypto.randomUUID(), conversation_key: conversationKey.trim(), messages: messages.map((message) => ({
        event_id: `manual:${message.id}`, message_id: `manual:${message.id}`, kind: 'created', author: message.author.trim(), text: message.text,
        sent_at: message.sent_at ? new Date(message.sent_at).toISOString() : null, changed_at: null, url: message.url.trim() || null,
      })) };
    }
    draft.attempted = true; setAttempted(true); setBusy(true); setError(null);
    try {
      const result = await request(`${route}/channel-sources/${encodeURIComponent(source.id)}/ingest`, { method: 'POST', body: draft.payload });
      await onDone(result.inbox);
    } catch (err) {
      setError(err);
      if (err.status >= 400 && err.status < 500 && err.status !== 408) { draft.payload = null; draft.attempted = false; setAttempted(false); }
    } finally { setBusy(false); }
  }
  return <Modal title="대화 가져오기" eyebrow={`${PROVIDERS[source.provider] || 'CHANNEL'} · MANUAL INTAKE`} wide busy={busy} onClose={onClose}><form onSubmit={submit}><div className="modal-body"><div className="channel-import-source"><MessageSquare size={17} /><strong>{source.name}</strong><Badge tone="quiet">수동 입력</Badge></div><p className="form-intro">수집할 대화만 붙여 넣어 주세요. 분석 결과는 검토함에 저장되며, 검토자가 확인하기 전에는 업무 기록으로 등록되지 않습니다.</p><fieldset className="channel-import-fields" disabled={locked}><legend className="sr-only">가져올 대화</legend><FormField label="대화 묶음·스레드 식별자" hint="같은 대화의 후속 내용을 가져올 때 같은 식별자를 사용합니다."><input value={conversationKey} onChange={(event) => { draft.conversationKey = event.target.value; setConversationKey(event.target.value); }} required maxLength={300} placeholder="예: 회원가입 인증 정책 · 2026-09-27" /></FormField><div className="channel-message-tools"><span>{messages.length}개 메시지 · {total.toLocaleString()} / 20,000자</span><button type="button" className="text-button" onClick={() => setPreview(!preview)}>{preview ? '계속 작성' : '원문 미리보기'}</button></div>{preview ? <div className="channel-paste-preview">{messages.map((message, index) => <article key={message.id}><strong>{message.author || `메시지 ${index + 1}`}</strong><small>{message.sent_at ? dateTime(new Date(message.sent_at).toISOString()) : '원본 시각 미입력'}</small><p>{message.text || '내용 미입력'}</p></article>)}</div> : messages.map((message, index) => <section className="channel-message-editor" key={message.id} aria-label={`메시지 ${index + 1}`}><header><span>메시지 {String(index + 1).padStart(2, '0')}</span>{messages.length > 1 ? <button type="button" className="icon-button" aria-label={`메시지 ${index + 1} 제거`} onClick={() => updateMessages(messages.filter((item) => item.id !== message.id))}><Trash2 size={15} /></button> : null}</header><div className="form-columns"><FormField label="작성자·참여자"><input value={message.author} onChange={(event) => updateMessage(message.id, 'author', event.target.value)} required maxLength={200} placeholder="여러 대화를 붙이면 참여자를 함께 기재" /></FormField><FormField label="원본 메시지 시각 (선택)"><input type="datetime-local" value={message.sent_at} onInput={(event) => updateMessage(message.id, 'sent_at', event.currentTarget.value)} onChange={(event) => updateMessage(message.id, 'sent_at', event.currentTarget.value)} /></FormField></div><FormField label="대화 원문"><textarea value={message.text} onChange={(event) => updateMessage(message.id, 'text', event.target.value)} required rows={5} maxLength={20000} placeholder="선택한 대화를 그대로 붙여 넣어 주세요." /></FormField><FormField label="원본 대화 링크 (선택)"><input type="url" value={message.url} onChange={(event) => updateMessage(message.id, 'url', event.target.value)} maxLength={2000} placeholder="https://…" /></FormField></section>)}{!preview ? <Button type="button" variant="secondary" icon={Plus} disabled={messages.length >= 50 || locked} onClick={() => updateMessages([...messages, emptyMessage()])}>메시지 추가</Button> : null}</fieldset>{attempted && !busy ? <div className="notice warning channel-retry-note"><AlertTriangle size={17} /><p>요청의 처리 결과를 확인하지 못했습니다. 다시 시도하면 같은 요청 식별자로 확인하여 중복 수집을 방지합니다. 이 화면에서 닫았다가 같은 출처를 열어도 이 입력을 유지합니다.</p></div> : null}<ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{attempted ? '닫고 목록 확인' : '취소'}</Button><Button type="submit" icon={Upload} busy={busy} disabled={total > 20000 || !conversationKey.trim() || messages.some((message) => !message.author.trim() || !message.text.trim())}>{attempted ? '같은 요청으로 다시 시도' : '검토함에 가져오기'}</Button></footer></form></Modal>;
}

function ChannelItem({ id, route, request, domains, canReview, onBack, onChanged, onDirty, onOpenClassification, onOpenQuestion, onOpenSource }) {
  const [item, setItem] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [dismissOpen, setDismissOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', text: '', domain_id: '', record_kind: 'conversation', decided_on: '', reason: '' });
  const [acknowledged, setAcknowledged] = useState(false), [edited, setEdited] = useState(false), [workflowDirty, setWorkflowDirty] = useState(false);
  useEffect(() => { onDirty?.(edited || workflowDirty); return () => onDirty?.(false); }, [edited, workflowDirty, onDirty]);
  const lifecycle = useRef({ active: true, sequence: 0 }), initialized = useRef(false);
  const detailRoute = `${route}/channel-inbox/${encodeURIComponent(id)}`;
  const load = useCallback(async (signal) => {
    const sequence = ++lifecycle.current.sequence;
    try {
      const result = await request(detailRoute, { signal });
      if (!lifecycle.current.active || sequence !== lifecycle.current.sequence) return;
      setItem(result.item); setError(null);
      if (result.item.evidence_changed || result.item.provenance_changed) setAcknowledged(false);
      if (!initialized.current && !RUNNING.has(result.item.status)) {
        initialized.current = true;
        setDraft({ title: result.item.analysis?.title || result.item.input_snapshot?.conversation_key || '', text: result.item.analysis?.summary || '', domain_id: result.item.default_domain_id || result.item.source?.default_domain_id || '', record_kind: result.item.analysis?.record_kind || 'conversation', decided_on: '', reason: '' });
      }
    } catch (err) { if (lifecycle.current.active && sequence === lifecycle.current.sequence && err.name !== 'AbortError') setError(err); }
  }, [detailRoute, request]);
  useEffect(() => {
    lifecycle.current.active = true; const controller = new AbortController(); load(controller.signal);
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; controller.abort(); };
  }, [load]);
  const running = RUNNING.has(item?.status);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { if (!document.hidden) load(); }, 5000);
    return () => clearInterval(timer);
  }, [running, load]);
  function update(field, value) { setEdited(true); setDraft((previous) => ({ ...previous, [field]: value })); }
  async function accept(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await request(`${detailRoute}/accept`, { method: 'POST', body: { ...draft, decided_on: draft.decided_on || null, acknowledge_evidence: acknowledged } });
      if (!lifecycle.current.active) return;
      setItem(result.item); setEdited(false); await onChanged('검토한 내용을 원문 근거와 함께 문서·기록 보관함에 등록했습니다.');
    } catch (err) { if (lifecycle.current.active) { await load(); setError(err); } }
    finally { if (lifecycle.current.active) setBusy(false); }
  }
  if (!item) return <><button className="back-link" onClick={onBack}><ArrowLeft size={16} />수집·검토함으로</button><ErrorNotice error={error} onRetry={() => load()} />{!error ? <Spinner label="대화와 근거를 불러오고 있습니다" /> : null}</>;
  const analysis = item.analysis, snapshot = item.input_snapshot || {}, messages = snapshot.messages || [];
  const stale = item.evidence_changed || item.provenance_changed, complete = COMPLETE.has(item.status);
  const reviewable = canReview && REVIEWABLE.has(item.status) && !stale;
  return <section className="channel-item-detail"><button className="back-link" onClick={onBack}><ArrowLeft size={16} />수집·검토함으로</button><ErrorNotice error={error} /><header className="channel-detail-heading"><div><span className="eyebrow">CONVERSATION TO HISTORY</span><h2>{analysis?.title || snapshot.conversation_key || '수집한 대화'}</h2><p>{PROVIDERS[item.provider || snapshot.source?.provider]} · {item.source_name || snapshot.source?.name} · 수집 {dateTime(item.created_at)}</p></div><div className="channel-detail-tools"><InboxStatus item={item} /><button type="button" className="text-button" onClick={() => load()} disabled={busy}><RefreshCw size={12} />상태 새로고침</button></div></header>
    {stale ? <div className="notice warning channel-detail-notice" role="status"><AlertTriangle size={18} /><div><strong>{item.status === 'accepted' ? '등록 이후 원본 대화·출처에 변경이 있습니다.' : '수집 당시의 근거가 변경되었습니다.'}</strong><p>{item.status === 'accepted' ? '이미 등록한 기록과 아래 수집 당시 원문은 유지됩니다. 수정·삭제된 원본을 확인해 후속 기록으로 남겨 주세요.' : '이 후보의 등록을 중지했습니다. 변경된 원본을 다시 가져와 새 후보에서 검토해 주세요.'}</p></div></div> : null}
    {running ? <div className="notice subtle channel-detail-notice" role="status"><Sparkles size={18} /><div><strong>Nora가 대화를 정리하고 있습니다.</strong><p>결정 후보와 후속 작업, 원문 근거를 확인합니다. 완료되면 이 화면에 표시됩니다.</p></div></div> : null}
    {item.status === 'needs_review' && !analysis && item.error_code === 'TRIAGE_UNAVAILABLE' ? <div className="notice subtle channel-detail-notice" role="status"><MessageSquare size={18} /><p>AI 분석을 사용할 수 없어 원문 검토로 전환했습니다. 내용을 직접 작성해 등록할 수 있습니다.</p></div> : null}
    {['failed', 'uncertain'].includes(item.status) ? <div className="notice warning channel-detail-notice"><AlertTriangle size={18} /><div><strong>AI 분석 결과를 확정하지 못했습니다.</strong><p>자동 재시도는 하지 않습니다. 원문을 직접 확인하고 기록 내용을 작성해 검토할 수 있습니다.</p>{item.error_code ? <small>{item.error_code}</small> : null}</div></div> : null}
    <div className="channel-detail-grid"><section className="channel-evidence-column"><SectionHeading eyebrow="IMMUTABLE SOURCE" title={`수집 당시 원문 ${messages.length}건`} /><p className="channel-evidence-context">{snapshot.source?.external_channel_id || '채널 식별자 없음'} · {snapshot.conversation_key}<br />아래 원문은 요약의 근거이며 등록 시 함께 보존됩니다.</p><ol className="channel-evidence-list">{messages.map((message, index) => {
      const url = safeUrl(message.url), isEvidence = analysis?.evidence_event_ids?.includes(message.event_id), raw = item.evidence?.find((event) => event.id === message.event_id);
      return <li key={message.event_id || index} className={isEvidence ? 'is-cited' : ''}><header><span className="channel-evidence-number">{String(index + 1).padStart(2, '0')}</span><strong>{message.author}</strong><span className="channel-event-kind">{EVENT_KINDS[message.kind] || '작성'}</span>{isEvidence ? <Badge tone="green">AI 근거</Badge> : null}</header><p className="channel-message-text">{message.text || (message.kind === 'deleted' ? '삭제 이벤트 · 본문 없음' : '본문 없음')}</p><footer><span>{message.sent_at ? <time dateTime={message.sent_at} title={raw?.raw_sent_at || message.sent_at}>작성 {preciseTime(message.sent_at)}</time> : '원본 작성 시각 미입력'}</span>{message.changed_at ? <time dateTime={message.changed_at} title={raw?.raw_changed_at || message.changed_at}>변경 {preciseTime(message.changed_at)}</time> : null}{url ? <a href={url} target="_blank" rel="noopener noreferrer"><Link2 size={12} />원본 대화</a> : null}</footer><details className="channel-event-reference"><summary>원본 시각·출처 식별자</summary><span>메시지 {message.message_id}</span><span>수집 이벤트 {message.event_id}</span>{raw?.event_id ? <span>원본 이벤트 {raw.event_id}</span> : null}<span>원본 작성 시각 {raw?.raw_sent_at || '미입력'}</span><span>원본 변경 시각 {raw?.raw_changed_at || '미입력'}</span>{raw?.received_at ? <span>수집 시각 {preciseTime(raw.received_at)}</span> : null}</details></li>;
    })}</ol></section><aside className="channel-review-column">
      {analysis ? <section className="channel-analysis"><div><Sparkles size={17} /><span className="eyebrow">AI SUGGESTION</span><span>신뢰도 {Math.round(analysis.confidence * 100)}%</span></div><h3>{CLASSIFICATIONS[analysis.classification] || '대화 분석'}</h3><p>{analysis.summary}</p><small>{analysis.reason}</small>{analysis.classification === 'noise' ? <p className="channel-noise-note">보관 필요성이 낮다는 AI 의견입니다. 검토함에서 자동으로 제외되지 않습니다.</p> : null}</section> : null}
      {complete ? <section className="channel-completed"><CheckCheck size={21} /><h3>{item.status === 'accepted' ? '검토한 내용을 기록했습니다' : '보관 대상에서 제외했습니다'}</h3>{item.review?.title ? <strong>{item.review.title}</strong> : null}{item.review?.text ? <p>{item.review.text}</p> : null}{item.review?.reason ? <p>검토 사유 · {item.review.reason}</p> : null}{item.review?.reviewed_at ? <small>검토 {preciseTime(item.review.reviewed_at)}</small> : null}{item.document_id ? <p>문서 {shortId(item.document_id)} · 리비전 {shortId(item.revision_id)}<br />문서·기록 보관함에서 확인할 수 있습니다.</p> : null}<small>검토함의 원문과 검토 이력은 보존됩니다.</small></section> : <form className="channel-review-form" onSubmit={accept}><span className="eyebrow">HUMAN REVIEW</span><h3>보관할 기록을 확인하세요</h3><p>요약을 수정하고 업무 영역을 지정해 주세요. 원문 근거는 기록에 함께 첨부됩니다.</p><fieldset disabled={!reviewable || busy}><legend className="sr-only">기록 검토 및 등록</legend><FormField label="기록 제목"><input value={draft.title} onChange={(event) => update('title', event.target.value)} required maxLength={200} /></FormField><FormField label="검토한 내용"><textarea value={draft.text} onChange={(event) => update('text', event.target.value)} required maxLength={20000} rows={7} placeholder="원문에서 확인한 결정·논의·후속 작업을 작성해 주세요." /></FormField><div className="form-columns"><FormField label="업무 영역"><select value={draft.domain_id} onChange={(event) => update('domain_id', event.target.value)} required><option value="" disabled>영역 선택</option>{domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}</select></FormField><FormField label="기록 유형"><select value={draft.record_kind} onChange={(event) => update('record_kind', event.target.value)}>{Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></FormField></div><FormField label="업무 결정일 (선택)" hint="대화에서 확인한 실제 결정일입니다."><input type="date" value={draft.decided_on} onInput={(event) => update('decided_on', event.currentTarget.value)} onChange={(event) => update('decided_on', event.currentTarget.value)} /></FormField><FormField label="등록 사유"><textarea value={draft.reason} onChange={(event) => update('reason', event.target.value)} required minLength={3} maxLength={2000} rows={2} placeholder="이 기록을 보관하는 이유를 남겨 주세요." /></FormField><label className="checkbox-label"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} required /><span>수집 당시 원문을 확인했고, 위 기록이 대화의 맥락과 일치함을 검토했습니다.</span></label><Button type="submit" icon={CheckCheck} busy={busy} disabled={!acknowledged || !reviewable}>검토 후 기록 등록</Button></fieldset><p className="channel-approval-note"><ShieldCheck size={14} />이 등록은 요구사항 승인이나 기준선 발행과 별개입니다.</p>{!canReview ? <p className="channel-permission-note">최종 등록과 보관 제외는 관리자·검토자 권한이 필요합니다.</p> : null}{canReview && !RUNNING.has(item.status) ? <button type="button" className="text-button channel-dismiss" onClick={() => setDismissOpen(true)} disabled={busy}>보관 대상에서 제외<ArrowRight size={13} /></button> : null}</form>}
    </aside></div>
    <ChannelWorkflow id={id} status={item.status} route={route} request={request} canReview={canReview} onDirty={setWorkflowDirty} onChanged={onChanged} onOpenClassification={onOpenClassification} onOpenQuestion={onOpenQuestion} onOpenSource={onOpenSource} />
    {dismissOpen ? <DismissModal route={detailRoute} request={request} onClose={() => setDismissOpen(false)} onDone={async (next) => { setItem(next); setDismissOpen(false); await onChanged('대화를 보관 대상에서 제외하고 검토 사유를 남겼습니다.'); }} /> : null}
  </section>;
}

function DismissModal({ route, request, onClose, onDone }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { const result = await request(`${route}/dismiss`, { method: 'POST', body: { reason: form.get('reason').trim() } }); await onDone(result.item); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <Modal title="보관 대상에서 제외" eyebrow="RECORDED REVIEW" busy={busy} onClose={onClose}><form onSubmit={submit}><div className="modal-body"><p className="form-intro">문서·기록으로 등록하지 않고 검토를 마칩니다. 수집 당시 원문과 검토 이력은 검토함에 남습니다.</p><FormField label="제외 사유"><textarea name="reason" required minLength={3} maxLength={2000} rows={3} placeholder="예: 중복된 대화이며 기존 기록에 반영되어 있습니다." /></FormField><ErrorNotice error={error} /></div><footer className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>취소</Button><Button type="submit" variant="secondary" busy={busy}>제외 사유 저장</Button></footer></form></Modal>;
}
