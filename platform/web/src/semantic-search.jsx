import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, RefreshCw, FileText, ExternalLink, Pause, Sparkles } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, Spinner, Input, Select, Disclosure } from './ui.jsx';
import './semantic-search.css';

const REASONS = {
  SEMANTIC_NOT_CONFIGURED: '프로젝트 AI 연결이 필요해 키워드로 검색했습니다.',
  SEMANTIC_DISABLED: '의미 검색 색인이 시작되지 않아 키워드로 검색했습니다.',
  SEMANTIC_INDEX_PENDING: '현재 모델의 색인을 준비 중이라 키워드로 검색했습니다.',
  SEMANTIC_DAILY_LIMIT: '오늘의 의미 검색 처리 한도에 도달해 키워드로 검색했습니다.',
  SEMANTIC_CREDENTIAL_REJECTED: 'AI 연결을 확인해야 해 키워드로 검색했습니다.',
  SEMANTIC_RATE_LIMIT: 'AI 제공자의 요청 한도로 키워드 검색 결과를 표시합니다.',
};
const TYPE = { revision: '문서·기록', commercial_revision: '계약 문서', channel_inbox: '대화', context_record: '확정된 기록' };
export function SemanticSearchPanel({ project, request, canReview, domains = [], onOpenSource, notify }) {
  const projectId = typeof project === 'string' ? project : project?.id;
  const route = `/api/projects/${encodeURIComponent(projectId)}/context/semantic`;
  const [status, setStatus] = useState(null), [results, setResults] = useState(null), [query, setQuery] = useState(''), [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false), [indexBusy, setIndexBusy] = useState(false), [error, setError] = useState(null);
  const alive = useRef(true), sequence = useRef(0), statusSequence = useRef(0), currentRoute = useRef(route);
  currentRoute.current = route;
  const load = useCallback(async () => { const seq = ++statusSequence.current; try { const value = await request(`${route}/status`); if (alive.current && seq === statusSequence.current && currentRoute.current === route) setStatus(value); } catch (err) { if (alive.current && seq === statusSequence.current && currentRoute.current === route) setError(err); } }, [request, route]);
  useEffect(() => { alive.current = true; setStatus(null); setResults(null); setError(null); setBusy(false); setIndexBusy(false); setDomain(''); load(); return () => { alive.current = false; sequence.current++; }; }, [load]);
  useEffect(() => { if (!status?.enabled) return; const timer = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => clearInterval(timer); }, [load, status?.enabled]);
  async function search(event) { event.preventDefault(); if (!query.trim()) return; const seq = ++sequence.current; setBusy(true); setError(null);
    try { const result = await request(`${route}/search?${new URLSearchParams({ query: query.trim(), limit: '15', ...(domain ? { domain_id: domain } : {}) })}`); if (alive.current && seq === sequence.current) setResults(result); }
    catch (err) { if (alive.current && seq === sequence.current) setError(err); } finally { if (alive.current && seq === sequence.current) { setBusy(false); load(); } }
  }
  async function index(enabled) { setIndexBusy(true); setError(null); try { const next = await request(`${route}/index`, { method: 'POST', body: { enabled } }); if (alive.current && currentRoute.current === route) { setStatus(next); setResults(null); notify?.(enabled ? '승인된 자료의 의미 검색 색인을 준비합니다.' : '의미 검색을 중지하고 저장된 벡터를 삭제했습니다.'); } } catch (err) { if (alive.current && currentRoute.current === route) setError(err); } finally { if (alive.current && currentRoute.current === route) setIndexBusy(false); } }
  const pending = (status?.counts?.queued || 0) + (status?.counts?.running || 0), ready = status?.counts?.ready || 0;
  return <section className="semantic-panel" aria-label="프로젝트 의미 검색"><div className="semantic-heading"><div><h3>표현이 달라도, 근거를 찾습니다.</h3><p>검토가 끝난 현재 자료를 의미와 키워드로 검색합니다. 결과에서 원문을 바로 확인하세요.</p></div><Badge tone={status?.configured && status?.enabled ? 'green' : 'quiet'}>{status?.configured ? status.enabled ? '의미 검색 사용 중' : '색인 시작 전' : 'AI 연결 필요'}</Badge></div>
    <form className="semantic-form" onSubmit={search}><label><span className="sr-only">프로젝트 자료 검색어</span><Search size={19} /><Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={500} placeholder="예: 고객과 합의한 로그인 방식은?" /></label><Select aria-label="검색 업무 영역" value={domain} onChange={(event) => setDomain(event.target.value)}><option value="">프로젝트 전체</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select><Button type="submit" busy={busy} disabled={!query.trim()}>검색</Button></form>
    <ErrorNotice error={error} />
    {status ? <Disclosure className="semantic-index"><summary><span><Sparkles size={14} />검색 준비 상태</span><span>완료 {ready} · 대기 {pending}{status.counts.failed ? ` · 실패 ${status.counts.failed}` : ''}</span></summary><div><p>{status.configured ? `OpenAI · ${status.model} · 승인 자료 ${status.source_count}개` : '프로젝트 AI 연결에 OpenAI 키를 저장한 뒤, 검토자가 의미 검색 시작을 누르면 승인된 자료를 색인합니다.'}</p><p>최초 시작 이후 새로 승인되거나 변경된 자료를 5분마다 확인합니다. 원문 변경·승인 철회는 검색 시 다시 확인합니다.</p>{status.error_code ? <p className="semantic-warning">{REASONS[status.error_code] || '색인을 완료하지 못했습니다. AI 연결을 확인한 뒤 다시 준비해 주세요.'} <code>{status.error_code}</code></p> : null}{status.excluded_sources || status.truncated_sources ? <p className="semantic-warning">처리 범위 때문에 자료 {status.excluded_sources}개가 제외되고 {status.truncated_sources}개는 일부만 색인되었습니다.</p> : null}<p>프로젝트당 최신 승인 자료 최대 {status.limits.sources}개·{status.limits.chunks}조각. 오늘 처리 예약 {Math.round(status.usage.reserved_bytes / 1000)} / {status.limits.dailyBytes / 1000} KB · 검색 {status.usage.query_requests} / {status.limits.dailyQueries}회.</p><div className="semantic-index-actions"><Button type="button" icon={RefreshCw} variant="secondary" disabled={!canReview || !status.configured || indexBusy} busy={indexBusy} onClick={() => index(true)}>{status.enabled ? '새 자료 확인·실패 재시도' : '의미 검색 시작'}</Button>{status.enabled ? <Button type="button" icon={Pause} variant="secondary" disabled={!canReview || indexBusy} onClick={() => index(false)}>중지·벡터 삭제</Button> : null}</div></div></Disclosure> : <Spinner label="검색 연결을 확인하고 있습니다" />}
    {busy ? <Spinner label="관련 근거를 찾고 있습니다" /> : results ? <div className="semantic-results"><div className="semantic-result-heading"><strong>{results.items.length}개 근거</strong><Badge tone={results.search_mode === 'hybrid' ? 'blue' : 'quiet'}>{results.search_mode === 'hybrid' ? '의미 + 키워드' : '키워드'}</Badge></div>{results.fallback_reason ? <p className="semantic-warning" role="status">{REASONS[results.fallback_reason] || '의미 검색을 사용할 수 없어 키워드 결과를 표시합니다.'}</p> : <p className="semantic-note">유사도는 검색 순위 기준이며 사실의 정확도나 고객 합의 확률이 아닙니다.</p>}{results.items.length ? results.items.map((item) => <article key={`${item.type}:${item.id}`} className="semantic-result"><div><span>{TYPE[item.type] || item.type}</span>{item.match_type === 'semantic' ? <Badge tone="blue">의미가 비슷한 근거</Badge> : null}</div><h4>{item.title}</h4><p>{item.text}{item.text_truncated ? '…' : ''}</p><footer><Button type="button" variant="secondary" icon={FileText} onClick={() => onOpenSource?.(item.internal_ref || { type: item.type, id: item.id })}>근거 확인</Button>{item.url && /^https?:\/\//i.test(item.url) ? <a href={item.url} target="_blank" rel="noopener noreferrer">원본 도구에서 열기<ExternalLink size={13} /></a> : null}</footer></article>) : <Empty compact icon={Search} title="일치하는 근거가 없습니다">검색 표현을 바꾸거나 자료가 승인되었는지 확인해 주세요.</Empty>}</div> : <div className="semantic-intro"><FileText size={20} /><p>문서명 대신 찾고 싶은 내용을 질문해 보세요.<br /><span>아직 검토 중인 자료는 기존 자료 검색에서 확인할 수 있습니다.</span></p></div>}
  </section>;
}
