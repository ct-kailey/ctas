import { useState } from 'react';
import { Bell, BookOpen, ChevronRight, FolderKanban, Home, LogOut, Menu, Plus, Settings2, X } from 'lucide-react';
import { Sidebar } from './components/ctds/Sidebar/Sidebar';
import { Topbar } from './components/ctds/Topbar/Topbar';
import { Badge, Button, Modal, ROLES } from './ui.jsx';
import { WORKFLOW_STEPS, WORKSPACE_VIEWS } from './workspace-flow.mjs';
import './workspace-shell.css';

function Brand() {
  return <span className="unified-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M2 2h10l8 8v10H10l-8-8zm10 18h10l8 8v2H20l-8-8zM2 22h8v8H2z" /></svg><strong>AINS</strong></span>;
}
export function WorkspaceShell({ user, project, projects, tab, activeStep, alertCount, onNavigate, onProjectSelect, onNewProject, onUpload, canWrite, onLogout, onAppearance, onGuide, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const run = action => { setMenuOpen(false); action(); };
  function navigation() {
    return <Sidebar aria-label="AINS 탐색" className="unified-sidebar">
      <Sidebar.Header><Brand /></Sidebar.Header>
      <Sidebar.Body>
        <Sidebar.Section>
          <Sidebar.Item icon={<Home size={17}/>} label="홈" active={tab === 'home'} asChild><button type="button" onClick={() => run(() => onNavigate('home'))}>홈</button></Sidebar.Item>
          <Sidebar.Item icon={<Bell size={17}/>} label="알림함" active={tab === 'alerts'} trailing={alertCount ? <Badge tone="amber">{alertCount}</Badge> : null} asChild><button type="button" onClick={() => run(() => onNavigate('alerts'))}>알림함</button></Sidebar.Item>
        </Sidebar.Section>
        <Sidebar.Separator />
        <Sidebar.Section title="내 프로젝트">
          {projects.map(item => <Sidebar.Item key={item.id} icon={<FolderKanban size={16}/>} label={item.name} active={item.id === project?.id} asChild><button type="button" onClick={() => run(() => onProjectSelect(item.id))}>{item.name}</button></Sidebar.Item>)}
          <Sidebar.Item icon={<Plus size={16}/>} label="새 프로젝트" asChild><button type="button" onClick={() => run(onNewProject)}>새 프로젝트</button></Sidebar.Item>
        </Sidebar.Section>
        {project ? <><Sidebar.Separator /><Sidebar.Section title="프로젝트 업무">
          {WORKFLOW_STEPS.map((step,index) => <Sidebar.Item key={step.id} icon={<span className="unified-step-number">{String(index + 1).padStart(2,'0')}</span>} label={step.label} active={activeStep?.id === step.id} asChild><button type="button" onClick={() => run(() => onNavigate(step.primaryTab, { workflowStep: step.id }))}>{step.label}</button></Sidebar.Item>)}
        </Sidebar.Section></> : null}
        <Sidebar.Separator /><Sidebar.Section><Sidebar.Item icon={<BookOpen size={16}/>} label="사용 안내" asChild><button type="button" onClick={() => run(onGuide)}>사용 안내</button></Sidebar.Item><Sidebar.Item icon={<Settings2 size={16}/>} label="화면 설정" asChild><button type="button" onClick={() => run(onAppearance)}>화면 설정</button></Sidebar.Item></Sidebar.Section>
      </Sidebar.Body>
      <Sidebar.Footer><div className="unified-account"><span className="avatar">{(user.name || user.email).slice(0,1)}</span><div><strong>{user.name || user.email}</strong><small>{ROLES[project?.role] || '구성원'}</small></div><button className="icon-button" type="button" aria-label="로그아웃" onClick={() => run(onLogout)}><LogOut size={16}/></button></div></Sidebar.Footer>
    </Sidebar>;
  }
  return <div className="unified-shell"><a href="#workspace" className="skip-link">본문으로 바로가기</a>
    <aside className="unified-rail">{navigation()}</aside>
    <div className="unified-main"><Topbar className="unified-topbar"><button className="icon-button unified-mobile-menu" type="button" aria-label="탐색 메뉴 열기" onClick={() => setMenuOpen(true)}><Menu size={20}/></button><nav className="unified-breadcrumb" aria-label="현재 위치"><button type="button" onClick={() => onNavigate('home')}>AINS</button><ChevronRight size={13}/><span>{project?.name || '프로젝트'}</span>{activeStep ? <><ChevronRight size={13}/><strong>{activeStep.label}</strong></> : <><ChevronRight size={13}/><strong>{WORKSPACE_VIEWS[tab]?.label || '홈'}</strong></>}</nav><Topbar.Spacer/>{project ? <Button type="button" icon={Plus} onClick={onUpload} disabled={!canWrite}>자료 등록</Button> : null}</Topbar>
      {project ? <div className="unified-project-bar"><label htmlFor="project-selector">프로젝트</label><select id="project-selector" aria-label="프로젝트 선택" value={project.id} onChange={event => onProjectSelect(event.target.value)}>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span>{ROLES[project.role]}</span>{activeStep ? <p>{activeStep.description}</p> : <p>자료부터 결정과 실행까지, 프로젝트의 맥락을 이어갑니다.</p>}</div> : null}
      {activeStep ? <nav className="unified-view-tabs" aria-label={`${activeStep.label} 메뉴`}>{activeStep.tabs.map(id => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => onNavigate(id, {workflowStep: activeStep.id})}>{activeStep.id === 'knowledge' && id === 'context' ? '지식 보관함' : WORKSPACE_VIEWS[id]?.label}</button>)}</nav> : null}
      {children}
    </div>
    {menuOpen ? <Modal title="업무 탐색" onClose={() => setMenuOpen(false)}><div className="unified-mobile-navigation">{navigation()}</div></Modal> : null}
  </div>;
}
