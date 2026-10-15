import React, { useState } from 'react';
import { Link2, Power, Unplug } from 'lucide-react';
import { Button } from '../components/ctds/Button/Button';
import { Input } from '../components/ctds/Input/Input';
import { Badge } from '../components/ctds/Badge/Badge';
import { Callout } from '../components/ctds/Callout/Callout';
import { desktopCanReceive, desktopConnectionState, desktopPairCode } from './connection-state.mjs';

export function DesktopConnection({ state, native, pending, profileDirty, api, onAction }) {
  const [code, setCode] = useState(''), [error, setError] = useState(null);
  const connection = state?.desktopConnection, display = desktopConnectionState(connection), busy = Boolean(pending), paired = connection?.paired === true;
  async function pair(event) {
    event.preventDefault(); if (!native || busy || profileDirty) return;
    let value; try { value = desktopPairCode(code); } catch (err) { setError(err.message); return; }
    setError(null); const result = await onAction('pair', () => api.pairDesktop(value));
    if (result?.desktopConnection?.paired) setCode('');
  }
  return <section className="desktop-connection desktop-stack" aria-labelledby="desktop-connection-title">
    <header className="desktop-section-heading"><h2 id="desktop-connection-title">CTAS 작업 자동 수신</h2><Badge variant="soft" size="md" status={display.tone} data-ctds="badge">{display.label}</Badge></header>
    <p className="desktop-caption">{display.message}</p>
    {paired ? <>
      <dl className="desktop-facts"><div><dt>연결 프로젝트</dt><dd>{connection.projectId}</dd></div><div><dt>실행 도구</dt><dd>{connection.provider === 'claude-code' ? 'Claude Code' : connection.provider === 'codex' ? 'Codex' : '확인 필요'}</dd></div>{connection.activeJobId ? <div><dt>진행 중인 요청</dt><dd><code>{connection.activeJobId}</code></dd></div> : null}{connection.lastCheckedAt ? <div><dt>최근 서버 확인</dt><dd><time dateTime={connection.lastCheckedAt}>{new Date(connection.lastCheckedAt).toLocaleString('ko-KR')}</time></dd></div> : null}</dl>
      {connection.lastError ? <Callout tone="warning" title={connection.lastError.message} data-ctds="callout"><code>{connection.lastError.code}</code></Callout> : null}
      {!connection.receiving && !desktopCanReceive(state) ? <Callout tone="warning" title="연결한 프로젝트의 로컬 환경을 확인해 주세요" data-ctds="callout">저장한 프로젝트·실행 도구와 Git 저장소가 연결 정보와 일치해야 자동 수신을 켤 수 있습니다.</Callout> : null}
      <div className="desktop-connection-actions"><Button type="button" size="sm" variant={connection.receiving ? 'outline' : 'primary'} disabled={!native || busy || !connection.receiving && !desktopCanReceive(state)} loading={pending === 'receiving'} leftIcon={<Power size={16} aria-hidden="true" />} onClick={() => void onAction('receiving', () => api.setDesktopReceiving(!connection.receiving))} data-ctds="button">{connection.receiving ? '자동 수신 끄기' : '자동 수신 켜기'}</Button><Button type="button" size="sm" variant="ghost" disabled={!native || busy || Boolean(connection.activeJobId) || connection.pendingResultCount > 0} loading={pending === 'disconnect'} leftIcon={<Unplug size={16} aria-hidden="true" />} onClick={() => void onAction('disconnect', api.disconnectDesktop)} data-ctds="button">연결 해제</Button></div>
      <p className="desktop-caption">처음 연결했다면 웹 프로젝트 설정에서 이 기기를 선택하고 저장한 뒤 수신을 켜 주세요. 수신을 꺼도 이미 시작한 작업은 계속됩니다. 실행 취소는 해당 작업에서 선택하세요. 결과 동기화 뒤 웹에서 변경사항을 검토합니다.</p>
    </> : <form className="desktop-stack" onSubmit={pair}>
      <Input type="password" label="프로젝트 연결 코드" description="CTAS 웹 → 프로젝트 설정 → CTAS Desktop에서 발급합니다. 코드는 이 기기의 연결에 한 번만 사용합니다." size="sm" value={code} onChange={event => { setCode(event.target.value); setError(null); }} maxLength={512} autoComplete="off" spellCheck={false} disabled={!native || busy || profileDirty || !state?.profile} data-ctds="input" />
      {error ? <Callout tone="destructive" role="alert" title={error} data-ctds="callout" /> : null}
      <div><Button type="submit" size="sm" disabled={!native || busy || profileDirty || !state?.profile || !code.trim()} loading={pending === 'pair'} leftIcon={<Link2 size={16} aria-hidden="true" />} data-ctds="button">프로젝트 연결</Button></div>
      {profileDirty ? <p className="desktop-caption">변경한 프로젝트 정보를 저장한 뒤 연결해 주세요.</p> : null}
      {!state?.profile ? <p className="desktop-caption">먼저 아래에서 프로젝트 정보와 작업 폴더를 저장해 주세요.</p> : null}
    </form>}
  </section>;
}
