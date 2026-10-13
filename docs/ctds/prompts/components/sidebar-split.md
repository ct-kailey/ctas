# SidebarSplit

### 원칙
2단 사이드바 — 좌측 좁은 **Rail**(아이콘 only 탭) + 우측 **Panel**(활성 탭의 상세 메뉴). VS Code·Linear 스타일 "활동 바 + 사이드 패널" 조합. 단일 폭 Sidebar가 메뉴 수를 다 담지 못할 때, 또는 완전히 다른 영역을 전환하는 네비게이션에서.

메모리 주의: **"2단 쉘은 SidebarSplit 쓰지 말고 바깥 flex로 Rail+Sidebar 직접 조립"** ([Sidebar scroll trap](../../memory/feedback_sidebar_scroll.md)). 그 함정은 CtdsSidebar.Body 안 섹션이 뭉개지는 상황. SidebarSplit 자체는 panel 안 콘텐츠가 **menu/section 구조**일 때 안전하게 쓴다 — 복잡한 폼·검색 결과를 panel에 넣을 거면 Rail + Sidebar를 바깥 flex로 직접 조립.

### Do
- 각 section의 `icon`은 Icon 인스턴스로. `label`은 rail 버튼의 `aria-label` + panel 헤더 타이틀로 재사용.
- panel 안은 `<SidebarSplit.Section title="…">` + `<SidebarSplit.Item icon label>` 조합을 기본으로. 섹션 하나에 Item 5~10개 수준이 적정.
- 좁은 공간이 필요하면 `panelOpen={false}` + onPanelOpenChange로 접기 토글. Rail만 남고 Panel은 숨음.
- 섹션이 **active일 때 Rail 아이콘은 `secondary` variant**로 자동 전환 — 사용자가 override하지 말 것.

### Don't
- panel 안에 긴 폼·에디터를 넣지 않는다 — SidebarSplit은 "메뉴 전환" 자리. 콘텐츠는 메인 영역에.
- Rail 섹션을 **6개 이상** 쌓지 않는다. 세로 공간상 7~8개부터 하단이 잘림. 그 이상이면 메뉴 구조 재검토.
- `defaultActiveId`를 지정하지 않고 섹션 리스트를 조건부 렌더링하지 않는다 — 초기값이 비면 panel이 비어 보임.
- 2단 쉘 바깥(앱 전체) 레이아웃에 SidebarSplit을 **직접** 쓰지 않는다. 바깥 쉘은 flex로 Rail + CtdsSidebar를 수동 조립 — 메모리 참조.

### Props 시그니처
```tsx
<SidebarSplit
  sections={SidebarSplitSection[]}        // { id, icon, label, panel }[]
  brand?={ReactNode}                       // rail 상단 로고
  railFooter?={ReactNode}
  panelFooter?={ReactNode}
  activeId?={string}                       // controlled
  defaultActiveId?={string}
  onActiveChange?={(id: string) => void}
  panelOpen?={boolean}                     // controlled
  defaultPanelOpen?={boolean}              // default: true
  onPanelOpenChange?={(open: boolean) => void}
>
```

Compound sub:
- `<SidebarSplit.Section title>` — panel 안 그룹 (role="group")
- `<SidebarSplit.Item icon label active trailing shortcut hasSubmenu onClick>` — MenuItem 래퍼

### 조합 예시
```tsx
const sections: SidebarSplitSection[] = [
  {
    id: "files",
    icon: <Icon name="folder" />,
    label: "파일",
    panel: (
      <>
        <SidebarSplit.Section title="최근">
          <SidebarSplit.Item icon={<Icon name="file" />} label="README.md" />
          <SidebarSplit.Item icon={<Icon name="file" />} label="plan.md" />
        </SidebarSplit.Section>
      </>
    ),
  },
  {
    id: "search",
    icon: <Icon name="search" />,
    label: "검색",
    panel: <Input placeholder="검색…" />,
  },
];

<SidebarSplit sections={sections} defaultActiveId="files" />
```

### 관련
- [[components/sidebar]] — 단일 폭 사이드바
- [[components/menu-item]] — panel item의 베이스
- [[components/icon-button]] — rail 버튼
