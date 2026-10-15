import { List, ListItem } from './ctds-lists.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, RefreshCw } from 'lucide-react';
import { Badge, Button, ErrorNotice, FormField, Input, Notice, Select, Spinner, dateTime } from './ui.jsx';
import { useConfirm } from './confirmation.jsx';
import { createDevelopmentReadSession } from './ai-development-state.mjs';
import './desktop-execution-settings.css';
import { desktopDeviceState, desktopDevices, desktopOpenUrl, desktopTaskMessage } from './desktop-connection-state.mjs';

export function DesktopOpenButton({ projectId, disabled }) {
  const url = desktopOpenUrl(projectId);
  return url ? <Button type="button" asChild variant="secondary" disabled={disabled}><a href={url}><Monitor size={16} aria-hidden="true" />CTAS Desktop 열기</a></Button> : null;
}
export function DesktopTaskNotice({ task, settings, projectId, sharedView }) {
  const message = desktopTaskMessage(task, settings);
  return message ? <Notice title={message.title} actions={!sharedView && message.open ? <DesktopOpenButton projectId={projectId} /> : undefined}>{message.body}</Notice> : null;
}
export function DesktopExecutionSettings({ route, projectId, repositoryUrl, request, draft, savedSettings, setDraft, owner, sharedView, disabled, onBusy }) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [readError, setReadError] = useState(null), [loading, setLoading] = useState(true), [pending, setPending] = useState(null), [pairing, setPairing] = useState(null), [now, setNow] = useState(Date.now);
  const session = useRef(null), active = useRef(false), operation = useRef(null), confirm = useConfirm();
  if (!session.current) session.current = createDevelopmentReadSession();
  const load = useCallback(async () => {
    if (sharedView) return;
    setLoading(true); const result = await session.current.read(request, `${route}/desktop/devices`, { skipIfPending: true });
    if (result.data) { setData(result.data); setReadError(null); } else if (result.error) setReadError(result.error);
    if (!result.ignored && active.current) setLoading(false);
  }, [route, request, sharedView]);
  useEffect(() => {
    active.current = true; session.current.open(); setData(null); setPairing(null); setError(null); setReadError(null); setLoading(!sharedView); void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
    return () => { active.current = false; clearInterval(timer); session.current.close(); };
  }, [load]);
  useEffect(() => { onBusy?.(Boolean(pending)); return () => onBusy?.(false); }, [onBusy, pending]);
  useEffect(() => { if (!pairing) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [pairing]);
  const devices = desktopDevices(data, draft.sdk_provider), selected = devices.find(device => device.id === draft.desktop_device_id), all = Array.isArray(data?.devices) ? data.devices : [];
  const expired = pairing && Date.parse(pairing.expires_at) <= now;
  async function generate() {
    if (!owner || disabled || operation.current) return;
    const token = Symbol('pairing'); operation.current = token; setPending('pairing'); setError(null); setPairing(null);
    try { const result = await request(`${route}/desktop/pairings`, { method: 'POST', body: {} }); if (active.current && operation.current === token) { setNow(Date.now()); setPairing(result); } }
    catch (err) { if (active.current && operation.current === token) setError(err); }
    finally { if (operation.current === token) { operation.current = null; if (active.current) setPending(null); } }
  }
  async function revoke(device) {
    if (!owner || disabled || operation.current || !await confirm(`${device.device_name || '이 기기'}의 프로젝트 연결을 해제할까요? 새 작업을 받을 수 없으며 진행 중인 작업의 결과 전송도 중단될 수 있습니다.`)) return;
    const token = Symbol('revoke'); operation.current = token; setPending(device.id); setError(null);
    try { await request(`${route}/desktop/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' }); if (active.current && operation.current === token) { if (draft.desktop_device_id === device.id) setDraft(current => ({ ...current, desktop_device_id: '' })); await load(); } }
    catch (err) { if (active.current && operation.current === token) setError(err); }
    finally { if (operation.current === token) { operation.current = null; if (active.current) setPending(null); } }
  }
  if (sharedView) return <p className="task-auto-help">공유 화면에서는 데스크톱 연결 정보를 표시하지 않습니다.</p>;
  return <section className="ains-section-stack desktop-execution-settings" aria-label="CTAS Desktop 실행 연결">
    <Notice title="웹에서 요청하고 데스크톱에서 개발합니다" actions={<DesktopOpenButton projectId={projectId} disabled={Boolean(pending)} />}>코드 발급 → 앱에서 연결 → 아래 기기 선택·설정 저장 → 앱 자동 수신 켜기 순서로 준비하세요. 작업을 진행 중으로 옮기면 개발 결과를 동기화합니다. 앱 열기만으로 개발을 시작하지 않습니다.</Notice>
    <FormField label="앱에 입력할 프로젝트 ID"><Input readOnly value={projectId} /></FormField>
    <FormField label="앱에 입력할 대상 저장소"><Input readOnly value={repositoryUrl || ""} placeholder="프로젝트에 대상 저장소를 먼저 저장해 주세요." /></FormField>
    <FormField label="데스크톱 개발 도구"><Select value={draft.sdk_provider} disabled={!owner || disabled || Boolean(pending)} onChange={event => { setPairing(null); setDraft(current => ({ ...current, sdk_provider: event.target.value, desktop_device_id: '' })); }}><option value="codex">Codex</option><option value="claude-code">Claude Code</option></Select></FormField>
    <FormField label="작업을 받을 기기" hint="기기가 꺼져 있으면 요청은 대기합니다. 앱에서 자동 수신을 켜야 개발을 시작합니다."><Select value={draft.desktop_device_id || ''} disabled={!owner || disabled || Boolean(pending)} onChange={event => setDraft(current => ({ ...current, desktop_device_id: event.target.value }))}><option value="">기기 선택</option>{draft.desktop_device_id && !selected ? <option value={draft.desktop_device_id} disabled>현재 기기 · 연결 확인 필요</option> : null}{devices.map(device => <option value={device.id} key={device.id}>{device.device_name || 'CTAS Desktop'} · {desktopDeviceState(device).label}</option>)}</Select></FormField>
    <ErrorNotice error={error || readError} onRetry={load} />
    {owner ? <><div className="desktop-settings-actions"><Button type="button" variant="secondary" busy={pending === 'pairing'} disabled={disabled || Boolean(pending)} onClick={generate}>새 기기 연결 코드 발급</Button><Button type="button" variant="ghost" icon={RefreshCw} disabled={Boolean(pending) || loading} onClick={load}>기기 새로고침</Button></div>
      {pairing ? <Notice tone={expired ? 'warning' : 'neutral'} title={expired ? '연결 코드가 만료되었습니다' : 'CTAS Desktop에 연결 코드를 입력하세요'} actions={<Button type="button" variant="secondary" onClick={() => setPairing(null)}>코드 숨기기</Button>}><div className="ains-section-stack">{!expired ? <FormField label="일회용 연결 코드"><Input value={pairing.code} readOnly autoComplete="off" spellCheck={false} /></FormField> : null}<p>만료 {dateTime(pairing.expires_at)} · 코드를 입력한 기기에 이 프로젝트의 작업 실행 권한이 연결됩니다.</p></div></Notice> : null}</> : <p className="task-auto-help">관리자만 기기를 연결하고 실행 방식을 변경할 수 있습니다.</p>}
    {!data && loading ? <Spinner label="연결한 기기를 확인하고 있습니다" /> : all.length ? <List className="ains-section-stack">{all.map(device => <ListItem key={device.id}><ListItem.Title>{device.device_name || 'CTAS Desktop'}</ListItem.Title><ListItem.Meta><Badge tone={desktopDeviceState(device).tone}>{desktopDeviceState(device).label}</Badge><span>{device.provider === 'claude-code' ? 'Claude Code' : 'Codex'}</span><ListItem.MetaDivider /><time dateTime={device.last_seen_at}>최근 확인 {dateTime(device.last_seen_at)}</time></ListItem.Meta><ListItem.Description>{device.repository_url}</ListItem.Description>{owner && !device.revoked_at ? <div><Button type="button" variant="ghost" busy={pending === device.id} disabled={disabled || Boolean(pending)} onClick={() => void revoke(device)}>이 기기 연결 해제</Button></div> : null}</ListItem>)}</List> : <p className="task-auto-help">연결한 기기가 없습니다. 앱에서 연결을 마치면 기기를 선택하고 이 설정을 저장해 주세요.</p>}
  </section>;
}

export function DesktopArtifactSummary({ artifact }) {
  if (!artifact?.desktop_execution) return null;
  return <section className="ains-section-stack desktop-artifact-summary" aria-label="데스크톱 작업 요약"><div className="desktop-settings-actions"><h3>데스크톱 작업 요약</h3><Badge tone={artifact.desktop_execution.status === 'completed' ? 'green' : 'amber'}>{({ completed: '실행 완료 · 검토 필요', failed: '실행 실패', cancelled: '실행 취소됨', timed_out: '실행 시간 초과', interrupted: '실행 중단됨' })[artifact.desktop_execution.status] || '결과 수신됨'}</Badge></div>{artifact.summary ? <p className="desktop-result-summary">{artifact.summary}</p> : <p className="task-auto-help">실행 도구가 작업 요약을 남기지 않았습니다. 코드 변경과 실행 기록을 확인해 주세요.</p>}<p className="task-auto-help">임시 구현이나 남은 작업은 요약과 코드를 대조해 검토하세요. 구조화된 임시 구현 이력은 검토자가 기록해야 합니다.</p>{Array.isArray(artifact.desktop_execution.limitations) && artifact.desktop_execution.limitations.length ? <List className="ains-prose-list">{artifact.desktop_execution.limitations.map((text, index) => <ListItem key={index}><ListItem.Title>{text}</ListItem.Title></ListItem>)}</List> : null}{artifact.desktop_execution.received_at ? <p className="task-auto-help">결과 수신 {dateTime(artifact.desktop_execution.received_at)}</p> : null}</section>;
}
