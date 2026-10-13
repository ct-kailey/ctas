# IdentityButton

### 원칙
식별 가능한 **대상**(워크스페이스·프로필·프로젝트·조직·환경)을 **현재 선택 상태**로 보여주면서, 클릭 가능함을 암시하는 가로 식별 블록. 좌측 identity(Avatar/Icon) + 2줄 라벨(name + sub) + 우측 trailing(caret-down·IconButton·Badge)이 뼈대. 사이드바 Header의 워크스페이스 스위처, Footer의 프로필, Topbar의 조직 스위처, 계정 chooser 리스트 — 전부 이 컴포넌트가 담당.

Select/Input/DropdownMenu 자체가 아니다 — 이 컴포넌트는 **트리거** 또는 **표시**다. 전환 메뉴를 열고 싶다면 `asChild`로 DropdownMenu.Trigger에 위임한다.

### Do
- **역할 중립** — workspace·profile·project·org·env 전부 같은 컴포넌트로. "모양"은 같고 trailing만 바뀜 (caret-down=전환 가능, IconButton=메뉴 열기, 생략=표시 전용).
- **네비게이션 액션에 Input Dropdown 금지** — 워크스페이스 전환은 폼이 아니라 라우트 액션. IdentityButton + DropdownMenu 조합이 표준 ([[antipattern_workspace_switcher]]).
- **`asChild`로 트리거 위임** — DropdownMenu.Trigger, Popover.Trigger 등에 그대로 `asChild`.
- **collapsed 상태는 Sidebar가 자동 주입** — 사이드바 밖에서 쓸 땐 신경 안 써도 됨. 사이드바 안에선 context로 전달됨.
- **leading 자유도** — Avatar가 기본이지만 Icon·Emoji·커스텀 노드 아무거나 `leading` prop에 삽입 가능. 조직 로고·프로젝트 심볼 등.
- **1줄 모드** — `sub` 생략하면 자동으로 1줄 레이아웃. 라벨만 필요한 가벼운 트리거일 때.
- **trailing에 bare `<Icon>`을 쓸 땐 `size={14}` 명시** — Icon 기본값(20px)은 라벨 옆에 두면 과하다.
- **trailing에 `IconButton`을 쓸 땐 size를 IdentityButton size와 맞춘다** — IdentityButton md/lg면 IconButton md, sm이면 IconButton sm. sm 섞어 쓰면 라벨 옆에서 왜소해 보임.
- **trailing 아이콘은 역할에 따라 바꾼다** — 의미가 어긋나면 사용자가 다른 동작을 기대함:
  - `caret-down` (Icon) — **아래로 열리는 드롭다운**. 가장 기본. 사이드바 Header 워크스페이스 스위처, Topbar 조직 스위처.
  - `caret-up` (Icon) — **위로 열리는 패널/메뉴**. 사이드바 Footer 프로필처럼 위쪽으로 메뉴가 올라올 때.
  - `gear` (IconButton) — **설정 페이지로 이동**. 메뉴가 아니라 바로 라우트 이동. root click과 분리 (`e.stopPropagation()`).
  - `dots-three` (IconButton) — **⋯ 추가 액션 메뉴**. 로그아웃·계정 관리 등 부가 액션.
  - 생략 — **표시 전용**. 전환 불가하거나 다른 자리에서 전환하는 경우.

### Don't
- Select·Input Dropdown으로 이 역할 매핑 금지 ([[antipattern_workspace_switcher]]).
- 두 가지 "주된 액션"을 넣지 않는다 — root click 하나가 selection이자 trigger. 부가 액션은 `trailing`에 IconButton 하나까지만.
- 라벨을 두 줄 이상 넣지 않는다 — `name` 1줄 + `sub` 1줄이 상한. 설명이 길면 [[components/tooltip]].
- height를 CSS로 덮어쓰지 않는다 — `size` prop 경유.
- 사이드바 밖에서 쓸 때 자체 border/box-shadow 두르지 않는다 — 호스트가 담당 (Topbar·Card 안이면 그 컨테이너의 경계 그대로).

### Fallback
size 애매하면 `md`. variant 애매하면 `ghost`. trailing 애매하면 **caret-down** (전환 가능함을 암시하는 게 안전).

### 관련
- [[components/sidebar]] — Header/Footer 안 가장 흔한 사용처 (Sidebar.Profile은 이 컴포넌트의 preset 래퍼)
- [[components/dropdown-menu]] — `asChild`로 트리거 위임하는 짝
- [[components/avatar]] — leading 기본 요소
- [[axes/density]] — `--control-h-*`가 size에 매핑
- [[antipattern_workspace_switcher]] — "Input Dropdown으로 매핑 금지" 안티패턴

### Props 시그니처
```tsx
<IdentityButton
  size="sm | md | lg"                     // default: md
  variant="ghost | muted"                 // default: ghost
  avatar={{...AvatarProps}}               // 좌측 Avatar. src/initials/icon/status 패스스루
  leading={ReactNode}                     // avatar 대신 임의 노드 (Icon, Emoji, 로고 SVG)
  name={ReactNode}                        // 1줄 메인 라벨
  sub={ReactNode}                         // 2번째 줄 (생략 시 1줄 모드)
  trailing={ReactNode}                    // caret-down · IconButton · Badge 등
  active={boolean}                        // 리스트에서 현재 선택
  disabled={boolean}
  collapsed={boolean}                     // icon-only (Sidebar가 자동 주입)
  asChild={boolean}                       // Radix Slot — DropdownMenu.Trigger 등에 위임
  onClick={(e) => void}
/>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default (ghost) | 투명 bg, `--fg` 텍스트 |
| hover · focus-visible | `--hover` 배경 |
| active (현재 선택) | `--bg-muted` 배경 + `--fg-strong` + medium weight. hover가 덮지 않음 ([[feedback_hover_over_active]]) |
| variant=muted | 항상 `--bg-muted` 배경 — 사이드바 안에서 톤 대비가 필요할 때 |
| collapsed | leading 하나만, 가운데 정렬, 라벨/sub/trailing 전부 숨김 |
| disabled | `cursor: not-allowed` + opacity 0.5 |

### Size 가이드
| size | min-height | 언제 |
|---|---|---|
| `sm` | `--control-h-sm` | 조밀한 Topbar 조직 스위처, 리스트 아이템 |
| `md` | `--control-h-md` | **기본.** 사이드바 Header·Footer, 일반 트리거 |
| `lg` | `--control-h-lg` | 사이드바 워크스페이스 Header처럼 아이덴티티가 가장 강하게 노출돼야 할 때 |

### 조합 예시
```tsx
// 1. 사이드바 Header 워크스페이스 스위처 — DropdownMenu로 전환
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

// 2a. 사이드바 Footer 프로필 + 위로 올라가는 메뉴 — caret-up
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

// 2b. 사이드바 Footer 프로필 + 설정으로 바로 이동 — gear IconButton
// trailing의 IconButton onClick은 반드시 e.stopPropagation()으로 root click과 분리.
<Sidebar.Footer>
  <IdentityButton
    avatar={{ src: user.avatar, status: "online" }}
    name="희영"
    sub="admin@ctds.dev"
    trailing={
      <IconButton
        size="md"
        variant="ghost"
        icon={<Icon name="gear" />}
        aria-label="설정"
        onClick={(e) => { e.stopPropagation(); router.push("/settings"); }}
      />
    }
    onClick={() => openProfilePanel()}
  />
</Sidebar.Footer>

// 3. Topbar 조직 스위처 — size=sm
<DropdownMenu>
  <DropdownMenu.Trigger asChild>
    <IdentityButton
      size="sm"
      leading={<Icon name="buildings" />}
      name="Conscience Technology"
      trailing={<Icon name="caret-down" size={14} />}
    />
  </DropdownMenu.Trigger>
</DropdownMenu>

// 4. Account chooser 리스트 — active 상태로 현재 선택 표시
<div role="listbox">
  {accounts.map((a) => (
    <IdentityButton
      key={a.id}
      avatar={{ src: a.avatar }}
      name={a.name}
      sub={a.email}
      active={a.id === currentId}
      onClick={() => select(a.id)}
    />
  ))}
</div>

// 5. 1줄 모드 — sub 없이 가볍게
<IdentityButton
  size="sm"
  leading={<Icon name="folder" />}
  name="Design System"
  trailing={<Icon name="caret-down" size={14} />}
/>
```
