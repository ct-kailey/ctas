import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, Copy, History, Inbox, KeyRound, Link2, Plus, RefreshCw, Zap } from 'lucide-react';
import { Badge, Button, Disclosure, Empty, ErrorNotice, FormField, Input, Notice, Select, Spinner, dateTime, projectPath } from './ui.jsx';
import { ListItem, ListItemLeadingIcon } from './components/ctds/ListItem';
import { usableConnectionGrants, selectedGrantResource } from './customer-connections-state.mjs';
import './nora-channels.css';

const PROVIDERS = { slack: 'Slack', discord: 'Discord', teams: 'Microsoft Teams', gmail: 'Gmail', drive: 'Google Drive', google_drive: 'Google Drive', gdrive: 'Google Drive', 'google-drive': 'Google Drive', onedrive: 'OneDrive', microsoft: 'Microsoft', github: 'GitHub', notion: 'Notion' };
const INTERVALS = [[5, '5분'], [10, '10분'], [15, '15분'], [30, '30분'], [60, '1시간'], [120, '2시간'], [360, '6시간'], [720, '12시간'], [1440, '24시간']];
const SOURCE_STATUS = { draft: ['연결 적용 필요', 'amber'], provisioning: ['파이프라인 연결 중', 'blue'], ready: ['연결 준비 완료', 'green'], error: ['연결 확인 필요', 'red'] };
const DELIVERY_STATUS = { queued: ['처리 대기', 'quiet'], processing: ['적재 중', 'blue'], running: ['처리 중', 'blue'], submitted: ['Nora 실행 요청됨', 'blue'], completed: ['확인 완료', 'green'], delivered: ['검토함 적재', 'green'], succeeded: ['검토함 적재', 'green'], failed: ['확인 필요', 'red'], uncertain: ['실행 결과 확인 필요', 'amber'], duplicate: ['중복 제외', 'quiet'], skipped: ['적재 제외', 'quiet'] };
const ERRORS = {
  NORA_CHANNEL_STOP_PENDING: '기존 Nora 일정·트리거의 원격 중지를 확인하고 있습니다. 중지 완료 후 연결을 적용하세요.',
  CONNECTION_GRANT_REQUIRED: '고객사 소유 계정과 프로젝트의 사용 범위를 승인한 뒤 수집 대상을 다시 연결해 주세요.',
  CONNECTION_GRANT_REVOKED: '프로젝트의 사용 허용이나 고객사·계정·담당자 권한이 중지되었습니다. 소유자가 사용 범위와 권한을 확인해야 합니다.',
  CONNECTION_GRANT_SCOPE_MISMATCH: '승인한 Nora 워크스페이스·커넥터와 기존 수집 대상이 일치하지 않습니다.',
  CONNECTION_GRANT_CHANGED: '사용 범위가 변경되었습니다. 원격 중지 완료 후 수집 설정과 파이프라인 연결을 다시 적용하세요.',
  CUSTOMER_ARCHIVED: '소유 고객사가 보관 상태입니다. 고객사 소유자에게 확인해 주세요.',
  CONNECTION_ACCOUNT_PAUSED: '계정 사용이 중지되었습니다. 고객사 소유자에게 계정 상태를 확인해 주세요.',
  CONNECTION_RESOURCE_FORBIDDEN: '이 채널·폴더는 프로젝트에 허용되지 않았습니다. 소유자에게 사용 범위를 확인해 주세요.',
  NORA_AUTH_REQUIRED: 'Nora 로그인을 다시 연결한 뒤 시도해 주세요.',
  NORA_WORKSPACE_REQUIRED: '프로젝트 설정에서 Nora 워크스페이스를 먼저 연결해 주세요.',
  NORA_WORKSPACE_NOT_READY: 'Nora 워크스페이스 연결 확인이 끝난 뒤 다시 시도해 주세요.',
  NORA_CONNECTOR_NOT_FOUND: '등록한 Nora 커넥터를 찾지 못했습니다. 커넥터 연결 상태를 확인해 주세요.',
  NORA_CONNECTOR_DISABLED: 'Nora에서 해당 커넥터를 활성화한 뒤 다시 시도해 주세요.',
  NORA_CHANNEL_SOURCE_VERSION_CONFLICT: '다른 작업에서 설정이 변경되었습니다. 최신 설정을 불러온 뒤 다시 저장해 주세요.',
  NORA_CHANNEL_VERSION_CONFLICT: '다른 작업에서 설정이 변경되었습니다. 최신 설정을 불러온 뒤 다시 저장해 주세요.',
  NORA_CHANNEL_NOT_READY: '수집 설정을 저장한 뒤 수집 연결 적용을 눌러 주세요.',
  NORA_CHANNEL_SOURCE_NOT_READY: '수집 설정을 저장한 뒤 수집 연결 적용을 눌러 주세요.',
  NORA_CHANNEL_CONNECTION_REQUIRED: '프로젝트 설정에서 Nora 워크스페이스 연결을 먼저 완료해 주세요.',
  NORA_CHANNEL_CONNECTOR_REQUIRED: 'Nora에서 수집 커넥터와 대상 읽기 권한을 확인해 주세요.',
  NORA_CHANNEL_PIPELINE_CHANGED: 'Nora에서 파이프라인이 변경되었습니다. 수집 범위와 노드 구성을 확인해 주세요.',
  NORA_CHANNEL_PIPELINE_UNPUBLISHED: 'Nora 파이프라인이 발행되었는지 확인한 뒤 다시 연결해 주세요.',
  NORA_CHANNEL_DOCUMENT_NOT_READY: 'Nora에서 원문 추출이 끝나기를 기다리고 있습니다. 이후 자동으로 다시 확인합니다.',
  NORA_CHANNEL_RATE_LIMIT: '수집 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
  NORA_CHANNEL_LEASE_EXPIRED: '이전 실행 결과를 확인하지 못했습니다. Nora 실행 이력을 확인해 주세요.',
  NORA_CHANNEL_TRIGGER_PAUSED: '이벤트 수집이 중지되어 있습니다. 진입점 설정을 확인해 주세요.',
  CHANNEL_RATE_LIMIT: '대화 검토함 처리량 제한으로 기다리고 있습니다. 이후 자동으로 다시 확인합니다.',
};
const friendlyError = error => error?.code && ERRORS[error.code] ? { message: ERRORS[error.code], code: error.code } : error;
const sourceStatus = source => SOURCE_STATUS[source.status] || ['상태 확인 필요', 'quiet'];
const configuration = source => ({ expected_version: source.version, schedule_enabled: Boolean(source.schedule_enabled), trigger_enabled: Boolean(source.trigger_enabled), interval_minutes: source.interval_minutes || 15 });
const sameConfiguration = (left, right) => left.schedule_enabled === right.schedule_enabled && left.trigger_enabled === right.trigger_enabled && Number(left.interval_minutes) === Number(right.interval_minutes);

export function NoraChannelSources({ project, request, canReview, notify, onChanged, onDirty, onNavigate, accessVersion = 0 }) {
  const base = projectPath(project.id), route = `${base}/nora-channel-sources`;
  const [sources, setSources] = useState([]), [connection, setConnection] = useState(null), [grants, setGrants] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(null), [creating, setCreating] = useState(false), [busy, setBusy] = useState(null);
  const [selectedId, setSelectedId] = useState(null), [settingsDirty, setSettingsDirty] = useState(false);
  const lifecycle = useRef({ active: true, sequence: 0 }), requestInProgress = useRef(false);
  const selected = sources.find(source => source.id === selectedId);

  const load = useCallback(async ({ signal, quiet = false } = {}) => {
    const sequence = ++lifecycle.current.sequence;
    try {
      const [result, access] = await Promise.all([request(route, { signal }), request(`${base}/connection-grants`, { signal })]);
      if (!lifecycle.current.active || sequence !== lifecycle.current.sequence) return;
      setSources(result.sources || []); setConnection(result); setGrants(access.grants || []);
      if (!quiet) setError(null);
    } catch (err) {
      if (lifecycle.current.active && sequence === lifecycle.current.sequence && err.name !== 'AbortError' && !quiet) setError(friendlyError(err));
    } finally { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setLoading(false); }
  }, [request, route, base]);

  useEffect(() => {
    lifecycle.current.active = true;
    const controller = new AbortController(); void load({ signal: controller.signal });
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; controller.abort(); };
  }, [load, accessVersion]);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden && !requestInProgress.current) void load({ quiet: true }); }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => { onDirty?.(creating || settingsDirty || Boolean(busy)); return () => onDirty?.(false); }, [creating, settingsDirty, busy, onDirty]);

  async function mutate(source, kind, body) {
    if (requestInProgress.current) return null;
    requestInProgress.current = true; setBusy(`${source.id}:${kind}`); setError(null);
    try {
      const result = await request(`${route}/${encodeURIComponent(source.id)}${kind === 'settings' ? '' : `/${kind}`}`, { method: kind === 'settings' ? 'PATCH' : 'POST', body });
      if (!lifecycle.current.active) return null;
      if (result.source) setSources(previous => previous.map(item => item.id === source.id ? result.source : item));
      await load({ quiet: true });
      notify?.(kind === 'reauthorize' ? '사용 승인을 연결했습니다. 원격 중지가 끝나면 수집 방식을 선택하고 연결을 적용하세요.' : kind === 'run' ? '수집 실행을 요청했습니다. 적재 결과는 수집 이력과 대화 검토함에서 확인하세요.' : kind === 'provision' ? '수집 연결을 적용했습니다. 이벤트 수집은 외부 서비스의 Webhook 연결도 필요합니다.' : '수집 설정을 저장했습니다. 수집 연결 적용을 눌러 주세요.');
      await onChanged?.({ quiet: true });
      return result;
    } catch (err) {
      if (lifecycle.current.active) { setError(friendlyError(err)); await load({ quiet: true }); }
      return null;
    } finally { requestInProgress.current = false; if (lifecycle.current.active) setBusy(null); }
  }

  const canConfigure = canReview && connection?.ready && connection?.configured !== false;
  const availableGrants = usableConnectionGrants(grants);
  const hasApproval = source => Boolean(selectedGrantResource(grants, source.grant_id || source.connection_grant_id, source.external_channel_id));
  const stopPending = source => Boolean(source.remote_stop_status && source.remote_stop_status !== 'completed');
  const canOperate = source => canConfigure && source.can_operate === true && hasApproval(source) && !stopPending(source);
  return <section className="nora-channels ains-section-stack" aria-label="Nora 커넥터 수집">
    <div className="nora-channel-heading">
      <div className="nora-channel-title"><h2>자동 수집</h2><p>검토한 기록만 프로젝트에 반영합니다.</p></div>
      <div className="nora-channel-actions">
        <Button type="button" variant="ghost" icon={RefreshCw} disabled={Boolean(busy) || loading} onClick={() => load()}>새로고침</Button>
        {canReview ? <Button type="button" icon={Plus} disabled={!canConfigure || !availableGrants.length || Boolean(busy) || creating || settingsDirty} onClick={() => setCreating(true)}>수집 대상 추가</Button> : null}
      </div>
    </div>
    <div className="nora-channel-actions"><NavigationLink projectId={project.id} tab="channels" onNavigate={onNavigate}>수집한 기록 검토</NavigationLink></div>
    <ErrorNotice error={error} onRetry={() => load()} />
    {loading && !connection ? <Spinner label="Nora 수집 연결을 불러오고 있습니다" /> : null}
    {connection && !connection.ready ? <Notice tone="warning" title="Nora 워크스페이스 연결이 필요합니다" actions={<NavigationLink projectId={project.id} tab="settings" onNavigate={onNavigate}>프로젝트 연결 설정</NavigationLink>}>프로젝트의 Nora 로그인과 워크스페이스 연결 상태를 확인해 주세요. 커넥터는 해당 워크스페이스에 등록된 연결을 사용합니다.</Notice> : connection?.configured === false ? <Notice tone="warning" title="수집 기능 준비가 필요합니다">서버의 Nora 연결 설정을 확인해 주세요. 기존 수집 기록은 계속 조회할 수 있습니다.</Notice> : null}
    {connection?.ready && !availableGrants.length ? <Notice title="수집 권한을 먼저 승인하세요" actions={<Button asChild type="button" variant="secondary"><a href="#project-collection-access">수집 권한 설정</a></Button>}>고객사를 지정하고 수집할 채널·폴더를 승인하세요.</Notice> : null}
    {creating ? <NoraSourceForm route={route} grants={grants} request={request} onCancel={() => setCreating(false)} onCreated={async source => { setCreating(false); setSelectedId(source.id); await load({ quiet: true }); notify?.('수집 대상을 저장했습니다. 수집 방식을 선택하고 연결을 적용하세요.'); }} /> : null}
    {!loading && !sources.length && connection?.ready && availableGrants.length > 0 && !creating ? <Empty compact icon={Link2} title="Nora 수집 대상을 추가하세요">승인된 채널·폴더를 선택하고 수집 설정을 적용하세요.</Empty> : null}
    {sources.length ? <div className="nora-channel-source-list">{sources.map(source => {
      const [label, tone] = stopPending(source) ? ['원격 중지 확인 중', 'amber'] : !hasApproval(source) ? ['사용 승인 필요', 'amber'] : sourceStatus(source), sourceBusy = Boolean(busy) || source.status === 'provisioning';
      return <article className="nora-channel-source ains-section-stack" key={source.id}>
        <div className="nora-channel-heading"><div className="nora-channel-title"><span className="nora-channel-meta">{PROVIDERS[source.provider] || source.provider}</span><h3>{source.name}</h3></div><Badge tone={tone}>{label}</Badge></div>
        <div className="nora-channel-summary"><p>수집 대상 <code>{source.external_channel_id}</code></p><p>최근 적재 {source.last_received_at ? dateTime(source.last_received_at) : '아직 없음'}</p></div>
        <div className="nora-channel-entry-summary" aria-label="저장된 수집 진입점"><span><Clock3 size={15} />일정 수집 {source.schedule_enabled ? `${source.interval_minutes}분 간격${source.status !== 'ready' ? ' · 적용 필요' : ''}` : '꺼짐'}</span><span><Zap size={15} />이벤트 트리거 {source.trigger_enabled ? source.status === 'ready' ? '수신 준비 · Webhook 연동 확인' : '적용 필요' : '꺼짐'}</span></div>
        {stopPending(source) ? <Notice tone="warning" title={source.remote_stop_status === 'failed' ? 'Nora 원격 중지 확인이 필요합니다' : 'Nora 원격 수집 중지를 확인하고 있습니다'}>새 수집 요청은 차단했습니다. 기존 일정·트리거의 중지를 확인한 뒤 파이프라인을 다시 연결할 수 있습니다.{source.remote_stop_error_code ? <code> {source.remote_stop_error_code}</code> : null}</Notice> : null}
        {!hasApproval(source) ? <Notice tone="warning" title="프로젝트의 사용 승인이 필요합니다">기존 수집 대상과 기록은 보존됩니다. 프로젝트 소유자가 같은 Nora 커넥터와 대상의 사용 범위를 승인한 뒤 설정·수집 이력에서 다시 연결하세요.</Notice> : null}
        {source.authorization_error || source.last_error_code ? <Notice tone="warning" title="최근 수집을 확인해 주세요">{ERRORS[source.authorization_error || source.last_error_code] || '수집 이력에서 실패 원인과 연결 상태를 확인해 주세요.'} <code>{source.authorization_error || source.last_error_code}</code></Notice> : null}
        <div className="nora-channel-actions">
          {canReview ? <>{source.status !== 'ready' ? <Button type="button" variant="secondary" icon={Link2} disabled={!canOperate(source) || sourceBusy || settingsDirty || creating} busy={busy === `${source.id}:provision`} onClick={() => mutate(source, 'provision', { expected_version: source.version })}>수집 연결 적용</Button> : null}<Button type="button" variant="secondary" icon={RefreshCw} disabled={!canOperate(source) || sourceBusy || source.status !== 'ready' || settingsDirty || creating} busy={busy === `${source.id}:run`} onClick={() => mutate(source, 'run', {})}>지금 수집</Button></> : null}
          <Button type="button" variant="ghost" icon={History} disabled={sourceBusy || settingsDirty || creating} aria-expanded={source.id === selectedId} onClick={() => setSelectedId(source.id === selectedId ? null : source.id)}>{source.id === selectedId ? '설정·이력 닫기' : '설정·이력'}</Button>
        </div>
      </article>;
    })}</div> : null}
    {selected ? <section className="nora-channel-detail ains-section-stack" aria-label={`${selected.name} 수집 설정과 이력`}>
      <h3>{selected.name} · 설정 및 수집 이력</h3>
      {/* Distinct sibling keys keep polling from orphaning settings or delivery DOM. */}
      {project.role === 'owner' && !hasApproval(selected) ? <NoraReauthorize key={`approval:${selected.id}`} source={selected} grants={grants} disabled={Boolean(busy)} onSave={body => mutate(selected, 'reauthorize', body)} /> : null}
      {canReview ? <NoraSourceSettings key={`settings:${selected.id}`} source={selected} saving={busy === `${selected.id}:settings`} disabled={Boolean(busy) || selected.status === 'provisioning' || !canOperate(selected)} onDirty={setSettingsDirty} onSave={body => mutate(selected, 'settings', body)} /> : null}
      {canReview && selected.status === 'ready' ? <div className="nora-channel-actions"><Button type="button" variant="ghost" icon={Link2} disabled={!canOperate(selected) || Boolean(busy) || settingsDirty} busy={busy === `${selected.id}:provision`} onClick={() => mutate(selected, 'provision', { expected_version: selected.version })}>수집 연결 다시 적용</Button></div> : null}
      <NoraDeliveries key={`deliveries:${selected.id}`} source={selected} route={route} request={request} canReview={canReview && canOperate(selected)} projectId={project.id} onNavigate={onNavigate} refreshKey={selected.last_received_at} notify={notify} onChanged={() => load({ quiet: true })} />
    </section> : null}
  </section>;
}

function NavigationLink({ projectId, tab, onNavigate, children, inboxId }) {
  const href = `/?project=${encodeURIComponent(projectId)}&tab=${encodeURIComponent(tab)}${inboxId ? `&inboxId=${encodeURIComponent(inboxId)}` : ''}`;
  return <Button asChild type="button" variant="ghost"><a href={href} onClick={onNavigate ? event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(tab, inboxId ? { inboxId } : undefined); } } : undefined}>{children}</a></Button>;
}

function NoraSourceForm({ route, grants, request, onCancel, onCreated }) {
  const [grantId, setGrantId] = useState(''), [resourceId, setResourceId] = useState('');
  const [error, setError] = useState(null), [busy, setBusy] = useState(false), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const available = usableConnectionGrants(grants), grant = available.find(item => item.id === grantId), selected = selectedGrantResource(grants, grantId, resourceId);
  return <form className="nora-channel-form ains-section-stack" onSubmit={async event => {
    event.preventDefault(); if (busy || !selected) return; const form = new FormData(event.currentTarget); setBusy(true); setError(null);
    try { const result = await request(route, { method: 'POST', body: { name: String(form.get('name')).trim(), grant_id: grantId, external_channel_id: resourceId } }); if (active.current) await onCreated(result.source); }
    catch (err) { if (active.current) setError(friendlyError(err)); }
    finally { if (active.current) setBusy(false); }
  }}>
    <h3>수집 대상 추가</h3>
    <ErrorNotice error={error} />
    {!available.length ? <Notice title="사용할 수 있는 승인 범위가 없습니다">프로젝트 소유자가 계정과 정확한 채널·폴더를 승인해야 수집 대상을 추가할 수 있습니다.</Notice> : <div className="nora-channel-fields">
      <FormField label="승인된 계정·사용 범위"><Select required value={grantId} disabled={busy} onChange={event => { setGrantId(event.target.value); setResourceId(''); }}><option value="" disabled>승인 범위 선택</option>{available.map(item => <option key={item.id} value={item.id}>{item.customer_name} · {item.connection_name} · {PROVIDERS[item.provider] || item.provider}</option>)}</Select></FormField>
      <FormField label="승인된 채널·폴더"><Select required value={resourceId} disabled={busy || !grant} onChange={event => setResourceId(event.target.value)}><option value="" disabled>수집 대상 선택</option>{(grant?.allowed_resources || []).map(resource => <option key={resource.id} value={resource.id}>{resource.label || resource.id}{resource.label ? ` · ${resource.id}` : ''}</option>)}</Select></FormField>
      <FormField label="수집 이름"><Input name="name" required maxLength={200} disabled={busy} placeholder="예: 씨젠 프로젝트 결정 기록" /></FormField>
    </div>}
    <div className="nora-channel-actions"><Button type="submit" variant="secondary" busy={busy} disabled={!selected}>수집 대상 저장</Button><Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>취소</Button></div>
  </form>;
}

function NoraReauthorize({ source, grants, disabled, onSave }) {
  const [grantId, setGrantId] = useState(''), available = usableConnectionGrants(grants, source);
  return <form className="ains-section-stack" onSubmit={async event => { event.preventDefault(); if (!available.some(item => item.id === grantId)) return; await onSave({ grant_id: grantId, expected_version: source.version }); }}>
    <Notice tone="warning" title="기존 수집 대상에 사용 승인 연결">수집 대상과 이력을 유지하면서 같은 커넥터·채널·폴더의 승인 범위를 연결합니다. 연결 후 일정 수집과 이벤트 트리거를 다시 설정해야 합니다.</Notice>
    {available.length ? <FormField label="기존 대상과 일치하는 승인 범위"><Select required value={grantId} disabled={disabled} onChange={event => setGrantId(event.target.value)}><option value="" disabled>승인 범위 선택</option>{available.map(grant => <option key={grant.id} value={grant.id}>{grant.customer_name} · {grant.connection_name}</option>)}</Select></FormField> : <p className="nora-channel-help">같은 Nora 워크스페이스·커넥터와 대상 ID를 포함하는 사용 범위를 먼저 승인하세요.</p>}
    <div className="nora-channel-actions"><Button type="submit" variant="secondary" disabled={disabled || !available.some(item => item.id === grantId)}>기존 수집에 승인 연결</Button></div>
  </form>;
}

function NoraSourceSettings({ source, disabled, saving = false, onSave, onDirty }) {
  const [baseline, setBaseline] = useState(() => configuration(source)), [draft, setDraft] = useState(() => configuration(source));
  const dirty = !sameConfiguration(baseline, draft), stale = !saving && source.version !== baseline.expected_version;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { if (!dirty && source.version !== baseline.expected_version) { const value = configuration(source); setBaseline(value); setDraft(value); } }, [source, dirty, baseline.expected_version]);
  function reset() { const value = configuration(source); setBaseline(value); setDraft(value); }
  return <form className="ains-section-stack" onSubmit={async event => { event.preventDefault(); const result = await onSave({ ...draft, interval_minutes: Number(draft.interval_minutes) }); if (result?.source) { const value = configuration(result.source); setBaseline(value); setDraft(value); } }}>
    <div className="nora-channel-entrypoints">
      <div className="nora-channel-entrypoint ains-section-stack"><label className="nora-channel-check"><Input type="checkbox" checked={draft.schedule_enabled} disabled={disabled} onChange={event => setDraft(previous => ({ ...previous, schedule_enabled: event.target.checked }))} /><span><Clock3 size={16} />일정 수집</span></label><FormField label="수집 간격"><Select required disabled={disabled} value={draft.interval_minutes} onChange={event => setDraft(previous => ({ ...previous, interval_minutes: Number(event.target.value) }))}>{INTERVALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField></div>
      <div className="nora-channel-entrypoint ains-section-stack"><label className="nora-channel-check"><Input type="checkbox" checked={draft.trigger_enabled} disabled={disabled} onChange={event => setDraft(previous => ({ ...previous, trigger_enabled: event.target.checked }))} /><span><Zap size={16} />이벤트 트리거</span></label><p>외부 서비스의 Webhook 연결이 필요합니다. 이벤트 구독은 자동 등록되지 않습니다.</p></div>
    </div>
    {stale ? <Notice tone="warning" title="저장된 설정이 변경되었습니다" actions={<Button type="button" variant="ghost" disabled={disabled} onClick={reset}>최신 설정 불러오기</Button>}>최신 설정을 불러오면 현재 입력한 변경 내용은 새 설정으로 바뀝니다.</Notice> : null}
    <p className="nora-channel-help">설정 저장 후 <strong>수집 연결 적용</strong>을 눌러야 반영됩니다.</p>
    <div className="nora-channel-actions"><Button type="submit" variant="secondary" disabled={disabled || !dirty || stale}>수집 설정 저장</Button>{dirty ? <Button type="button" variant="ghost" disabled={disabled} onClick={reset}>변경 취소</Button> : null}</div>
  </form>;
}

function NoraDeliveries({ source, route, request, canReview, projectId, onNavigate, refreshKey, notify, onChanged }) {
  const [result, setResult] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const [credential, setCredential] = useState(null), [keyBusy, setKeyBusy] = useState(false);
  const lifecycle = useRef({ active: true, sequence: 0 });
  const load = useCallback(async signal => {
    const sequence = ++lifecycle.current.sequence; setLoading(true);
    try { const value = await request(`${route}/${encodeURIComponent(source.id)}/deliveries`, { signal }); if (lifecycle.current.active && sequence === lifecycle.current.sequence) { setResult(value); setError(null); } }
    catch (err) { if (lifecycle.current.active && sequence === lifecycle.current.sequence && err.name !== 'AbortError') setError(friendlyError(err)); }
    finally { if (lifecycle.current.active && sequence === lifecycle.current.sequence) setLoading(false); }
  }, [route, source.id, request]);
  useEffect(() => { lifecycle.current.active = true; const controller = new AbortController(); void load(controller.signal); return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; controller.abort(); }; }, [load, refreshKey, source.status]);
  async function issueKey() {
    if (keyBusy) return; setKeyBusy(true); setError(null); setCredential(null);
    try {
      const value = await request(`${route}/${encodeURIComponent(source.id)}/trigger-key`, { method: 'POST', body: {} });
      if (!lifecycle.current.active) return;
      setCredential({ token: value.token, trigger_url: value.trigger_url });
      await onChanged?.();
    } catch (err) { if (lifecycle.current.active) setError(friendlyError(err)); }
    finally { if (lifecycle.current.active) setKeyBusy(false); }
  }
  async function copyKey() {
    try { await navigator.clipboard.writeText(credential.token); notify?.('이벤트 연결 키를 복사했습니다.'); }
    catch { setError(new Error('연결 키를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.')); }
  }
  const triggerUrl = credential?.trigger_url || result?.trigger_url;
  return <div className="ains-section-stack">
    {canReview && source.trigger_enabled ? <Disclosure open={!source.has_trigger_key || Boolean(credential)}><summary>이벤트 연결 설정{source.has_trigger_key ? ' · 키 발급됨' : ' · 연결 키 필요'}</summary><div className="ains-section-stack">
      <Notice title="이벤트 트리거 연결" actions={<Button type="button" variant="ghost" icon={KeyRound} busy={keyBusy} disabled={source.status !== 'ready'} onClick={issueKey}>{source.has_trigger_key ? '이벤트 연결 키 재발급' : '이벤트 연결 키 발급'}</Button>}>
        외부 서비스의 이벤트를 아래 AINS 수신 주소로 연결하면 Nora가 지정한 채널을 수집합니다. Slack 등의 이벤트 구독이나 전달 브리지 설정은 별도로 필요합니다.{source.has_trigger_key ? ' 키를 재발급하면 이전 키는 즉시 사용할 수 없습니다.' : ''}
      </Notice>
      {triggerUrl ? <FormField label="이벤트 수신 URL"><Input readOnly value={triggerUrl} /></FormField> : null}
      {credential?.token ? <div className="ains-section-stack"><FormField label="이벤트 연결 키 · 이번에만 표시" hint="이 화면을 닫으면 다시 표시되지 않습니다. 연결할 서비스의 비밀값 설정에 보관하세요."><Input type="password" readOnly value={credential.token} autoComplete="off" /></FormField><div className="nora-channel-actions"><Button type="button" variant="secondary" icon={Copy} onClick={copyKey}>연결 키 복사</Button><Button type="button" variant="ghost" onClick={() => setCredential(null)}>키 표시 닫기</Button></div></div> : null}
      <p className="nora-channel-help">POST 요청의 <code>Authorization: Bearer 연결 키</code>와 JSON <code>{'{"event_id":"고유한 이벤트 ID"}'}</code>를 전달합니다. 메시지 본문은 이벤트에 넣지 않으며 등록한 커넥터·수집 대상에서 읽습니다.</p>
    </div></Disclosure> : null}
    <div className="nora-channel-heading"><h4>최근 수집 이력</h4><Button type="button" variant="ghost" icon={RefreshCw} disabled={loading} onClick={() => load()}>이력 새로고침</Button></div>
    <ErrorNotice error={error} onRetry={() => load()} />
    {loading && !result ? <Spinner label="수집 이력을 불러오고 있습니다" /> : result?.deliveries?.length ? <ul className="nora-channel-deliveries">{result.deliveries.map(delivery => {
      const [label, tone] = DELIVERY_STATUS[delivery.status] || [delivery.status, 'quiet'];
      const entry = { manual: '지금 수집 요청', trigger: '이벤트 수집 요청', reconcile: '새 기록 확인' }[delivery.entry_point] || '수집';
      const description = delivery.error_code ? ERRORS[delivery.error_code] || delivery.error_code : delivery.inbox_ids?.length ? `기록 ${delivery.message_count ?? 0}개 · 대화 검토함 ${delivery.inbox_ids.length}건` : delivery.status === 'completed' ? '새로 적재할 기록이 없습니다.' : delivery.status === 'submitted' ? 'Nora 수집 결과는 이후 새 기록 확인 이력에 표시됩니다.' : '수집 및 검토함 적재 결과를 확인하고 있습니다.';
      return <li key={delivery.id} className="nora-channel-delivery"><ListItem variant="system" layout="stacked" data-ctds="list-item" leading={<ListItemLeadingIcon><Inbox size={16} /></ListItemLeadingIcon>} from={`${dateTime(delivery.created_at)} · ${entry}`} body={description} trailing={<Badge tone={tone}>{label}</Badge>} />{delivery.inbox_ids?.length ? <div className="nora-channel-actions">{delivery.inbox_ids.map((id, index) => <NavigationLink key={id} projectId={projectId} tab="channels" inboxId={id} onNavigate={onNavigate}>검토 기록 {index + 1} 열기</NavigationLink>)}</div> : null}</li>;
    })}</ul> : !error ? <p className="nora-channel-help">아직 수집 이력이 없습니다. 파이프라인을 연결한 뒤 지금 수집하거나 이벤트를 전달해 주세요.</p> : null}
  </div>;
}
