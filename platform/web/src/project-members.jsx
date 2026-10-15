import { List, ListItem } from './ctds-lists.jsx';
import { useConfirm } from './confirmation.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Badge, Button, Empty, ErrorNotice, FormField, Modal, Spinner, projectPath, Input, Select, Disclosure } from './ui';
import './project-members.css';

const ROLES = {
  owner: { label: '프로젝트 관리자', description: '구성원·설정 관리, 업무 배정과 최종 검토', tone: 'green' },
  reviewer: { label: '검토자', description: '업무 배정·일정 조정, 요구사항과 결과 검토', tone: 'blue' },
  member: { label: '실무 담당자', description: '자료 등록과 작업 수행, 본인 담당 작업 진행 관리', tone: 'quiet' },
  viewer: { label: '열람자', description: '프로젝트 자료와 진행 현황 조회', tone: 'quiet' },
};

export function ProjectMembers({ projectId, request, userId, onDirty, onOpenWorkItems, onChanged }) {
  const route = `${projectPath(projectId)}/members`;
  const [data, setData] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null), [message, setMessage] = useState('');
  const controller = useRef(null), dirtyCallback = useRef(onDirty);
  dirtyCallback.current = onDirty;
  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setLoading(true); setError(null);
    try { const result = await request(route, { signal: current.signal }); if (!current.signal.aborted) setData(result); }
    catch (err) { if (!current.signal.aborted) { setError(err); setData(null); } }
    finally { if (!current.signal.aborted) setLoading(false); }
  }, [request, route]);
  useEffect(() => { load(); return () => controller.current?.abort(); }, [load]);
  useEffect(() => { dirtyCallback.current?.(Boolean(modal)); return () => dirtyCallback.current?.(false); }, [modal]);
  async function saved(text) {
    setModal(null); setMessage(text); await load(); onChanged?.();
  }
  const members = data?.members || [], canManage = data?.current_role === 'owner';
  return <section className="project-members">
    <header className="project-members-heading"><div>{data ? <Badge tone="quiet">{members.length}명</Badge> : null}</div><div className="project-members-actions">{onOpenWorkItems ? <Button type="button" variant="ghost" onClick={onOpenWorkItems}>작업 담당 배정</Button> : null}<Button type="button" variant="ghost" icon={RefreshCw} busy={loading} onClick={load}>새로고침</Button>{canManage ? <Button type="button" icon={UserPlus} onClick={() => setModal({ mode: 'add' })}>구성원 추가</Button> : null}</div></header>

    {message ? <p className="project-members-message" role="status">{message}</p> : null}
    <ErrorNotice error={error} onRetry={load}/>
    {loading && !data ? <Spinner label="프로젝트 구성원을 불러오고 있습니다"/> : data ? <>

      {members.length ? <List className="project-members-list">{members.map(member => {
        const role = ROLES[member.role], self = member.id === userId;
        return <ListItem key={member.id}><ListItem.Title>{member.name}{self ? <Badge tone="quiet">나</Badge> : null}<Badge tone={role?.tone}>{role?.label || member.role}</Badge></ListItem.Title><ListItem.Meta><span>{member.email}</span></ListItem.Meta><ListItem.Meta><span>담당 작업·영역 {member.assignments.open_tasks + (member.assignments.open_task_areas || 0)}</span><ListItem.MetaDivider /><span>진행 중 질문 {member.assignments.open_questions}</span><ListItem.MetaDivider /><span>확정한 작업 범위 {member.assignments.active_scopes}</span></ListItem.Meta>{canManage ? <><ListItem.Meta><Button type="button" variant="secondary" disabled={self} onClick={() => setModal({ mode: 'role', member })} aria-label={`${member.name} 권한 변경`}>권한 변경</Button><Button type="button" variant="destructive-ghost" disabled={self || member.has_assignment_history} onClick={() => setModal({ mode: 'remove', member })} aria-label={`${member.name} 구성원 해제`}>해제</Button></ListItem.Meta>{self || member.has_assignment_history ? <ListItem.Description>{self ? '본인 권한은 다른 관리자가 변경합니다.' : '담당 이력이 있어 해제 대신 권한을 조정합니다.'}</ListItem.Description> : null}</> : null}</ListItem>;
      })}</List> : <Empty icon={Users} title="구성원이 없습니다">프로젝트 접근 권한을 다시 확인해 주세요.</Empty>}
      <Disclosure><summary>역할별 권한</summary><List>{Object.entries(ROLES).map(([key, role]) => <ListItem key={key}><ListItem.Title>{role.label}</ListItem.Title><ListItem.Description>{role.description}</ListItem.Description></ListItem>)}</List></Disclosure>
      <p className="project-members-footnote"><ShieldCheck size={15} aria-hidden="true"/>{canManage ? '기존 가입 계정만 추가할 수 있습니다. 변경 사항은 프로젝트 활동 기록에 남습니다.' : '구성원 추가와 권한 변경은 프로젝트 관리자에게 요청해 주세요.'}</p>
    </> : null}
    {modal ? <MemberModal key={`${modal.mode}:${modal.member?.id || 'new'}`} {...modal} route={route} request={request} onClose={() => setModal(null)} onSaved={saved}/> : null}
  </section>;
}

function MemberModal({ mode, member, route, request, onClose, onSaved }) {
  const confirm = useConfirm();
  const [email, setEmail] = useState(''), [role, setRole] = useState(member?.role || 'member');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const changed = mode === 'add' ? Boolean(email || role !== 'member') : mode === 'role' && role !== member.role;
  const title = mode === 'add' ? '프로젝트 구성원 추가' : mode === 'remove' ? '프로젝트 구성원 해제' : '구성원 권한 변경';
  const activeAssignments = member && Object.values(member.assignments).some(value => value > 0);
  async function close() { if (!busy && (!changed || await confirm('저장하지 않은 구성원 변경 내용을 닫을까요?'))) onClose(); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      if (mode === 'add') await request(route, { method: 'POST', body: { email: email.trim(), role } });
      else await request(`${route}/${encodeURIComponent(member.id)}`, { method: mode === 'remove' ? 'DELETE' : 'PATCH', body: { expected_role: member.role, ...(mode === 'role' ? { role } : {}) } });
      await onSaved(mode === 'add' ? '프로젝트 구성원을 추가했습니다.' : mode === 'remove' ? '이 프로젝트의 구성원에서 해제했습니다.' : '구성원 권한을 변경했습니다.');
    } catch (err) { setError(err); setBusy(false); }
  }
  return <Modal title={title} onClose={close} busy={busy}><form className="project-member-form" onSubmit={submit}>
    <ErrorNotice error={error}/>
    {mode === 'add' ? <><p>서비스에 이미 가입된 계정을 이 프로젝트에 추가합니다. 계정 생성이나 초대 메일 발송은 하지 않습니다.</p><FormField label="가입한 이메일"><Input type="email" autoComplete="email" required maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)}/></FormField></> : <div className="project-member-selected"><strong>{member.name}</strong><span>{member.email}</span><span>현재 권한: {ROLES[member.role].label}</span></div>}
    {mode === 'remove' ? <p>이 구성원은 이 프로젝트의 자료와 업무 화면에 접근할 수 없게 됩니다. 서비스 계정과 다른 프로젝트의 권한은 유지됩니다.</p> : <FormField label="프로젝트 역할" hint={ROLES[role].description}><Select value={role} disabled={busy} onChange={event => setRole(event.target.value)}>{Object.entries(ROLES).map(([value, info]) => <option key={value} value={value} disabled={value === 'viewer' && Boolean(activeAssignments)}>{info.label}</option>)}</Select></FormField>}
    {mode === 'role' && activeAssignments ? <p className="project-members-footnote">진행 중인 담당 작업·질문을 정리하고 작업 범위를 해제한 후 열람자로 변경할 수 있습니다.</p> : null}
    {mode !== 'remove' && role === 'owner' ? <p className="project-member-owner-note">프로젝트 관리자는 구성원 권한과 프로젝트 설정을 변경할 수 있습니다.</p> : null}
    <div className="project-members-actions project-member-form-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>취소</Button><Button type="submit" variant={mode === 'remove' ? 'danger' : 'primary'} busy={busy} disabled={mode === 'role' && !changed}>{mode === 'add' ? '구성원 추가' : mode === 'remove' ? '이 프로젝트에서 해제' : '권한 변경 저장'}</Button></div>
  </form></Modal>;
}
