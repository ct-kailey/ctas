# Topbar

### 원칙
앱 shell 최상단의 가로 bar — Breadcrumb·탐색·검색·알림·사용자 메뉴처럼 **"지금 어느 자리인지 + 공용 액션"**만 담는 chrome. 콘텐츠 자체(hero head, 큰 환영 메시지, 섹션 제목)는 Topbar의 자리가 아니라 **아래 body의 첫 블록 자리**다. Topbar는 세로 높이가 고정된 **얇은 축**이므로, 수직 리듬이 큰 요소를 끼우면 align이 깨지고 bar 자체가 "들뜬다".

구조는 **leading / center / trailing 3-zone 고정**. 루트가 부모 폭을 꽉 채우고 세 zone이 자리를 나눈다. "왼쪽에 몰림" 현상은 구조적으로 발생하지 않는다 — zone이 없으면 애초에 Topbar를 쓰지 않는다.

### Do
- `Topbar.Leading` + `Topbar.Trailing` **짝**을 기본으로. 한쪽만 있는 경우도 OK — 반드시 zone 안에 넣는다.
- 가운데에 pin하고 싶은 요소(검색 트리거 pill 등)는 `Topbar.Center`로. 비우면 L↔T 사이 공간이 자동으로 벌어진다.
- Breadcrumb·검색 Input·알림 IconButton·avatar menu·탐색 Tabs처럼 **반복적으로 쓰이는 공용 액션만** 담는다.
- 세로는 `size` prop(`sm`/`md`)이 결정하는 한 줄만. 수직으로 쌓지 않는다.
- 자체 chrome(bg/border/shadow)은 두지 않는다 — 표현은 상위 [[components/app-frame]] variant가 담당.
- 페이지의 "지금 어디" 신호는 **Breadcrumb**로. 큰 타이틀로 쓰고 싶으면 Topbar가 아니라 body 첫 블록.

### Don't
- zone 밖에 **자식을 바로 넣지 않는다**. `<Topbar><Breadcrumb/>...</Topbar>` 같은 구조 금지 — 반드시 Leading/Center/Trailing 중 하나로 감싼다.
- `h1`·큰 hero head·환영 메시지("good morning, …")·페이지 섹션 타이틀을 Topbar 안에 넣지 않는다 — Topbar는 **얇은 축**이고 큰 타이포가 들어가는 순간 `align-items` 전쟁이 벌어진다. 이걸 로컬 CSS로 때우는 순간(`align-items: flex-start`, `padding-bottom` override 등) Topbar의 "축" 약속이 깨지고, 아래 body와의 수직 리듬도 어긋난다. hero는 body의 첫 섹션으로 꺼낸다.
- 수직 스택(eyebrow + title 세로 두 줄 같은 조합)을 Topbar 안에 넣지 않는다. 수직 리듬은 body의 섹션 head에서.
- **[HARD] Topbar 안 IdentityButton 에 `sub` prop 금지** ([[feedback_topbar_single_line_identity]]) — 2줄 모드가 Topbar "얇은 축" 리듬을 깬다. 2줄이 필요하다 느껴지면 자리 자체가 틀림: 콘텐츠 소속감이 필요한 자리면 PageHeader(body 안), 네비게이션 소속감이면 Sidebar.Footer 로 옮긴다.
- 알림·검색·Breadcrumb 외의 **콘텐츠**(KPI·요약·공지 문구)를 Topbar에 끼우지 않는다. 그건 body hero 섹션 또는 Callout의 자리.
- Topbar에 로컬 `padding`·`align-items`를 override해서 "큰 요소 끼운 걸 수습"하지 않는다 — 수습이 필요한 순간 그 요소가 Topbar의 자리가 아니라는 신호.
- 자체 bg/border/shadow 추가 금지 — AppFrame variant가 쥐고 있는 자리.
- 여러 줄 쌓거나 `size` 바깥의 세로 공간을 늘리지 않는다 — "얇은 축"이 Topbar의 약속.

### Fallback
`size` 애매하면 `md`. 콘텐츠 밀도가 아주 낮은 랜딩/문서 shell이면 `sm`.
Leading·Trailing 둘 다 비면 Topbar를 두지 않는다 — 빈 bar는 수직 공간만 먹는다.

### 관련
- [[components/app-frame]] — Topbar를 품는 shell. bg/border/shadow 등 chrome 표현은 AppFrame variant가 쥔다.
- [[components/breadcrumb]] — Topbar 왼쪽의 "지금 어디" 신호. 큰 타이틀 대신 이걸로.
- [[components/sidebar]] — 가로축이 Topbar, 세로축이 Sidebar. 둘의 top baseline은 AppFrame이 맞춘다.
- [[components/callout]] — "지금 공지해야 할 큰 콘텐츠"가 생기면 Topbar가 아니라 body 첫 블록의 Callout.
- [[axes/density]] — size와 함께 세로 높이 리듬을 결정.
- [[tokens/spacing]] — 좌우 padding은 shell 토큰에 양보. Topbar가 자체로 쥐지 않는다.

### Props 시그니처
```tsx
<Topbar size="sm | md">
  <Topbar.Leading>{/* brand·back·breadcrumb·title */}</Topbar.Leading>
  <Topbar.Center>{/* 선택: 가운데 pin 요소 (검색 트리거 등) */}</Topbar.Center>
  <Topbar.Trailing>{/* 공용 액션: 검색·알림·avatar·primary 버튼 */}</Topbar.Trailing>
</Topbar>
```

| 요소 | 역할 |
|---|---|
| `Topbar` | width:100%, 세로 flex 축. 높이만 `size`로 결정 |
| `Topbar.Leading` | 왼쪽 zone, 자연 폭. 자식 gap `--space-1` |
| `Topbar.Center` | 가운데 zone, 1fr + 중앙 정렬. 비우면 L↔T 자동 분리 |
| `Topbar.Trailing` | 오른쪽 zone, 자연 폭 + `margin-inline-start: auto`로 오른쪽 pin |

### Size 매트릭스

| size | 세로 높이 | 용도 |
|---|---|---|
| `sm` | 얇음 | 문서·랜딩·설정 shell. 액션 수 적을 때 |
| `md` | 기본 | 앱 콘솔. Breadcrumb + 공용 액션 2~3개 |

### 금지 조합
- zone 없이 바로 자식 삽입 — Leading/Center/Trailing 중 하나로 반드시 감싼다.
- Topbar 안에 `h1`·`h2`·hero head 삽입 — "얇은 축" 약속 깨짐. body hero 섹션으로 꺼낸다.
- Topbar 안에 수직 스택(eyebrow + title 2줄) — 단일 줄 원칙 깨짐.
- 로컬 CSS로 `align-items: flex-start` + `padding-bottom` 늘려서 큰 타이포 수용 — 수습이 필요한 순간 그 요소가 자리가 아니라는 신호.
- 자체 bg/border/shadow 리터럴 추가 — AppFrame variant 영역 침범.
- Breadcrumb·공용 액션 없이 **콘텐츠 요약**만 넣기 — Callout·hero 섹션의 자리.
- MetricCard·Chip·Badge를 콘텐츠 신호로 Topbar에 끼우기 — body 섹션 안이 자리.

### 조합 예시

Topbar는 **3-zone 자유 슬롯 컨테이너**다. "page / detail / panel" 같은 variant를 따로 두지 않고, **같은 Topbar에 다른 children**을 넣어 역할을 바꾼다. 뒤로가기·close도 전용 컴포넌트가 아니라 `IconButton` + `Icon`을 zone에 꽂는 조립.

```tsx
// 1) page — 운영 콘솔. Breadcrumb + 검색 + 알림
<Topbar size="md">
  <Topbar.Leading>
    <Breadcrumb>
      <Breadcrumb.Item href="/today">today</Breadcrumb.Item>
      <Breadcrumb.Current>meetings</Breadcrumb.Current>
    </Breadcrumb>
  </Topbar.Leading>
  <Topbar.Trailing>
    <Input
      size="md"
      variant="filled"
      placeholder="search anything"
      leftIcon={<Icon name="search" />}
      rightAction={<Shortcut size="sm">⌘K</Shortcut>}
    />
    <IconButton icon={<Icon name="bell" />} size="md" variant="ghost" />
  </Topbar.Trailing>
</Topbar>

// 2) detail — 뒤로가기 + Breadcrumb로 현재 위치 + overflow 액션
<Topbar size="md">
  <Topbar.Leading>
    <IconButton
      icon={<Icon name="caret-left" />}
      size="md"
      variant="ghost"
      aria-label="back"
    />
    <Breadcrumb>
      <Breadcrumb.Item href="/meetings">meetings</Breadcrumb.Item>
      <Breadcrumb.Current>oct 5 standup</Breadcrumb.Current>
    </Breadcrumb>
  </Topbar.Leading>
  <Topbar.Trailing>
    <IconButton
      icon={<Icon name="dots-three" />}
      size="md"
      variant="ghost"
      aria-label="more"
    />
  </Topbar.Trailing>
</Topbar>

// 3) panel — 사이드패널/드로어 내부. 더 얇게 + close
<Topbar size="sm">
  <Topbar.Leading>
    <Breadcrumb>
      <Breadcrumb.Current>filters</Breadcrumb.Current>
    </Breadcrumb>
  </Topbar.Leading>
  <Topbar.Trailing>
    <IconButton
      icon={<Icon name="x" />}
      size="sm"
      variant="ghost"
      aria-label="close"
    />
  </Topbar.Trailing>
</Topbar>

// 4) center zone — 가운데에 pin해야 할 때
<Topbar size="md">
  <Topbar.Leading>{/* brand */}</Topbar.Leading>
  <Topbar.Center>
    <SearchTrigger />
  </Topbar.Center>
  <Topbar.Trailing>{/* 알림·avatar */}</Topbar.Trailing>
</Topbar>
```

### 역할별 zone 공식

| 역할 | Leading | Center | Trailing | size |
|---|---|---|---|---|
| page | Breadcrumb | — | 검색 Input, 알림/avatar IconButton | `md` |
| detail | `IconButton icon="caret-left" variant="ghost"` + Breadcrumb | — | overflow/share 등 IconButton | `md` |
| panel (사이드패널·drawer) | Breadcrumb(단일 Current) | — | `IconButton icon="x" variant="ghost"` | `sm` |

- 뒤로가기는 **전용 컴포넌트가 아니라** `IconButton` + `Icon name="caret-left"`. `variant="ghost"` 고정, `aria-label="back"` 필수.
- 패널 close도 동일하게 `IconButton` + `Icon name="x"`, `aria-label="close"`.
- "지금 어디"는 어떤 역할이든 **항상 Breadcrumb**로. detail/panel이라고 `h1`·굵은 타이틀로 바꾸지 않는다 — "얇은 축" 약속은 역할과 무관하게 유지.
- panel은 콘텐츠 밀도가 낮으니 `size="sm"`이 기본. 더 얇아야 할 이유가 명확할 때만.
- bg/border/shadow는 **역할별로도 Topbar가 쥐지 않는다** — detail은 상위 AppFrame, panel은 Drawer/SidePanel shell이 쥔다.

### 조립 — 상위 shell과의 공식
- 좌/우 padding은 **AppFrame variant 또는 콘텐츠 panel**이 쥔다. Topbar가 자체 padding으로 수평 정렬을 책임지지 않는다. 수평 baseline은 body와 반드시 동일해야 하며, Topbar가 혼자 다르게 쥐면 body와 어긋난다.
- 세로 top padding은 shell(또는 콘텐츠 panel)의 top padding과 동일하게. Sidebar의 top padding도 **같은 수치**로 맞춰야 좌·우 상단이 한 줄에 선다.
- Topbar와 아래 body 첫 섹션 사이 간격은 **Topbar의 bottom padding**이 아니라 **body의 top padding 또는 body gap**이 담당. Topbar는 "얇은 축"으로 끝나야 수직 리듬이 섹션 쪽으로 넘어간다.

### Known Gaps
- Topbar는 반응형 breakpoints에서 "검색 Input → 아이콘으로 축약" 같은 전환을 자체적으로 하지 않는다. 상위 레이아웃이 반응형으로 children을 바꿔 넘긴다.
- Topbar 안 Breadcrumb의 **잘림/트렁케이션** 규칙은 [[components/breadcrumb]]이 담는다. Topbar는 "자리"만 제공.
