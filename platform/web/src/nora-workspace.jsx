import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, RefreshCw } from 'lucide-react';
import { Badge, Button, Disclosure, ErrorNotice, FormField, Input, Select, Spinner, dateTime, projectPath } from './ui.jsx';
import { canSaveNoraConnector, NORA_WORKSPACE_PATTERN, noraAuthorizeUrl, noraWorkspaceView, selectableNoraConnectors } from './nora-workspace-state.mjs';

export function NoraWorkspaceSettings({ project, request, notify, onDirty, onBusy, onChanged, disabled = false }) {
  const route = `${projectPath(project.id)}/nora-workspace`;
  const [workspace, setWorkspace] = useState(null), [workspaceId, setWorkspaceId] = useState('');
  const [connectors, setConnectors] = useState([]), [connectorId, setConnectorId] = useState('');
  const [error, setError] = useState(null), [connectorError, setConnectorError] = useState(null), [busy, setBusy] = useState(false);
  const [authorization, setAuthorization] = useState(null), [authorizationError, setAuthorizationError] = useState(null), [authorizing, setAuthorizing] = useState(false);
  const lifecycle = useRef({ active: true, sequence: 0 });
  const owner = project.role === 'owner', view = noraWorkspaceView(workspace, authorization);
  const dirty = Boolean(!view.registered && workspaceId.trim() || view.registered && connectorId !== (workspace?.connector_id || ''));

  const load = useCallback(async ({ signal } = {}) => {
    const sequence = ++lifecycle.current.sequence;
    const current = () => lifecycle.current.active && sequence === lifecycle.current.sequence;
    try {
      const [workspaceResult, authorizationResult] = await Promise.allSettled([request(route, { signal }), request(`${route}/authorization`, { signal })]);
      if (!current()) return;
      if (workspaceResult.status === 'rejected') throw workspaceResult.reason;
      const response = workspaceResult.value, next = response.workspace || response;
      const auth = authorizationResult.status === 'fulfilled' ? authorizationResult.value.authorization : null;
      setAuthorization(auth); setAuthorizationError(authorizationResult.status === 'rejected' ? new Error('Nora 로그인 연결 상태를 확인하지 못했습니다. 다시 불러와 주세요.') : null);
      setWorkspace(next); setConnectorId(next.connector_id || ''); setError(null); setConnectors([]); setConnectorError(null);
      if (next.workspace_id) setWorkspaceId('');
      if (auth?.connected && noraWorkspaceView(next, auth).canListConnectors) {
        try {
          const result = await request(`${route}/connectors`, { signal });
          if (current()) setConnectors(selectableNoraConnectors(result.connectors));
        } catch (err) { if (current() && err.name !== 'AbortError') setConnectorError(err); }
      }
    } catch (err) { if (current() && err.name !== 'AbortError') setError(err); }
  }, [request, route]);

  useEffect(() => {
    lifecycle.current.active = true;
    const controller = new AbortController(); void load({ signal: controller.signal });
    return () => { lifecycle.current.active = false; lifecycle.current.sequence += 1; controller.abort(); };
  }, [load]);
  useEffect(() => {
    if (!['pending', 'verifying'].includes(workspace?.status)) return;
    const timer = setInterval(() => { if (!document.hidden && !busy) void load(); }, 5000);
    return () => clearInterval(timer);
  }, [workspace?.status, busy, load]);
  useEffect(() => { onDirty?.(dirty || busy && !authorizing); return () => onDirty?.(false); }, [dirty, busy, authorizing, onDirty]);
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false); }, [busy, onBusy]);

  async function mutate(suffix, body, message, method = 'POST') {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await request(`${route}${suffix}`, { method, body });
      if (!lifecycle.current.active) return;
      await load(); await onChanged?.(); notify?.(message);
    } catch (err) {
      if (lifecycle.current.active) { await load(); if (lifecycle.current.active) setError(err); }
    } finally { if (lifecycle.current.active) setBusy(false); }
  }

  async function authorize() {
    if (busy || dirty || disabled || !owner || !authorization?.can_connect) return;
    setAuthorizing(true); setBusy(true); setAuthorizationError(null);
    try {
      const response = await request(`${route}/authorize`, { method: 'POST', body: {} });
      if (!lifecycle.current.active) return;
      const url = noraAuthorizeUrl(response.url);
      if (!url) throw new Error('Invalid authorization destination');
      window.location.assign(url);
    } catch {
      if (lifecycle.current.active) { setAuthorizationError(new Error('Nora 로그인 연결을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')); setBusy(false); setAuthorizing(false); }
    }
  }

  const sync = workspace?.context_sync, selected = connectors.find(connector => connector.id === workspace?.connector_id);
  const locked = disabled || busy;
  const needsAuthorization = authorization && (!authorization.connected || workspace?.error_code === 'NORA_AUTH_REQUIRED');
  return <section id="nora-workspace-connection" className="repository-check" aria-label="Nora 워크스페이스 연결">
    <div className="settings-context-heading"><Link2 size={19} /><h3>Nora 워크스페이스</h3></div>
    <ErrorNotice error={error} onRetry={() => load()} />
    {!workspace ? !error ? <Spinner label="Nora 연결 상태를 불러오고 있습니다" /> : null : <>
      <Badge tone={view.tone}>{view.label}</Badge>
      <p>{view.description}</p>
      {view.registered ? <>
        <p><strong>등록한 워크스페이스 ID</strong><br /><code>{workspace.workspace_id}</code></p>
        <p>이 워크스페이스에서 사용할 분석·실행 기능은 연결과 별도로 준비해야 합니다.</p>
        <ErrorNotice error={authorizationError} onRetry={() => load()} />
        {authorization?.connected && !needsAuthorization ? <p>Nora 로그인 연결됨 · 워크스페이스 접근 확인과 분석·실행 준비 상태는 별도로 확인합니다.</p> : owner && authorization ? <>
          <Button type="button" variant="secondary" busy={authorizing} disabled={locked || dirty || !authorization.can_connect} onClick={authorize}>{authorization.connected ? 'Nora 계정 다시 연결' : 'Nora 계정 연결'}</Button>
          {!authorization.can_connect ? <p>서버의 Nora 로그인 연결 설정이 필요합니다.</p> : null}
        </> : !owner && authorization ? <p>프로젝트 관리자가 Nora 계정을 연결할 수 있습니다.</p> : null}
        <div className="inline-actions">
          <Button type="button" variant="secondary" icon={RefreshCw} disabled={locked || dirty} onClick={() => load()}>상태 새로고침</Button>
          {owner && view.action ? <Button type="button" variant="secondary" busy={busy} disabled={disabled || dirty} onClick={() => mutate(`/${view.action}`, { expected_version: workspace.version }, '등록한 Nora 워크스페이스의 연결 상태를 다시 확인합니다.')}>{view.action === 'reconcile' ? '연결 결과 확인' : '연결 다시 확인'}</Button> : null}
        </div>
        <Disclosure><summary>프로젝트 컨텍스트 동기화</summary>
          {!workspace.capabilities?.context_sync ? <p>서버의 Nora 컨텍스트 동기화 연결을 기다리고 있습니다.</p> : <>
            <p>대기 {sync?.pending || 0}건 · 처리 중 {sync?.syncing || 0}건 · 완료 {sync?.succeeded || 0}건 · 확인 필요 {sync?.failed || 0}건</p>
            <p>{sync?.last_synced_at ? `최근 동기화 ${dateTime(sync.last_synced_at)}` : '아직 완료된 동기화가 없습니다.'}</p>
          </>}
          {sync?.error_code ? <p>컨텍스트 동기화 상태를 확인해 주세요. <code>{sync.error_code}</code></p> : null}
          {owner && view.verified && authorization?.connected && workspace.capabilities?.context_sync && (sync?.failed > 0 || sync?.error_code) ? <Button type="button" variant="secondary" busy={busy} disabled={disabled || dirty} onClick={() => mutate('/retry-sync', { expected_version: workspace.version }, '확인이 필요한 컨텍스트 동기화를 다시 요청했습니다.')}>컨텍스트 동기화 다시 요청</Button> : null}
          <p>분석 결과의 요구사항·결정 반영과 코드·PR 작업은 기존 검토·승인 절차를 따릅니다.</p>
        </Disclosure>
        <Disclosure><summary>Nora Git 연결{selected ? ` · ${selected.name}` : workspace.connector_id ? ' · 선택됨' : ''}</summary>
          {!view.verified ? <p>워크스페이스 접근을 확인한 뒤 Git 연결을 선택할 수 있습니다.</p> : !view.canListConnectors ? <p>서버의 Nora Git 연결 기능을 준비해야 연결 목록을 불러올 수 있습니다.</p> : <>
            <ErrorNotice error={connectorError} onRetry={() => load()} />
            {owner && connectors.length ? <form onSubmit={event => { event.preventDefault(); if (canSaveNoraConnector(workspace, connectors, connectorId, authorization)) void mutate('/connector', { connector_id: connectorId, expected_version: workspace.version }, '이 프로젝트의 Nora Git 연결을 저장했습니다.', 'PUT'); }}>
              <FormField label="이 프로젝트의 Git 연결" hint="등록한 Nora 워크스페이스에서 사용할 GitHub 연결을 선택하세요.">
                <Select value={connectorId} disabled={locked} required onChange={event => setConnectorId(event.target.value)}>
                  <option value="">Git 연결을 선택하세요</option>
                  {workspace.connector_id && !connectors.some(connector => connector.id === workspace.connector_id) ? <option value={workspace.connector_id} disabled>기존 연결 · 확인 필요</option> : null}
                  {connectors.map(connector => <option key={connector.id} value={connector.id} disabled={!connector.enabled}>{connector.name || connector.id}{connector.enabled ? '' : ' · 사용 중지'}</option>)}
                </Select>
              </FormField>
              <Button type="submit" variant="secondary" busy={busy} disabled={disabled || !authorization?.connected || !canSaveNoraConnector(workspace, connectors, connectorId, authorization)}>Git 연결 저장</Button>
            </form> : !connectorError && !connectors.length ? <p>Nora 워크스페이스에 GitHub 연결을 추가한 뒤 상태를 새로고침하세요.</p> : null}
            {!owner ? <p>{selected ? `선택한 연결: ${selected.name || selected.id}. ` : ''}프로젝트 관리자가 Git 연결을 선택할 수 있습니다.</p> : null}
            <p>연결 선택은 코드 변경이나 PR 발행 승인을 대신하지 않습니다.</p>
          </>}
        </Disclosure>
        {workspace.error_code ? <Disclosure><summary>연결 오류 세부정보</summary><code>{workspace.error_code}</code></Disclosure> : null}
      </> : owner ? <form onSubmit={event => { event.preventDefault(); void mutate('', { workspace_id: workspaceId.trim(), expected_version: workspace.version }, 'Nora 워크스페이스 ID를 등록했습니다. 연결 상태를 확인해 주세요.'); }}>
        <FormField label="Nora 워크스페이스 ID" hint="Nora에서 이 프로젝트의 워크스페이스를 만들고 t_로 시작하는 ID를 복사하세요. 등록 후에는 이 프로젝트에 고정됩니다.">
          <Input value={workspaceId} required pattern={NORA_WORKSPACE_PATTERN} maxLength={130} autoComplete="off" spellCheck={false} placeholder="t_…" disabled={locked} onChange={event => setWorkspaceId(event.target.value)} />
        </FormField>
        <Button type="submit" variant="secondary" busy={busy} disabled={disabled || !workspaceId.trim()}>워크스페이스 ID 등록</Button>
      </form> : <p>프로젝트 관리자가 Nora 워크스페이스 ID를 등록할 수 있습니다.</p>}
      {disabled ? <small>작성 중인 프로젝트 설정과 읽기 연결을 먼저 저장해 주세요.</small> : null}
    </>}
  </section>;
}
