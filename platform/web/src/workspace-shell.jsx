import { useState } from 'react';
import { Bell, BookOpen, ChevronRight, FolderKanban, Home, LogOut, Menu, Plus, Settings2, Share2, FileText, Files, ClipboardCheck, CheckSquare, Code2, Library, Users } from 'lucide-react';
import { Sidebar } from './components/ctds/Sidebar/Sidebar';
import { Topbar } from './components/ctds/Topbar/Topbar';
import { IconButton } from './components/ctds/IconButton/IconButton';
import { Avatar } from './components/ctds/Avatar/Avatar';
import { Breadcrumb } from './components/ctds/Breadcrumb/Breadcrumb';
import { Badge, Button, Modal, ROLES, Select, Tabs } from './ui.jsx';
import { WORKFLOW_STEPS, WORKSPACE_VIEWS } from './workspace-flow.mjs';
import './workspace-shell.css';
import { SHARED_VIEW_TABS } from './shared-view-state.mjs';
import { PROJECT_KINDS, projectKindLabel, projectOptionLabel } from './project-scope.mjs';

const AREA_ICONS = { contract: FileText, collect: Files, context: ClipboardCheck, plan: CheckSquare, execute: Code2, 'domain-guide': BookOpen, knowledge: Library };
function Brand() {
  return <span className="unified-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M2 2h10l8 8v10H10l-8-8zm10 18h10l8 8v2H20l-8-8zM2 22h8v8H2z" /></svg><strong>AINS</strong></span>;
}
export function WorkspaceShell({ user, project, projects, tab, activeStep, alertCount, onNavigate, onProjectSelect, onNewProject, onUpload, canWrite, onLogout, onAppearance, onGuide, sharedView, onShare, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const viewTabs = (activeStep?.navigationTabs || activeStep?.tabs || []).filter(id => !sharedView || SHARED_VIEW_TABS.has(id));
  const run = action => { setMenuOpen(false); action(); };
  function navigation() {
    return <Sidebar aria-label="AINS 탐색" className="unified-sidebar">
      <Sidebar.Header><Brand /></Sidebar.Header>
      <Sidebar.Body><div className="unified-navigation-track">
        <Sidebar.Section>
          <Sidebar.Item icon={<Home size={17}/>} label="홈" active={tab === 'home'} asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(() => onNavigate('home'))}>홈</button></Sidebar.Item>
          <Sidebar.Item icon={<Bell size={17}/>} label="알림함" active={tab === 'alerts'} trailing={alertCount ? <Badge tone="amber">{alertCount}</Badge> : null} asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(() => onNavigate('alerts'))}>알림함</button></Sidebar.Item>
        </Sidebar.Section>
        <Sidebar.Separator />
        {Object.entries(PROJECT_KINDS).map(([kind, label]) => {
          const items = projects.filter(item => (item.project_kind || 'unspecified') === kind);
          return items.length ? <Sidebar.Section key={kind} title={label}>{items.map(item => <Sidebar.Item key={item.id} icon={<FolderKanban size={16}/>} label={item.name} active={item.id === project?.id} asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(() => onProjectSelect(item.id))}>{item.name}</button></Sidebar.Item>)}</Sidebar.Section> : null;
        })}
        {!sharedView ? <Sidebar.Section><Sidebar.Item icon={<Plus size={16}/>} label="새 프로젝트" asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(onNewProject)}>새 프로젝트</button></Sidebar.Item></Sidebar.Section> : null}
        {project ? <><Sidebar.Separator /><Sidebar.Section title="프로젝트 업무">
          {WORKFLOW_STEPS.filter(area => !area.management && (!sharedView || SHARED_VIEW_TABS.has(area.primaryTab))).map(area => { const Icon = AREA_ICONS[area.id]; return <Sidebar.Item key={area.id} icon={<Icon size={16}/>} label={area.label} active={activeStep?.id === area.id} asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(() => onNavigate(area.primaryTab, { workflowStep: area.id }))}>{area.label}</button></Sidebar.Item>; })}
        </Sidebar.Section>{!sharedView ? <><Sidebar.Separator /><Sidebar.Section title="프로젝트 관리"><Sidebar.Item icon={<Users size={16}/>} label="구성원" active={tab === 'members'} asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(() => onNavigate('members'))}>구성원</button></Sidebar.Item><Sidebar.Item icon={<Settings2 size={16}/>} label="저장소·AI 설정" active={tab === 'settings'} asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(() => onNavigate('settings'))}>저장소·AI 설정</button></Sidebar.Item></Sidebar.Section></> : null}</> : null}
        <Sidebar.Separator /><Sidebar.Section><Sidebar.Item icon={<BookOpen size={16}/>} label="사용 안내" asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(onGuide)}>사용 안내</button></Sidebar.Item><Sidebar.Item icon={<Settings2 size={16}/>} label="화면 설정" asChild><button data-ctds="sidebar-item" type="button" onClick={() => run(onAppearance)}>화면 설정</button></Sidebar.Item></Sidebar.Section>
      </div></Sidebar.Body>
      <Sidebar.Footer><div className="unified-account"><Avatar size="sm" name={user.name || user.email} data-ctds="avatar" /><div><strong>{sharedView ? '공유 열람' : user.name || user.email}</strong><small>{sharedView ? '조회 전용 링크' : ROLES[project?.role] || '구성원'}</small></div><IconButton size="sm" icon={<LogOut size={16}/>} aria-label={sharedView ? "공유 열람 종료" : "로그아웃"} onClick={() => run(onLogout)} data-ctds="icon-button" /></div></Sidebar.Footer>
    </Sidebar>;
  }
  return <div className="unified-shell"><a href="#workspace" className="skip-link">본문으로 바로가기</a>
    <aside className="unified-rail">{navigation()}</aside>
    <div className="unified-main"><Topbar className="unified-topbar"><IconButton className="unified-mobile-menu" icon={<Menu size={20}/>} aria-label="탐색 메뉴 열기" onClick={() => setMenuOpen(true)} data-ctds="icon-button" /><Breadcrumb className="unified-breadcrumb" aria-label="현재 위치" data-ctds="breadcrumb"><Breadcrumb.Link href="/?tab=home" onClick={event => { event.preventDefault(); onNavigate('home'); }}>AINS</Breadcrumb.Link><Breadcrumb.Link href={`/?${new URLSearchParams({ tab: 'home', ...(project ? {project: project.id} : {}) })}`} onClick={event => { event.preventDefault(); onNavigate('home'); }}>{project?.name || '프로젝트'}</Breadcrumb.Link><Breadcrumb.Current>{activeStep?.label || WORKSPACE_VIEWS[tab]?.label || '홈'}</Breadcrumb.Current></Breadcrumb><Topbar.Spacer/>{project && !sharedView && project.role === 'owner' ? <Button type="button" variant="secondary" icon={Share2} onClick={onShare}>공유</Button> : null}{project && canWrite && tab === 'documents' ? <Button type="button" icon={Plus} onClick={onUpload} disabled={!canWrite}>자료 등록</Button> : null}</Topbar>
      {project ? <div className="unified-project-bar"><label htmlFor="project-selector">프로젝트</label><Select id="project-selector" aria-label="프로젝트 선택" value={project.id} onChange={event => onProjectSelect(event.target.value)}>{projects.map(item => <option key={item.id} value={item.id}>{projectOptionLabel(item)}</option>)}</Select><Badge tone="quiet">{projectKindLabel(project)}</Badge><span>{ROLES[project.role]}</span></div> : null}
      {viewTabs.length > 1 ? <Tabs value={tab} onValueChange={id => onNavigate(id, { workflowStep: activeStep.id })} variant="underline" size="sm" className="unified-view-container"><Tabs.List className="unified-view-tabs" aria-label={`${activeStep.label} 메뉴`}>{viewTabs.map(id => <Tabs.Trigger key={id} value={id}>{activeStep.id === 'knowledge' && id === 'context' ? '재사용 자료' : WORKSPACE_VIEWS[id]?.label}</Tabs.Trigger>)}</Tabs.List><Tabs.Panel value={tab}>{children}</Tabs.Panel></Tabs> : children}
    </div>
    {menuOpen ? <Modal title="업무 탐색" onClose={() => setMenuOpen(false)}><div className="unified-mobile-navigation">{navigation()}</div></Modal> : null}
  </div>;
}
