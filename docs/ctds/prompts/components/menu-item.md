# MenuItem

### 원칙
메뉴/리스트 안 개별 행의 최소 단위. Dropdown Menu · Context Menu · Sidebar · Command Palette · 일반 List 아이템이 모두 이 컴포넌트를 공유한다. 시각 구조와 상태만 담당하고, 열림/닫힘·포커스 트랩·화살표 네비게이션은 상위 컨테이너(Radix DropdownMenu/ContextMenu, Sidebar `<nav>` 등)가 책임진다.

root는 `<div role="menuitem">`이다 — `leadingActions`/`trailingActions`에 `IconButton` 같은 인터랙션 요소를 자유롭게 넣기 위해 nested `<button>` 스펙 위반을 피했다. Enter/Space 키 처리는 컴포넌트가 직접 한다.

### Do
- **슬롯은 배열로**: `leadingActions` / `trailingActions`에 아이콘·IconButton·배지·카운트 등 뭐든 넣는다. 각 슬롯 아이템은 `flex-gap: --space-1.5`로 나열됨.
- **hover-only 액션은 명시적으로**: `{ node: <IconButton .../>, hoverOnly: true }` — 평상시 숨김, MenuItem hover/focus/focus-within에서 드러남. Notion 페이지 리스트 `+`/`⋯`, Linear 이슈 `⋯`, VSCode Explorer `+`/`✏️`/`↻`, Slack 채널 `⋯` 표준 패턴.
- **항상 보이는 메타 + hover 액션 공존**: `trailingActions={[unreadCount, { node: menuBtn, hoverOnly: true }]}` — Slack 채널 언리드 카운트 + hover ⋯가 이 형태.
- **내부 액션 클릭은 반드시 `e.stopPropagation()`**: 아니면 root의 `onClick`(=아이템 자체 선택)도 함께 발화한다. IconButton `onClick` 안에서 처리.
- **checked=true**면 `leadingActions` 맨 앞에 자동으로 checkmark. 기존 leading 아이콘과 공존 가능(체크된 파일 옆에 파일 타입 아이콘도 함께).
- **한 메뉴 안 leading 정책은 통일**: 어느 아이템에 leadingActions이 있으면 나머지도 유지 — 아니면 라벨 시작점이 어긋난다.
- **size는 컨텍스트에 맞춘다**: Dropdown/Context Menu · Sidebar = `md`(기본), Command Palette · 밀도 높은 관리 UI = `sm`, 터치·모바일 시트 = `lg`.
- **단축키는 실제 심볼**: `⌘K`, `⇧⌘P`. uppercase(`CTRL+K`) 금지 — [[feedback_no_uppercase]].
- **destructive는 hover-only 빨강**: 평상시 fg, hover/focus에서만 빨강. 위계상 "약한" 위험 표시. 최종 확인은 [[components/alert-dialog]].

### Don't
- MenuItem 안에 두 개 이상의 &ldquo;주된 액션&rdquo;을 두지 않는다 — 아이템 전체가 하나의 selection. 부가 액션(즐겨찾기 토글·⋯메뉴)만 slot에 얹는다.
- 라벨을 두 줄 이상 넣지 않는다. 설명이 필요하면 [[components/command-palette]] description 슬롯이나 [[components/tooltip]].
- 페이지 이동에 root click 시맨틱 금지. 라우팅 아이템이면 `asChild`로 `<Link>`/`<a>`에 위임. **단, `asChild`일 땐 라벨 `.label` 래퍼가 적용되지 않는다** — 자식(`<Link>`) 자체가 라벨 역할이라 truncation·color·weight가 자동 상속되지 않음. 긴 라벨이면 `<Link>` 쪽에 truncate 유틸을 걸거나, 짧게 유지하는 설계로.
- height를 CSS로 덮어쓰지 않는다. `size` prop 경유 (Density 축이 스왑).
- hover-only 액션을 &ldquo;시각적으로 숨김&rdquo;으로만 처리하지 않는다 — `opacity: 0` + `pointer-events: none`이 짝. 안 그러면 안 보이는 버튼이 클릭됨.

### Fallback
size 애매하면 `md`, variant 애매하면 `default`.

### 색상 훅 (컨테이너 단위 톤 조절)
MenuItem은 세 개의 CSS 변수로 색을 열어둔다. **부모 컨테이너에 값을 얹으면 그 안의 모든 MenuItem이 일괄 반응**한다 — variant를 늘리지 말고 이 훅을 쓰는 게 원칙.

| 훅 | 대상 | 폴백 |
|---|---|---|
| `--menu-fg` | 기본 라벨 색 | `--fg` |
| `--menu-active-bg` | active 배경 (fill 스타일) | `--bg-muted` |
| `--menu-active-fg` | active 라벨·아이콘·accent-bar 바 | fill=`--fg-strong` / accent-bar=`--primary` |

```css
/* 예: 사이드바 라벨을 연하게 + active는 브랜드 컬러로 */
.brand-nav {
  --menu-fg: var(--fg-muted);
  --menu-active-bg: var(--primary);
  --menu-active-fg: var(--bg);
}

/* 예: 조용한 리스트 — 평소 아주 연하게, active는 기본 강조만 */
.quiet-list {
  --menu-fg: var(--fg-subtle);
}
```

Do
- 훅은 **컨테이너 단위**로 지정한다 — 개별 아이템마다 다른 톤을 쓰면 시각 리듬이 깨진다.
- primary·secondary·destructive 같은 **시맨틱 토큰만** 훅에 넣는다. hex/oklch 직접 금지 ([[PRINCIPLES]] §1).

Don't
- 이 훅으로 hover/focus 색을 바꾸려 하지 않는다 — hover는 `--hover`로 별도 관리되며 원칙적으로 통일 유지.
- disabled/destructive 색은 훅으로 열려 있지 않다 — 접근성·위계 규칙이 붙어 있어 컴포넌트가 통제한다.

### 관련
- [[components/button]] · [[components/icon-button]] — trailing/leading에 흔히 들어감. hover 표면·destructive 위계 원리 공유.
- [[components/dropdown-menu]] · [[components/context-menu]] — 이 컴포넌트를 감싸는 상위 컨테이너
- [[components/sidebar]] · [[components/command-palette]] — 같은 MenuItem을 다른 컨텍스트에서 사용
- [[axes/density]] — `--control-h-*`가 size에 매핑
- [[axes/shape]] — radius가 Shape 축에 반응 (Button과 동일)
- [[tokens/color]] — `--hover`/`--bg-muted`/`--destructive` 매핑

### Props 시그니처
```tsx
type MenuItemAction =
  | ReactNode
  | { node: ReactNode; hoverOnly?: boolean; key?: string };

<MenuItem
  size="sm | md | lg"                    // default: md
  variant="default | destructive"        // default: default
  leadingActions={MenuItemAction[]}       // 왼쪽 슬롯 (아이콘, IconButton, 배지, ...)
  trailingActions={MenuItemAction[]}      // 오른쪽 슬롯 (카운트, ⋯, hover-only 액션, ...)
  shortcut="⌘K"                          // trailingActions 맨 앞에 자동 삽입
  hasSubmenu={boolean}                   // trailingActions 맨 뒤에 caret 자동 삽입
  checked={boolean}                      // leadingActions 맨 앞에 checkmark 자동 삽입
  active={boolean}                       // 현재 페이지/선택 아이템 강조
  disabled={boolean}
  collapsed={boolean}                    // icon-only. leading 하나만 남기고 label/trailing/shortcut 전부 숨김. (Sidebar가 자동 주입)
  truncateTooltip={boolean}              // 라벨이 …로 잘리거나 collapsed일 때 호버 Tooltip으로 풀 라벨 노출. Sidebar.Item 자동 ON. Dropdown/Context/Select 어댑터 안에선 Radix asChild 체인 꼬임 방지로 끄는 걸 권장.
  asChild={boolean}                      // Radix Slot — <Link>/<a>/DropdownMenu.Item 등에 위임
  onClick={(e) => void}
/>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | fg 텍스트, 투명 배경 |
| hover · focus (`:focus-visible` / Radix `[data-highlighted]`) | `--hover` 배경, `fg-strong` 텍스트 |
| active(눌림) | `--bg-muted` 배경 |
| active(현재 페이지/선택) | `--bg-muted` 배경, `fg-strong` + medium weight |
| checked | leading 맨 앞에 checkmark, 색 `fg-strong` |
| disabled | `fg-disabled` 텍스트, cursor not-allowed, tabIndex=-1 |
| destructive · hover | destructive 8% 배경, destructive 텍스트/아이콘 |
| hoverOnly 액션 | 기본 opacity 0 → hover/focus/focus-within 시 opacity 1 (터치는 항상 노출) |

### Size 가이드
| size | height | icon | 언제 |
|---|---|---|---|
| `sm` | 32 | 14 | 밀도 높은 관리 UI, Command Palette |
| `md` | 36 | 16 | **기본.** Dropdown / Context Menu / Sidebar |
| `lg` | 40 | 18 | 터치·모바일 시트, 랜딩용 큰 메뉴 |

### 조합 예시
```tsx
// 가장 단순 — 아이콘 + 라벨 + 단축키
<MenuItem
  leadingActions={[<Icon name="user" />]}
  shortcut="⌘,"
>계정 설정</MenuItem>

// 서브메뉴 트리거
<MenuItem
  leadingActions={[<Icon name="star" />]}
  hasSubmenu
>즐겨찾기로 이동</MenuItem>

// 체크박스 메뉴 (Radix CheckboxItem + [[components/checkbox]])
// 표준: leading 슬롯에 <Checkbox> 컴포넌트를 그대로 얹는다.
// - MenuItem의 checked prop(✓ 자동 삽입)에 의존하지 않는다 — 시각 톤을 폼과 통일하기 위함.
// - Checkbox는 pointer-events:none + tabIndex=-1로 시각 마커화하고, 실제 토글은
//   Radix가 관리한다(onCheckedChange). raw MenuItem이면 onClick에서.
<DropdownMenu.CheckboxItem asChild checked={showGrid} onCheckedChange={setShowGrid}>
  <MenuItem
    leadingActions={[
      <Checkbox size="sm" checked={showGrid} readOnly tabIndex={-1} className="menu-form-marker" />,
    ]}
    shortcut="⌘G"
  >그리드 표시</MenuItem>
</DropdownMenu.CheckboxItem>

// 라디오 메뉴 (Radix RadioGroup + RadioItem + [[components/radio]])
// 표준: leading 슬롯에 <Radio> 컴포넌트를 그대로 얹는다.
// - 미선택도 "빈 원(○)" 자리를 유지 → 라벨 좌측 시작점 흔들림 없음.
// - Radio도 마커화(pointer-events:none, tabIndex=-1). 같은 name으로 native 그룹 보장.
<DropdownMenu.RadioGroup value={density} onValueChange={setDensity}>
  {["compact", "cozy", "comfortable"].map((value) => (
    <DropdownMenu.RadioItem asChild key={value} value={value}>
      <MenuItem
        leadingActions={[
          <Radio
            size="sm"
            name="density"
            value={value}
            checked={density === value}
            readOnly
            tabIndex={-1}
            className="menu-form-marker"
          />,
        ]}
        active={density === value}
      >{value}</MenuItem>
    </DropdownMenu.RadioItem>
  ))}
</DropdownMenu.RadioGroup>

// 참고: ContextMenu/DropdownMenu의 <CheckboxItem>/<RadioItem> 래퍼는
// 내부에서 이미 dot/check placeholder를 leading에 얹고 CSS로 그린다.
// 그 래퍼를 쓰면 위처럼 leadingActions를 직접 넘길 필요 없음.
// 여기 예시는 raw MenuItem 위에 폼 컴포넌트로 직접 조합하는 방식.

// Notion 페이지 리스트: leading 페이지 아이콘, 항상 보이는 카운트, hover 시 +/⋯
<MenuItem
  leadingActions={[<Icon name="star" />]}
  trailingActions={[
    <span className="badge">12</span>,
    {
      node: (
        <IconButton
          variant="ghost"
          size="sm"
          icon={<Icon name="arrow-right" />}
          aria-label="새 하위 페이지"
          onClick={(e) => { e.stopPropagation(); addChild(); }}
        />
      ),
      hoverOnly: true,
    },
    {
      node: (
        <IconButton
          variant="ghost"
          size="sm"
          icon={<Icon name="gear" />}
          aria-label="더 보기"
          onClick={(e) => { e.stopPropagation(); openMenu(); }}
        />
      ),
      hoverOnly: true,
    },
  ]}
  onClick={() => openPage()}
>디자인 시스템</MenuItem>

// Figma 파일 리스트: 항상 보이는 별표(즐겨찾기 토글), hover ⋯
<MenuItem
  leadingActions={[
    <IconButton
      variant="ghost"
      size="sm"
      icon={<Icon name="star" weight={starred ? "fill" : "regular"} />}
      aria-label={starred ? "즐겨찾기 해제" : "즐겨찾기"}
      onClick={(e) => { e.stopPropagation(); toggleStar(); }}
    />,
  ]}
  trailingActions={[
    <span className="date">2일 전</span>,
    {
      node: (
        <IconButton size="sm" variant="ghost" aria-label="더 보기" icon={<Icon name="gear" />}
          onClick={(e) => { e.stopPropagation(); openMenu(); }} />
      ),
      hoverOnly: true,
    },
  ]}
  onClick={() => openFile()}
>Untitled</MenuItem>

// Sidebar 라우팅: asChild로 <Link>에 위임 + active
<MenuItem asChild active={pathname === "/tokens/color"} leadingActions={[<Icon name="star" />]}>
  <Link href="/tokens/color">Color</Link>
</MenuItem>

// 위험 액션
<MenuItem
  leadingActions={[<Icon name="trash" />]}
  variant="destructive"
  onClick={() => confirmDelete()}
>삭제</MenuItem>
```
