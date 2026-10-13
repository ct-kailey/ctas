import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, ClipboardList, ExternalLink, Link2, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, FormField, Spinner } from './ui.jsx';
import './channel-workflow.css';

const time = value => value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) : '원본 시각 미기록';
const local = value => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 19) : '';
const messageTime = message => message?.kind === 'updated' ? message.changed_at || message.sent_at : message?.sent_at;
function link(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; } }

export function ChannelWorkflow({ id, status, route, request, canReview, onDirty, onChanged, onOpenClassification, onOpenQuestion, onOpenSource }) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('classification'), [selected, setSelected] = useState([]), [text, setText] = useState(''), [ack, setAck] = useState(false);
  const [question, setQuestion] = useState(null), [authorId, setAuthorId] = useState(''), [manualTime, setManualTime] = useState(''), [locked, setLocked] = useState(false), [result, setResult] = useState(null), [questionStale, setQuestionStale] = useState(false);
  const pending = useRef(null), alive = useRef(true), sequence = useRef(0), initialHash = useRef(null);
  const endpoint = `${route}/channel-inbox/${encodeURIComponent(id)}/workflow`;
  const load = useCallback(async ({ signal, more = false } = {}) => {
    const seq = ++sequence.current; setLoading(true);
    try {
      const offset = more ? data?.waiting_questions?.length || 0 : 0;
      const next = await request(`${endpoint}?limit=30&offset=${offset}`, { signal });
      if (!alive.current || seq !== sequence.current) return;
      if (initialHash.current && initialHash.current !== next.source_ref?.sha256) setAck(false);
      initialHash.current = next.source_ref?.sha256;
      setData(previous => ({ ...next, waiting_questions: more ? [...(previous?.waiting_questions || []), ...next.waiting_questions.filter(q => !previous?.waiting_questions?.some(p => p.id === q.id))] : next.waiting_questions }));
      setError(null);
    } catch (err) { if (alive.current && seq === sequence.current && err.name !== 'AbortError') setError(err); }
    finally { if (alive.current && seq === sequence.current) setLoading(false); }
  }, [endpoint, request, data?.waiting_questions?.length]);
  useEffect(() => {
    alive.current = true; const controller = new AbortController();
    // Pagination is explicit; reloading the selected item must not discard its draft.
    load({ signal: controller.signal });
    return () => { alive.current = false; sequence.current++; controller.abort(); };
  }, [endpoint, request, status]);
  const dirty = Boolean(selected.length || text || question || ack || locked);
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  const messages = data?.messages || [], evidence = messages.filter(m => selected.includes(m.id)), answerMessage = evidence.find(m => m.id === authorId), answerTime = messageTime(answerMessage);
  const editable = canReview && data?.available && !busy && !locked;
  function changeSelection(message, checked) {
    setSelected(values => checked ? [...values, message.id] : values.filter(value => value !== message.id));
    if (!checked && authorId === message.id) { setAuthorId(''); setManualTime(''); }
    setAck(false); setResult(null);
  }
  function useSourceText() { setText(evidence.map(message => message.text).filter(Boolean).join('\n\n')); setAck(false); }
  function selectQuestion(value) { setQuestion(data.waiting_questions.find(q => q.id === value) || null); setQuestionStale(false); setAck(false); }
  async function submit(event) {
    event.preventDefault();
    if (!pending.current) {
      const body = { acknowledge_evidence: true, request_id: crypto.randomUUID(), source_sha256: data.source_ref.sha256, event_ids: [...selected], text: text.trim() };
      if (mode === 'answer') Object.assign(body, { question_id: question.id, expected_question_version: question.version, responded_by: answerMessage.author, responded_at: answerTime || new Date(manualTime).toISOString() });
      pending.current = { mode, body };
    }
    setBusy(true); setLocked(true); setError(null);
    try {
      const response = await request(`${endpoint}/${pending.current.mode}`, { method: 'POST', body: pending.current.body });
      if (!alive.current) return;
      setResult(response.mapping); pending.current = null; setLocked(false); setSelected([]); setText(''); setAck(false); setQuestion(null); setAuthorId(''); setManualTime('');
      onDirty?.(false);
      await load();
      await onChanged?.(mode === 'answer' ? '대화를 답변 검토 후보로 연결했습니다. 답변 확정 전까지 작업 대기는 유지됩니다.' : '고객 요청을 분류 검토로 연결했습니다. 기존 계약·요구사항과 대조해 주세요.');
    } catch (err) {
      if (!alive.current) return;
      if (err.status >= 400 && err.status < 500 && err.status !== 408) {
        pending.current = null; setLocked(false); setAck(false);
        if (err.status === 409) { if (mode === 'answer') setQuestionStale(true); await load(); }
      }
      setError(err);
    } finally { if (alive.current) setBusy(false); }
  }
  function open(mapping) { if (mapping.target_type === 'classification') onOpenClassification?.(mapping.target_id); else onOpenQuestion?.(mapping.target_id); }
  const canSubmit = locked || Boolean(editable && ack && evidence.length && text.trim() && (mode === 'classification' || (question && !questionStale && answerMessage && (answerTime || manualTime))));
  return <section className="cw-panel" aria-label="검토한 대화를 업무로 연결">
    <header className="cw-heading"><div><h2>검토한 대화를 다음 업무로 연결</h2><p>원문을 선택하고 요청·답변을 확인하면, 담당자가 이어서 검토할 수 있습니다.</p></div><Button variant="secondary" icon={RefreshCw} busy={loading} disabled={busy} onClick={() => load()}>연결 현황 갱신</Button></header>
    {!data && loading ? <Spinner label="대화의 연결 가능 상태를 확인하고 있습니다" /> : null}
    {data && !data.available ? <div className="notice warning"><ShieldCheck size={18} /><div><strong>{status === 'accepted' ? '원본 변경을 확인해 주세요' : '원문 검토와 기록 등록이 먼저 필요합니다'}</strong><p>{status === 'accepted' ? '수정·삭제된 대화 또는 출처의 변경을 검토하고 새 기록을 등록해 주세요. 기존 연결 이력은 유지됩니다.' : '위의 원문과 보관 내용을 검토한 뒤 기록으로 등록하면 고객 요청이나 수신 답변으로 연결할 수 있습니다.'}</p></div></div> : null}
    {data && !data.available && text ? <div className="cw-retained-draft"><FormField label="보존한 연결 초안" hint="작성 내용은 유지됩니다. 최신 원문을 등록한 후 이 내용을 복사해 대조해 주세요."><textarea readOnly value={text} rows={5} /></FormField></div> : null}
    {data?.available ? <form onSubmit={submit}>
      <div className="cw-grid"><section className="cw-evidence"><div className="cw-step"><span>01</span><div><h3>근거가 되는 메시지 선택</h3><small>{data.source?.title} · {data.source?.channel || data.source?.provider}</small></div></div><p className="cw-help">선택한 원문·작성자·시각을 연결 이력에 함께 보존합니다.</p>
        <fieldset disabled={!editable} className="cw-fieldset"><legend className="sr-only">연결할 메시지</legend>{messages.length ? messages.map(message => <article className={`cw-message ${selected.includes(message.id) ? 'is-selected' : ''}`} key={message.id}><label><input type="checkbox" checked={selected.includes(message.id)} disabled={!editable || !message.selectable} onChange={e => changeSelection(message, e.target.checked)} /><span><strong>{message.author || '작성자 미기록'}</strong><small>{time(messageTime(message))}{message.kind === 'updated' ? ' · 수정된 메시지' : message.kind === 'deleted' ? ' · 삭제 이벤트' : ''}</small></span></label><p>{message.text || '본문 없음'}</p>{!message.selectable ? <small>업무 연결에 사용할 수 없는 메시지입니다.</small> : null}{link(message.url) ? <a href={link(message.url)} target="_blank" rel="noopener noreferrer">원본 대화<ExternalLink size={12} /></a> : null}</article>) : <Empty compact title="선택할 메시지가 없습니다">수집 당시 원문을 확인해 주세요.</Empty>}</fieldset>
        {onOpenSource && data.source_ref ? <button className="text-button" type="button" onClick={() => onOpenSource(data.source_ref)}><Link2 size={13} />등록된 원문·출처 확인</button> : null}
      </section><section className="cw-compose"><div className="cw-step"><span>02</span><div><h3>어떤 업무로 이어지나요?</h3><small>다음 검토 단계로 연결합니다.</small></div></div><fieldset className="cw-fieldset" disabled={!editable}><legend className="sr-only">업무 연결 내용</legend><div className="cw-modes"><label className={mode === 'classification' ? 'is-active' : ''}><input type="radio" name={`cw-mode-${id}`} checked={mode === 'classification'} onChange={() => { setMode('classification'); setAck(false); }} /><ClipboardList size={18} /><span><strong>고객 요청 분류</strong><small>버그·변경·추가 요청 검토</small></span></label><label className={mode === 'answer' ? 'is-active' : ''}><input type="radio" name={`cw-mode-${id}`} checked={mode === 'answer'} onChange={() => { setMode('answer'); setAck(false); }} /><MessageCircle size={18} /><span><strong>대기 질문의 답변</strong><small>질문을 직접 선택해 연결</small></span></label></div>
        {mode === 'answer' ? <><FormField label="답변을 연결할 대기 질문"><select value={question?.id || ''} onChange={e => selectQuestion(e.target.value)} required><option value="">대기 중인 질문 선택</option>{question && !data.waiting_questions.some(q => q.id === question.id) ? <option value={question.id} disabled>{question.title} · 최신 상태 재확인 필요</option> : null}{data.waiting_questions.map(q => <option key={q.id} value={q.id}>{q.title} · {q.recipient}</option>)}</select></FormField>{!data.waiting_questions.length ? <p className="cw-help">현재 답변을 기다리는 질문이 없습니다. 질문·응답 대기에서 질문과 발송 이력을 먼저 등록하세요.</p> : null}{data.question_pagination?.has_more ? <Button type="button" variant="secondary" disabled={loading} onClick={() => load({ more: true })}>대기 질문 더 불러오기</Button> : null}{question ? <div className="cw-question"><strong>{question.title}</strong><p>{question.question}</p><small>{question.recipient} · {question.channel} · 질문 {time(question.asked_at)}</small>{question.blocking ? <Badge tone="amber">답변 확정 전 작업 대기</Badge> : null}</div> : null}{questionStale ? <p className="notice warning">질문 상태가 변경되었을 수 있습니다. 최신 대기 질문을 다시 선택해 주세요. 작성 내용은 유지됩니다.</p> : null}{questionStale && data.waiting_questions.some(q => q.id === question?.id) ? <Button type="button" variant="secondary" onClick={() => selectQuestion(question.id)}>이 질문의 최신 상태 다시 선택</Button> : null}</> : <p className="cw-help">기존 프로젝트 기록과 비교한 분류 제안을 만듭니다. 분류 확정과 작업 시작은 후속 검토에서 진행합니다.</p>}
        <div className="cw-text-heading"><span>{selected.length}개 메시지 선택</span><button className="text-button" type="button" disabled={!evidence.length} onClick={useSourceText}>선택한 원문으로 내용 채우기</button></div><FormField label={mode === 'answer' ? '검토할 답변 내용' : '검토할 고객 요청'} hint="필요한 맥락을 정리하되 원문의 의미를 유지해 주세요."><textarea value={text} onChange={e => { setText(e.target.value); setAck(false); }} rows={7} maxLength={10000} required /></FormField>
        {mode === 'answer' ? <><FormField label="답변자 표시명·원본 메시지"><select required value={authorId} onChange={e => { setAuthorId(e.target.value); setManualTime(''); setAck(false); }}><option value="">선택한 근거에서 답변자 선택</option>{evidence.map(message => <option key={message.id} value={message.id}>{message.author} · {time(messageTime(message))} · {message.text?.slice(0, 40)}</option>)}</select></FormField>{answerMessage ? answerTime ? <p className="cw-help">답변 시각 · {time(answerTime)}<br />원본의 작성자 표시명과 시각을 기록합니다. 표시명만으로 발신자 신원을 확인하지 않습니다.</p> : <FormField label="답변한 시각" hint="원본 시각이 없어 검토자가 확인한 시각을 입력합니다."><input required type="datetime-local" step="1" max={local(new Date().toISOString())} value={manualTime} onChange={e => { setManualTime(e.target.value); setAck(false); }} /></FormField> : null}</> : null}
        <label className="cw-ack"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>선택한 원문과 작성 내용을 대조했고, {mode === 'answer' ? '질문·답변자·답변 시각이 맞는지' : '고객의 요청 의도가 맞는지'} 확인했습니다.</span></label></fieldset>
        {!canReview ? <p className="cw-help">관리자·검토자가 원문을 확인한 뒤 업무로 연결할 수 있습니다.</p> : null}<ErrorNotice error={error} />{locked && !busy ? <p className="notice warning">처리 결과를 확인하지 못했습니다. 동일한 요청으로 다시 확인하여 중복 연결을 방지합니다. 입력은 유지됩니다.</p> : null}<Button type="submit" icon={ArrowRight} busy={busy} disabled={!canSubmit}>{locked ? '같은 연결 요청 다시 확인' : mode === 'answer' ? '답변 검토 후보로 연결' : '고객 요청 분류로 연결'}</Button><p className="cw-help cw-final-note">{mode === 'answer' ? '답변을 연결해도 질문은 검토 대기로 남습니다. 검토자가 확정해야 연결 작업의 대기가 해제됩니다.' : '요청·원문을 연결한 분류 검토안이 생성됩니다. Nora 분석과 사람의 분류 검토를 이어갈 수 있습니다.'}</p>
      </section></div>
    </form> : <ErrorNotice error={error} onRetry={() => load()} />}
    {result ? <div className="cw-success" role="status"><CheckCheck size={21} /><div><strong>{result.target_type === 'classification' ? '고객 요청의 분류 검토를 준비했습니다' : '답변을 검토 후보로 연결했습니다'}</strong><p>원문과 연결 이력을 함께 보존했습니다.</p></div><Button variant="secondary" onClick={() => open(result)}>이어서 검토<ArrowRight size={14} /></Button></div> : null}
    {data?.mappings?.length ? <section className="cw-history" aria-label="대화의 업무 연결 이력"><h3>이 대화에서 이어진 업무</h3><ol>{data.mappings.map(mapping => <li key={mapping.id}><span className="cw-history-dot" /><div><strong>{mapping.target_type === 'classification' ? '고객 요청 분류' : '대기 질문의 답변'}</strong><small>{mapping.actor_name || '검토자'} · {time(mapping.created_at)} · 원문 {mapping.event_ids?.length || 0}개</small>{mapping.request_snapshot?.text ? <p>{mapping.request_snapshot.text}</p> : null}<details><summary>연결 당시 원문 근거</summary>{mapping.source_snapshot?.selected_messages?.map(message => <div className="cw-history-source" key={message.id}><strong>{message.author}</strong><small>{time(messageTime(message))}</small><p>{message.text}</p>{link(message.url) ? <a href={link(message.url)} target="_blank" rel="noopener noreferrer">원본 대화</a> : null}</div>)}</details></div><button className="text-button" type="button" onClick={() => open(mapping)}>검토 내용 열기<ArrowRight size={13} /></button></li>)}</ol></section> : null}
  </section>;
}
