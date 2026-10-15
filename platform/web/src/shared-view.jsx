import { List, ListItem } from './ctds-lists.jsx';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Copy, Link2, ShieldCheck } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, FormField, Input, Modal, Notice, Select, Spinner, dateTime } from './ui.jsx';
import './shared-view.css';

export const SharedViewContext = createContext(null);
export const useSharedView = () => useContext(SharedViewContext);

export function SharedViewBanner({ sharedView, onExit }) {
  return <Notice className="shared-view-banner" icon={<ShieldCheck size={18} />} title={`${sharedView.source_user_name || '프로젝트 담당자'}님 프로젝트 공유 열람`}>
    <div className="shared-view-banner-content"><p>조회 전용 · {dateTime(sharedView.expires_at)} 만료 · {sharedView.label}</p><Button type="button" variant="ghost" onClick={onExit}>공유 열람 종료</Button></div>
  </Notice>;
}

export function SharedViewManager({ projects, currentProject, request, notify, onClose }) {
  const owned = projects.filter(project => project.role === 'owner');
  const [selected, setSelected] = useState(() => owned.some(project => project.id === currentProject?.id) ? [currentProject.id] : []);
  const [label, setLabel] = useState(() => `${currentProject?.name || '프로젝트'} 공유`);
  const [hours, setHours] = useState('168');
  const [links, setLinks] = useState(null), [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const load = useCallback(async signal => { const result = await request('/api/shared-views', { signal }); setLinks(result.links); }, [request]);
  useEffect(() => { const controller = new AbortController(); load(controller.signal).catch(error => { if (error.name !== 'AbortError') setError(error); }); return () => controller.abort(); }, [load]);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError(null); setCreated(null);
    try {
      const result = await request('/api/shared-views', { method: 'POST', body: { project_ids: selected, label: label.trim(), expires_in_hours: Number(hours) } });
      setCreated(result); await load();
    } catch (error) { setError(error); } finally { setBusy(false); }
  }
  async function revoke(link) {
    setBusy(true); setError(null);
    try { await request(`/api/shared-views/${encodeURIComponent(link.id)}/revoke`, { method: 'POST', body: {} }); if (created?.link?.id === link.id) setCreated(null); await load(); notify('공유 링크를 종료했습니다. 이 링크로 더 이상 조회할 수 없습니다.'); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(created.share_url); notify('조회 전용 공유 링크를 복사했습니다.'); }
    catch { setError(new Error('자동 복사를 사용할 수 없습니다. 아래 링크를 직접 선택해 복사해 주세요.')); }
  }
  return <Modal title="조회 전용 링크 공유" onClose={onClose} busy={busy}>
    <div className="modal-body shared-view-manager">
      <p className="form-intro">선택한 프로젝트의 문서·대화·계약·작업 이력을 로그인 없이 볼 수 있습니다. 공유 대상에게만 링크를 전달해 주세요. 등록·수정·AI 실행·설정 변경은 허용되지 않습니다.</p>
      <form onSubmit={create}>
        <fieldset disabled={busy}><legend>공유할 프로젝트</legend><div className="shared-view-projects">{owned.map(project => <label key={project.id} className="checkbox-label"><Input type="checkbox" checked={selected.includes(project.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, project.id] : ids.filter(id => id !== project.id))} /><span>{project.name}</span></label>)}</div>
          <FormField label="공유 이름"><Input value={label} onChange={event => setLabel(event.target.value)} required maxLength={120} /></FormField>
          <FormField label="유효 기간"><Select value={hours} onChange={event => setHours(event.target.value)}><option value="24">1일</option><option value="168">7일</option></Select></FormField>
          <Button type="submit" icon={Link2} busy={busy} disabled={!selected.length || !label.trim()}>선택한 프로젝트 공유 링크 만들기</Button>
        </fieldset>
      </form>
      {created ? <section className="shared-view-created" aria-label="생성한 공유 링크"><h3>공유 링크가 준비되었습니다</h3><p>{dateTime(created.link.expires_at)}까지 열람 가능합니다. 이 링크는 다시 표시되지 않으므로 복사해 보관하세요.</p><FormField label="공유 링크"><Input value={created.share_url} readOnly onFocus={event => event.target.select()} /></FormField><Button type="button" variant="secondary" icon={Copy} onClick={copy}>링크 복사</Button></section> : null}
      <ErrorNotice error={error} />
      <section className="shared-view-links" aria-label="공유 링크 이력"><h3>발급한 공유 링크</h3>{links === null ? <Spinner /> : links.length ? <List>{links.map(link => <ListItem key={link.id} trailing={<Badge tone={link.active ? 'green' : 'quiet'}>{link.revoked_at ? '공유 종료' : link.active ? '열람 가능' : '만료'}</Badge>}><ListItem.Title>{link.label}</ListItem.Title><ListItem.Description>{link.project_ids.map(id => projects.find(project => project.id === id)?.name || '접근 권한이 변경된 프로젝트').join(', ')}</ListItem.Description><ListItem.Meta><span>{link.source_user_name}</span><ListItem.MetaDivider/><span>{dateTime(link.expires_at)} 만료</span></ListItem.Meta>{link.active ? <ListItem.Meta><Button type="button" variant="secondary" disabled={busy} onClick={() => revoke(link)}>공유 종료</Button></ListItem.Meta> : null}</ListItem>)}</List> : <Empty compact title="발급한 공유 링크가 없습니다">공유할 프로젝트를 선택해 링크를 만들 수 있습니다.</Empty>}</section>
    </div>
    <footer className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>닫기</Button></footer>
  </Modal>;
}
