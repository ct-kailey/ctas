# Sidebar

### 원칙
좌측 세로 nav. **라우팅 전용** — Tabs/필터는 쓸 곳이 아님. Header(고정) + Body(스크롤) + Footer(고정) 3영역 세로 쉘에, Brand + Section + Item + Separator + Profile을 compound로 조합. `collapsed`로 icon-only 축소. Item은 [[components/menu-item]]을 그대로 어댑트 — 시각·상태 규칙 공유.

### 좌우 축 단일화 (중요)
Sidebar 내부 **모든 좌우 padding은 단일 축 `--sidebar-pad-x`** (= expanded `--space-4`, collapsed `--space-2`). Header·Section·Separator·Footer·Profile이 각자 복제. Body에는 padding-inline을 **절대** 걸지 않는다 — 스크롤바가 가장자리에 안 붙는다.

사이드바 안에 추가로 끼워 넣는 블록(검색 input, Primary 액션 버튼, 안내 Callout 등)도 반드시 좌우 padding을 `var(--sidebar-pad-x)`로 복제. 임의로 `--space-3` 등을 쓰면 Header·Section과 축이 어긋나 "뭔가 안 맞음" 느낌의 1순위 원인이 된다.

사이드바 안쪽 세로 간격은 `--space-2`(섹션 사이·블록 사이) / `--space-1`(섹션 헤더 아래) / `--space-0_5`(아이템 사이) 세 리듬만. 다른 값 금지.

### 사이드바 안의 Input
사이드바 내부 Input(검색 등)은 **`variant="outline"` 또는 `filled`만**. `line`은 **금지** — 사이드바 안쪽은 ghost MenuItem들이 선 없이 깔려 있어 line variant의 밑줄 하나가 그 리듬에 섞이면 "검색창이 비어 보임"으로 읽힘. 전역 Input 기본은 line이지만 사이드바는 예외.

**size는 `md` 기본**. 사이드바가 narrow라서 sm으로 좁히지 말 것 — 사이드바 밀도는 Item 쪽이 담당하고(ghost 리듬), 검색 Input은 "쓰기·읽기 둘 다 자연스러운" md가 더 어울림. CTDS 전체 컴포넌트가 md 기본이라 그 리듬과도 어긋나지 않음.

### Body에 fade mask 금지 (중요)
`Sidebar.Body`에 `mask-image: linear-gradient(...)` 류의 상단 fade **금지**. "스크롤 콘텐츠가 Header 아래로 자연스럽게 사라지도록" 넣는 fade지만, 소비처는 Body 안 최상단에 **고정 블록**(예: primary "새 대화" 버튼 + 검색 Input)을 꽂는 경우가 흔하다. 이때 fade가 그 블록 상단 ~10–15px를 투명하게 깎아 **primary solid 버튼 위에 "흰 입체 바"가 올라간 착시**를 만든다. computed style엔 shadow·gradient 하나도 없는데 입체감이 보이면 100% 이 원인. Header와 Body의 분리는 Header padding-bottom과 border로만 처리.

### Footer 위 분리선 (조건부)
`Sidebar.Footer`는 **기본은 상단 border 없음** — 사이드바 안쪽은 ghost 리듬이라 가로선 하나가 들어가면 구획이 과해져 밸런스가 깨짐. **Body가 스크롤 가능할 때만**(`SidebarRoot`가 ResizeObserver로 감지해 Footer에 `data-overflow` 토글) 상단 hairline이 자동으로 켜진다 — 스크롤되는 콘텐츠가 Footer 뒤로 깔릴 때만 분리가 필요하기 때문. 짧은 메뉴에서는 선 없이 깔끔. 소비처가 수동으로 `border-top`을 꽂지 말 것.

line-heavy 톤(spare 같은 콘솔형 Theme)에서 Footer 분리선을 항상 보여주고 싶으면 Theme CSS에서 `.sidebar-footer { border-top: ... }` 같은 override로 해결 — 컴포넌트 기본은 조건부 유지.

### 중첩 금지: Profile trailing에 IconButton
`Sidebar.Profile`(=IdentityButton preset)은 **자체가 button 요소**라, `trailing`에 `IconButton` 등 또 다른 button을 넣으면 React hydration 에러(button cannot be a descendant of button)가 난다. 프로필 옆에 점 세 개 메뉴가 필요하면 **`Sidebar.Profile` 자체를 `DropdownMenu.Trigger asChild`로 감싸는** 쪽이 표준. trailing에는 non-interactive 요소(`<Icon name="caret-down" />` 등)만.

### 3영역 구조 (중요)
Sidebar는 **Header / Body / Footer 세 영역으로 강제 분리**된다. 역할 혼동이 레이아웃 사고의 1순위 원인.

| 영역 | 스크롤 | 레이아웃 | 담는 것 |
|---|---|---|---|
| `Sidebar.Header` | ❌ 고정 | **가로 flex 행** (brand symbol + wordmark 나란히) | `Sidebar.Brand` 전용 |
| `Sidebar.Body` | ✅ 세로 스크롤 | 세로 flex 열 | `Sidebar.Section` · `Sidebar.Separator` 전부 여기 |
| `Sidebar.Footer` | ❌ 고정 | 가로 flex 행 | `Sidebar.Profile` 또는 보조 액션 |

Header는 **가로 행**이기 때문에 Section을 넣으면 nav 전체가 가로 1줄로 눌려 겹친다. Section·Item·Separator는 반드시 `Sidebar.Body` 안에.

### Do
- **Header/Footer의 워크스페이스·프로필·조직 트리거는 반드시 [[components/identity-button]]** — Select·Input Dropdown·수제 Button+span 조합 전부 금지. Avatar + 2줄 라벨 + trailing 뼈대가 고정이라 전용 컴포넌트가 담당. 사이드바에서 "현재 X 선택 상태 + 전환 가능" 모양이 보이면 100% IdentityButton.
- Section·Separator는 반드시 **`Sidebar.Body` 안에** 둔다 — Body만 스크롤되는 영역.
- 라우트 이동은 Item에 `asChild` + Next `<Link>`. 단, `asChild`일 땐 라벨 truncation이 `<Link>` 쪽 책임이 된다 ([[components/menu-item]] Slot 동작) — 긴 라벨이면 Link에 `truncate` 유틸 또는 `title` 속성을 걸 것.
- 현재 라우트는 `active`로 명시 (MenuItem의 active 시각 그대로).
- Brand는 Home 링크 자리로. `symbol`(항상 노출) + `wordmark`(expanded만).
- Section 묶음은 `title`로 그룹. collapsed일 땐 title 자동 숨김.
- `collapsed` 상태에서는 `aria-label`과 `title`을 자동으로 걸어 접근성 유지.
- 콘텐츠 영역과의 **경계선은 [[components/app-frame]] `variant="outlined"`** 가 그린다 — Sidebar 자체는 border를 그리지 않음. 사이드바가 녹아 보이면 AppFrame variant부터 확인.

### Don't
- **워크스페이스/프로필 트리거에 Select·Input Dropdown 금지** — 폼 값 선택과 네비게이션 액션은 다른 역할. [[components/identity-button]] + DropdownMenu 조합이 유일한 표준 ([[antipattern_workspace_switcher]]).
- **수제 Button + span 조립 금지** — 매번 레이아웃·폰트·collapsed 전환이 어긋나서 일관성이 깨짐. IdentityButton 하나로 끝.
- **Header에 Section·Item·nav를 넣지 않는다** — Header는 가로 flex 행이라 세로 nav가 깔리면 전부 눌려 겹친다. Brand 전용.
- 페이지 안 뷰 전환에 쓰지 않는다 — 그건 [[components/tabs]].
- Item 안에 variant로 다른 톤을 쓰지 않는다. active 외의 강조 금지.
- Sidebar 자체에 padding/width를 CSS로 덮지 않는다. `--sidebar-w*` 토큰 경유.
- `.root`에 padding을 꽂지 않는다 — Body가 스크롤 컨테이너라 스크롤바가 안쪽으로 밀려 가장자리에 안 붙는다. 좌우 여백은 Header/Section/Footer가 각자 담당([[project_scroll_rule]]).
- **Sidebar 좌우 축은 `--sidebar-pad-x` 단일 토큰만** — Header `--space-4`, body 안 임의 블록 `--space-3`, Section `--space-5`처럼 섞어 쓰면 안쪽 정렬이 전부 어긋난다. 소비처가 Body 안에 삽입하는 블록도 `padding-inline: var(--sidebar-pad-x)` 복제.
- **Sidebar 내부 Input은 `line` 금지** — `outline`(기본) 또는 `filled`만. 사이드바 안은 ghost 리듬이라 밑줄 variant가 녹아 보임.
- Brand symbol·wordmark 크기 override 금지. `--sidebar-brand-symbol-max`·`--sidebar-brand-wordmark-max` 상한 안에서만.
- **Body 안 섹션 리스트가 길어서 스크롤이 필요할 때**, 섹션들에 `flex-shrink`를 그대로 두지 않는다. Body는 `display:flex column`이라 자식(Section)이 기본 `flex-shrink:1`로 수축되어 header가 몇 px로 뭉개지고 아이템이 사라져 보인다. 해결: Body 직속 자식에 `flex: 0 0 auto`를 걸어 각 섹션이 자기 콘텐츠 전체 높이를 유지하게 하고, 스크롤은 Body의 `overflow-y:auto`가 담당하게 한다.
- **2단 쉘(아이콘 Rail + Sidebar) 조립 시 `SidebarSplit`를 쓰지 않는다** — SidebarSplit는 panel 영역을 자체 flex 체인으로 제한해서 안쪽 콘텐츠가 "영역 안에 갇힌" 느낌이 된다. 그냥 바깥 `display:flex`로 Rail(IconButton 세로 스택)과 `<Sidebar>`를 가로로 조립하고, 스크롤은 CtdsSidebar.Body에게 맡겨라. 기존 사이드바가 이미 자연 스크롤로 설계됐으니 그 구조를 그대로 차용하는 게 정답.

### Fallback
collapsed 결정 애매하면 `false`. Section title 애매하면 생략. 경계선 애매하면 AppFrame `variant="outlined"`.

### 관련
- [[components/identity-button]] — Header/Footer 워크스페이스·프로필·조직 트리거. Sidebar.Profile은 이 컴포넌트의 preset 래퍼.
- [[components/menu-item]] — Item 시각·상태 전부 재사용
- [[components/avatar]] — Profile 왼쪽 아바타
- [[components/app-frame]] — Sidebar를 담는 grid 쉘
- [[axes/density]] — `--sidebar-w*` 토큰·control-h가 Density에 반응
- [[tokens/color]] — `--fg`·`--primary`·active 상태 매핑

### Props 시그니처
```tsx
<Sidebar collapsed={boolean}>                 // default: false
  {/* Header — 고정, 가로 행. Brand 전용. */}
  <Sidebar.Header>
    <Sidebar.Brand symbol={<Icon />} wordmark={<Logo /> | "CTDS"} />
  </Sidebar.Header>

  {/* Body — 세로 스크롤 트랙. Section·Separator 전부 여기. 여러 개 두면 각자 독립 스크롤. */}
  <Sidebar.Body>
    <Sidebar.Section title="워크스페이스">
      <Sidebar.Item
        icon={<Icon name="house" />}
        label="대시보드"
        active={boolean}
        trailing={ReactNode}                  // 배지·카운트
        shortcut="⌘1"
        hasSubmenu={boolean}
        disabled={boolean}
        asChild={boolean}
        onClick={(e) => void}
      />
    </Sidebar.Section>

    <Sidebar.Separator />
  </Sidebar.Body>

  {/* Footer — 고정, 하단. Profile 또는 보조 액션. */}
  <Sidebar.Footer>
    <Sidebar.Profile
      name="희영"
      sub="admin@ctds.dev"
      avatar={{ src, status }}                // Avatar props 패스스루
      trailing={<Icon name="caret-up" />}     // non-interactive만 — IconButton 중첩 금지
    />
  </Sidebar.Footer>
</Sidebar>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| expanded (기본) | 폭 `--sidebar-w`, 모든 자식 라벨·wordmark·trailing 노출 |
| collapsed | 폭 `--sidebar-w-collapsed`, Item은 icon-only, wordmark·Section title·Profile 텍스트·trailing 숨김 |
| Item active | MenuItem active 그대로 — `--bg-muted` 배경 + `fg-strong` + medium weight |

### 조합 예시
```tsx
// 1. 워크스페이스 트리거 Header + Section 2개 + Footer Profile (가장 흔한 구성)
<Sidebar>
  <Sidebar.Header>
    <DropdownMenu>
      <DropdownMenu.Trigger asChild>
        <IdentityButton
          size="lg"
          avatar={{ initials: "T", shape: "rounded" }}
          name="Taskify PM"
          sub="Project Workspace"
          trailing={<Icon name="caret-down" size={14} />}
          aria-haspopup="menu"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        {/* 워크스페이스 리스트 + Separator + "+ 새 워크스페이스" */}
      </DropdownMenu.Content>
    </DropdownMenu>
  </Sidebar.Header>

  <Sidebar.Body>
    <Sidebar.Section title="워크스페이스">
      <Sidebar.Item asChild icon={<Icon name="house" />} label="대시보드" active>
        <Link href="/">대시보드</Link>
      </Sidebar.Item>
      <Sidebar.Item asChild icon={<Icon name="chart-line" />} label="분석">
        <Link href="/analytics">분석</Link>
      </Sidebar.Item>
    </Sidebar.Section>

    <Sidebar.Separator />

    <Sidebar.Section title="설정">
      <Sidebar.Item icon={<Icon name="gear" />} label="환경설정" shortcut="⌘," />
    </Sidebar.Section>
  </Sidebar.Body>

  <Sidebar.Footer>
    {/* Sidebar.Profile은 IdentityButton의 preset 래퍼 — 커스텀하려면 IdentityButton 직접 사용. */}
    <Sidebar.Profile name="희영" sub="admin@ctds.dev" avatar={{ status: "online" }} />
  </Sidebar.Footer>
</Sidebar>

// 2. Brand 로고 전용 Header (워크스페이스 전환이 필요 없는 단일 제품)
<Sidebar>
  <Sidebar.Header>
    <Sidebar.Brand symbol={<Icon name="rocket-launch" />} wordmark="CTDS" />
  </Sidebar.Header>
  {/* ... Body / Footer */}
</Sidebar>

// 3. Footer 프로필 + 위로 열리는 메뉴 (caret-up)
<Sidebar.Footer>
  <DropdownMenu>
    <DropdownMenu.Trigger asChild>
      <IdentityButton
        avatar={{ src: user.avatar, status: "online" }}
        name="희영"
        sub="admin@ctds.dev"
        trailing={<Icon name="caret-up" size={14} />}
        aria-haspopup="menu"
      />
    </DropdownMenu.Trigger>
    <DropdownMenu.Content side="top" align="start">
      {/* 계정 전환 · 설정 · 로그아웃 */}
    </DropdownMenu.Content>
  </DropdownMenu>
</Sidebar.Footer>

// 4. Collapsed — icon-only (IdentityButton·Profile 모두 자동으로 아바타만 남음)
<Sidebar collapsed>
  <Sidebar.Header>
    <Sidebar.Brand symbol={<Icon name="rocket-launch" />} />
  </Sidebar.Header>
  <Sidebar.Body>
    <Sidebar.Section>
      <Sidebar.Item icon={<Icon name="house" />} label="대시보드" active />
    </Sidebar.Section>
  </Sidebar.Body>
</Sidebar>
```
