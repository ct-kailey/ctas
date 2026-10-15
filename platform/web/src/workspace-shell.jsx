import { useEffect, useState } from 'react';
import { Building2, Bell, BookOpen, ChevronRight, FolderKanban, Home, LogOut, Menu, Plus, Settings2, Share2, FileText, Files, ClipboardCheck, CheckSquare, Code2, Library, Users } from 'lucide-react';
import { Sidebar } from './components/ctds/Sidebar/Sidebar';
import { Topbar } from './components/ctds/Topbar/Topbar';
import { IconButton } from './components/ctds/IconButton/IconButton';
import { Avatar } from './components/ctds/Avatar/Avatar';
import { Breadcrumb } from './components/ctds/Breadcrumb/Breadcrumb';
import { Badge, Button, Modal, ROLES, Select, Tabs } from './ui.jsx';
import { WORKFLOW_STEPS, WORKSPACE_VIEWS } from './workspace-flow.mjs';
import './workspace-shell.css';
import { SHARED_VIEW_TABS } from './shared-view-state.mjs';
import { projectKindLabel, projectOptionLabel } from './project-scope.mjs';

const AREA_ICONS = { contract: FileText, collect: Files, context: ClipboardCheck, plan: CheckSquare, execute: Code2, 'domain-guide': BookOpen, knowledge: Library };
function Brand() {
  return <span className="unified-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M2 2h10l8 8v10H10l-8-8zm10 18h10l8 8v2H20l-8-8zM2 22h8v8H2z" /></svg><strong>AINS</strong></span>;
}
export function WorkspaceShell({ user, project, projects, tab, activeStep, alertCount, onNavigate, onProjectSelect, onNewProject, onUpload, canWrite, onLogout, onAppearance, onGuide, sharedView, onShare, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactTopbar, setCompactTopbar] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 560px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 560px)');
    const update = () => setCompactTopbar(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const globalView = tab === 'customers';
  const viewTabs = (activeStep?.navigationTabs || activeStep?.tabs || []).filter(id => !sharedView || SHARED_VIEW_TABS.has(id));
  const run = action => { setMenuOpen(false); action(); };
  const pageChoices = [
    {label: '홈', tab: 'home'}, {label: '알림함', tab: 'alerts'},
    ...WORKFLOW_STEPS.filter(area => !area.management).map(area => ({label: area.label, tab: area.primaryTab, area: area.id})),
    ...(!sharedView ? [{label: '구성원', tab: 'members'}, {label: '저장소·AI 설정', tab: 'settings'}, {label: '고객사·연결 관리', tab: 'customers'}] : []),
  ].filter(item => !sharedView || SHARED_VIEW_TABS.has(item.tab)).map(item => ({
    label: item.label, active: item.area ? activeStep?.id === item.area : tab === item.tab,
    onSelect: () => run(() => onNavigate(item.tab, item.area ? {workflowStep: item.area} : undefined)),
  }));
  function navigation() {
    return <Sidebar aria-label="AINS 탐색" className="unified-sidebar">
      <Sidebar.Header><Brand /></Sidebar.Header>
      <Sidebar.Body><div className="unified-navigation-track">
        <Sidebar.Section>
          <Sidebar.Item icon={<Home size={17}/>} label="홈" active={tab === 'home'} onClick={() => run(() => onNavigate('home'))} />
          <Sidebar.Item icon={<Bell size={17}/>} label="알림함" active={tab === 'alerts'} trailing={alertCount ? <Badge tone="amber">{alertCount}</Badge> : null} onClick={() => run(() => onNavigate('alerts'))} />
          {!sharedView ? <Sidebar.Item icon={<Building2 size={17}/>} label="고객사·연결 관리" active={globalView} onClick={() => run(() => onNavigate('customers'))} /> : null}
        </Sidebar.Section>
        <Sidebar.Separator />
        {!sharedView ? <Sidebar.Section><Sidebar.Item icon={<Plus size={16}/>} label="새 프로젝트" onClick={() => run(onNewProject)} /></Sidebar.Section> : null}
        {project ? <><Sidebar.Separator /><Sidebar.Section title="프로젝트 업무">
          {WORKFLOW_STEPS.filter(area => !area.management && (!sharedView || SHARED_VIEW_TABS.has(area.primaryTab))).map(area => { const Icon = AREA_ICONS[area.id]; return <Sidebar.Item key={area.id} icon={<Icon size={16}/>} label={area.label} active={activeStep?.id === area.id} onClick={() => run(() => onNavigate(area.primaryTab, { workflowStep: area.id }))} />; })}
        </Sidebar.Section>{!sharedView ? <><Sidebar.Separator /><Sidebar.Section title="프로젝트 관리"><Sidebar.Item icon={<Users size={16}/>} label="구성원" active={tab === 'members'} onClick={() => run(() => onNavigate('members'))} /><Sidebar.Item icon={<Settings2 size={16}/>} label="저장소·AI 설정" active={tab === 'settings'} onClick={() => run(() => onNavigate('settings'))} /></Sidebar.Section></> : null}</> : null}
        <Sidebar.Separator /><Sidebar.Section><Sidebar.Item icon={<BookOpen size={16}/>} label="사용 안내" onClick={() => run(onGuide)} /><Sidebar.Item icon={<Settings2 size={16}/>} label="화면 설정" onClick={() => run(onAppearance)} /></Sidebar.Section>
      </div></Sidebar.Body>
      <Sidebar.Footer><div className="unified-account"><Avatar size="sm" name={user.name || user.email} data-ctds="avatar" /><div><strong>{sharedView ? '공유 열람' : user.name || user.email}</strong><small>{sharedView ? '조회 전용 링크' : ROLES[project?.role] || '구성원'}</small></div><IconButton size="sm" icon={<LogOut size={16}/>} aria-label={sharedView ? "공유 열람 종료" : "로그아웃"} onClick={() => run(onLogout)} data-ctds="icon-button" /></div></Sidebar.Footer>
    </Sidebar>;
  }
  return <div className="unified-shell"><a href="#workspace" className="skip-link">본문으로 바로가기</a>
    <aside className="unified-rail">{navigation()}</aside>
    <div className="unified-main"><Topbar className="unified-topbar">
        <Topbar.Leading className="unified-topbar-leading"><IconButton className="unified-mobile-menu" size="sm" icon={<Menu size={20}/>} aria-label="탐색 메뉴 열기" onClick={() => setMenuOpen(true)} data-ctds="icon-button" />
          <Breadcrumb className="unified-breadcrumb" aria-label="현재 위치" data-ctds="breadcrumb">
            <Breadcrumb.Link href="/?tab=home" aria-label="AINS 홈" leftIcon={<Home size={16}/>} onClick={event => { event.preventDefault(); onNavigate('home'); }} />
            {!globalView && project ? compactTopbar ? <Breadcrumb.Ellipsis aria-label="프로젝트 전환" items={projects.map(item => ({label: projectOptionLabel(item), active: item.id === project.id, onSelect: () => onProjectSelect(item.id, tab, activeStep?.id)}))} /> : <Breadcrumb.Menu aria-label="프로젝트 전환" title={project.name} items={projects.map(item => ({label: projectOptionLabel(item), active: item.id === project.id, onSelect: () => onProjectSelect(item.id, tab, activeStep?.id)}))}>{project.name}</Breadcrumb.Menu> : null}
            <Breadcrumb.Menu active aria-label="업무 메뉴 전환" title={activeStep?.label || WORKSPACE_VIEWS[tab]?.label || '홈'} items={pageChoices}>{activeStep?.label || WORKSPACE_VIEWS[tab]?.label || '홈'}</Breadcrumb.Menu>
          </Breadcrumb>
        </Topbar.Leading><Topbar.Center />
        <Topbar.Trailing>{project && !globalView && !sharedView && project.role === 'owner' ? <Button type="button" variant="secondary" icon={Share2} onClick={onShare}>공유</Button> : null}{project && canWrite && tab === 'documents' ? <Button type="button" icon={Plus} onClick={onUpload}>자료 등록</Button> : null}</Topbar.Trailing>
      </Topbar>
      {project && !globalView ? <div className="unified-project-bar"><label htmlFor="project-selector">프로젝트</label><Select id="project-selector" aria-label="프로젝트 선택" value={project.id} onChange={event => onProjectSelect(event.target.value, tab, activeStep?.id)}>{projects.map(item => <option key={item.id} value={item.id}>{projectOptionLabel(item)}</option>)}</Select><Badge tone="quiet">{projectKindLabel(project)}</Badge><span>{ROLES[project.role]}</span></div> : null}
      {viewTabs.length > 1 ? <Tabs value={tab} onValueChange={id => onNavigate(id, { workflowStep: activeStep.id })} variant="underline" size="sm" className="unified-view-container"><Tabs.List className="unified-view-tabs" aria-label={`${activeStep.label} 메뉴`}>{viewTabs.map(id => <Tabs.Trigger key={id} value={id}>{activeStep.id === 'knowledge' && id === 'context' ? '재사용 자료' : WORKSPACE_VIEWS[id]?.label}</Tabs.Trigger>)}</Tabs.List><Tabs.Panel value={tab}>{children}</Tabs.Panel></Tabs> : children}
    </div>
    {menuOpen ? <Modal title="업무 탐색" onClose={() => setMenuOpen(false)}><div className="unified-mobile-navigation">{navigation()}</div></Modal> : null}
  </div>;
}
