# Tabs

### 원칙
동일 문맥 안에서 **한 번에 하나의 뷰만 보이는 여러 뷰**를 전환하는 컨트롤. 세 variant는 사용 맥락이 완전히 다르다 — 무게 순으로 `segmented > underline > text`.

- **`underline`** — 페이지·섹션 안의 **콘텐츠 전환**. 하단 인디케이터 바만 있어 무게가 가볍고, 콘텐츠 흐름을 방해하지 않는다. Overview / Details / Activity 같은 화면 단위 전환의 표준.
- **`segmented`** — 연한 컨테이너 안에 3~4개 pill. **필터·뷰 스위처** 같은 소수 옵션 즉시 선택. Day / Week / Month, List / Grid / Timeline, Preview / Code 등.
- **`text`** — 컨테이너·라인·인디케이터 전부 없음. 색과 weight만으로 위계 표현. **공간을 거의 안 먹어야 할 때** — 페이지 헤더 sub-nav, 카드 안 미니 스위처, 목록 상단 상태 필터.

### Do
- **variant는 목적으로 고른다** — 콘텐츠 전환은 `underline`, 옵션 스위처는 `segmented`, 최소 무게 필터·sub-nav는 `text`. 예쁘다는 이유로 뒤바꾸지 말 것.
- **선택된 값은 URL query·라우터에 반영** (`?tab=activity`). 새로고침·공유·뒤로가기가 자연스러워짐.
- **아이콘은 라벨을 도울 때만**. 3자 이하 라벨 옆에 아이콘 없이도 인지될 때는 아이콘 없이. segmented는 좁으니 아이콘+긴 라벨 조합은 피한다.
- **패널 콘텐츠에 상태(폼, 스크롤 위치)가 있으면 `keepMounted`**. 탭 전환마다 리셋되는 폼은 아주 나쁜 경험.
- **키보드**: 컴포넌트가 ← → Home End 처리. Tab 키는 탭 리스트 밖으로 나가 활성 패널로 이동한다 (roving tabindex).
- **한 화면에 탭 계층은 하나까지**. 탭 안에 다시 탭을 두면 방향 감각이 무너진다.
- **`underline` Tabs는 담고 있는 컨테이너의 "바닥"에 flush 로 배치**. 컨테이너 header/toolbar 영역이면 그 영역의 **맨 아래 줄**이 Tabs여야 하고, 아래쪽 패딩·여백 없이 바로 다음 블록(패널·본문)과 맞닿아야 한다. 트랙 라인이 그 자리 자체가 섹션 구분선 역할을 하도록.

### Don't
- `underline` 하단 border/두께를 CSS로 덮어쓰지 않는다 — `--border` + `--space-0_5` 조합이 Density·Mode 축에 반응한다.
- **`underline` Tabs 바로 아래(또는 그 Tabs를 담고 있는 header 컨테이너의 border-bottom)에 또 다른 `border-bottom` 금지** — Tabs 자체 트랙 라인과 두 줄로 겹쳐 "이중 스트로크" 현상이 생긴다. 해결: 외부 컨테이너의 border-bottom을 제거하고 Tabs 트랙 라인이 그 역할을 하게 한다. Tabs 위쪽에 title/toolbar가 있다면 그 영역은 border 없이, Tabs 트랙만 유일한 구분선.
- `underline` Tabs 아래쪽에 padding/margin 금지 — "탭 밑에 떠있는 트랙" 느낌이 되어 소속감이 깨진다. Tabs는 **컨테이너 바닥에 딱 붙어** 다음 영역과 트랙 라인이 바로 맞닿아야 한다.
- `segmented`를 5개 이상으로 늘리지 않는다. 5개 이상이면 [[components/select]] 또는 [[components/dropdown-menu]].
- `segmented` 안 트리거에 **가변 너비 라벨** 금지 — flex 균등 분배가 무너져 pill이 어색해진다. 라벨 길이가 심하게 차이나면 `underline`으로.
- 패널 헤더(title + Tabs가 `space-between`으로 양쪽 배치되는 레이아웃)에 `segmented`를 넣지 않는다 — segmented는 라벨 합산 폭이 커서 반대편 title을 밀어내 세로로 쪼개 놓는다. 패널 헤더 안 뷰 스위처가 필요하면 `text` variant 또는 `underline` sm 쓰거나, title을 `flex-shrink: 0`·`white-space: nowrap`으로 고정하고 Tabs는 그 다음 자리에만.
- 페이지 이동(URL 자체가 바뀌는 라우팅)에 Tabs 사용 금지. 그건 [[components/sidebar]] 또는 상단 nav의 역할.
- 활성 색을 `--primary`로 덮지 않는다. 활성은 `--fg-strong`(무채) — 브랜드 컬러를 여기 쓰면 CTA와 위계가 충돌.
- `text`를 페이지 안 여러 자리에 반복해 쓰지 않는다. 장식이 없어서 "이게 탭인가 링크인가" 혼동이 잘 남 — 한 화면에 하나 정도로.

### Fallback
variant 애매하면 `underline`, size 애매하면 `md`.

### 관련
- [[components/button]] · [[components/split-button]] — 동일한 `--control-h-*` 사이즈 토큰 공유
- [[components/filter-button]] — 여러 개 동시 선택이면 FilterButton. Tabs는 항상 1개만 활성.
- [[axes/density]] — `--control-h-*`가 트리거 높이·segmented 컨테이너 높이에 매핑
- [[axes/shape]] — segmented 컨테이너/트리거 radius가 Shape 축에 반응
- [[axes/motion]] — 인디케이터 등장·hover 색 전환 duration
- [[tokens/color]] — `--fg-muted` → `--fg-strong` 대비, `--bg-muted` 컨테이너

### Props 시그니처
```tsx
<Tabs
  variant="underline | segmented | text"   // default: underline
  size="sm | md | lg"                  // default: md
  value={string}                       // controlled
  defaultValue={string}                // uncontrolled 초기값
  onValueChange={(v) => void}
>
  <Tabs.List aria-label="섹션 선택">
    <Tabs.Trigger value="overview" leadingIcon={<Icon name="rectangle" />}>Overview</Tabs.Trigger>
    <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
    <Tabs.Trigger value="settings" disabled>Settings</Tabs.Trigger>
  </Tabs.List>

  <Tabs.Panel value="overview">…</Tabs.Panel>
  <Tabs.Panel value="activity" keepMounted>…</Tabs.Panel>
  <Tabs.Panel value="settings">…</Tabs.Panel>
</Tabs>
```

### 상태 매트릭스
| 상태 | underline | segmented | text |
|---|---|---|---|
| default | `--fg-muted` 텍스트, 인디케이터 투명 | `--fg-muted` 텍스트, 트리거 배경 투명 | `--fg-muted` 텍스트, regular weight |
| hover | `--fg` 텍스트, 아이콘 opacity 1 | `--hover` 배경 + `--fg` 텍스트 | `--fg` 텍스트 (배경 없음) |
| active(선택) | `--fg-strong` 텍스트 + 하단 2px 인디케이터 | `--bg` 표면 + `shadow-xs` + `--fg-strong` | `--fg-strong` 텍스트 + semibold |
| focus-visible | `--ring-shadow` 링 (전체 트리거) | 동일 | 동일 |
| disabled | opacity 0.5, cursor not-allowed, tabIndex=-1 | 동일 | 동일 |

### Size 가이드
| size | height (control-h) | 언제 |
|---|---|---|
| `sm` | control-h-sm | 밀도 높은 대시보드, 사이드 패널 안, 카드 헤더 |
| `md` | control-h-md | **기본.** 페이지 섹션 탭, 대부분의 스위처 |
| `lg` | control-h-lg | 랜딩·마케팅 상단, 태블릿·터치 |

### 접근성
- 루트가 자동으로 `role=tablist` / `role=tab` / `role=tabpanel`과 `aria-selected` / `aria-controls` / `aria-labelledby` 를 붙인다.
- 활성 트리거만 `tabIndex=0`, 나머지는 `-1` (roving focus).
- ← → 로 순환 이동, Home / End 로 양 끝.
- 사용자에게 필요한 유일한 aria는 `<Tabs.List aria-label="…">` — 스크린리더가 이 탭이 무엇을 스위치하는지 알 수 있게.

### 조합 예시
```tsx
// 콘텐츠 전환 (underline) — URL query와 동기화
const [tab, setTab] = useQueryState("tab", { defaultValue: "overview" });
<Tabs value={tab} onValueChange={setTab}>
  <Tabs.List aria-label="프로젝트 섹션">
    <Tabs.Trigger value="overview" leadingIcon={<Icon name="rectangle" />}>Overview</Tabs.Trigger>
    <Tabs.Trigger value="activity" leadingIcon={<Icon name="chart-line" />}>Activity</Tabs.Trigger>
    <Tabs.Trigger value="members" leadingIcon={<Icon name="user" />}>Members</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="overview"><Overview /></Tabs.Panel>
  <Tabs.Panel value="activity" keepMounted><Activity /></Tabs.Panel>
  <Tabs.Panel value="members"><Members /></Tabs.Panel>
</Tabs>

// 뷰 스위처 (segmented) — 즉시 반영, 페이지 이동 아님
<Tabs variant="segmented" size="sm" defaultValue="week" onValueChange={setRange}>
  <Tabs.List aria-label="기간">
    <Tabs.Trigger value="day">Day</Tabs.Trigger>
    <Tabs.Trigger value="week">Week</Tabs.Trigger>
    <Tabs.Trigger value="month">Month</Tabs.Trigger>
    <Tabs.Trigger value="year">Year</Tabs.Trigger>
  </Tabs.List>
</Tabs>

// Preview / Code 스위처 — 패널 없이 트리거만 써서 외부 state 제어
<Tabs variant="segmented" value={mode} onValueChange={setMode}>
  <Tabs.List aria-label="뷰 모드">
    <Tabs.Trigger value="preview" leadingIcon={<Icon name="eye" />}>Preview</Tabs.Trigger>
    <Tabs.Trigger value="code" leadingIcon={<Icon name="brackets-square" />}>Code</Tabs.Trigger>
  </Tabs.List>
</Tabs>

// 목록 상단 상태 필터 (text) — 장식 없이 색·weight만
<Tabs variant="text" size="sm" value={status} onValueChange={setStatus}>
  <Tabs.List aria-label="이슈 상태">
    <Tabs.Trigger value="all">전체</Tabs.Trigger>
    <Tabs.Trigger value="open">열림</Tabs.Trigger>
    <Tabs.Trigger value="closed">닫힘</Tabs.Trigger>
  </Tabs.List>
</Tabs>
```
