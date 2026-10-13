# AppFrame

### 원칙
앱 전체 쉘의 grid 레이아웃. Sidebar + Topbar + Tabs(선택) + Content의 자리를 **CSS Grid**로 배정. compound 슬롯 패턴 — 자식 slot을 넣은 만큼 grid-template이 자동 조정. `variant`로 컨테이너 표현(outlined/floating/flat), `layout`으로 Sidebar/Topbar 배치 축을 결정.

### Do
- 모든 페이지 쉘의 **진입점** — layout.tsx 또는 섹션 쉘의 최상위에 둔다.
- `AppFrame.Sidebar` / `AppFrame.Topbar` / `AppFrame.Tabs` / `AppFrame.Content` 슬롯을 쓴다. 자식 순서는 자유 (grid-area가 배정).
- 비어있는 슬롯은 아예 **생략**. `data-has-*`가 자동 감지해 grid-template 축소.
- `variant`로 컨테이너 톤을 결정: outlined(기본, 테두리) / floating(그림자, 떠있는) / flat(배경만, 쉘 티 안 남).
- `layout`은 서비스 성격 기준: sidebar-first(Linear·Slack·Figma 패턴) / topbar-first(Jira·Vercel 패턴).

### Don't
- Content 안쪽에서 다시 AppFrame을 중첩하지 않는다 — grid 규칙 깨짐.
- Sidebar·Topbar 안에서 flex/grid를 override로 조립하지 않는다. 각자 자신의 레이아웃 컴포넌트([[components/sidebar]], [[components/topbar]])에 위임.
- 슬롯을 custom DOM으로 대체하지 않는다 — `data-has-*` 감지가 깨짐. 반드시 `AppFrame.X` 사용.
- padding/gap을 override 금지. `--control-h-*`, `--sidebar-w*`, `--topbar-h*` 토큰이 전담.

### Fallback
variant 애매하면 `outlined`. layout 애매하면 `sidebar-first`.

### 관련
- [[components/sidebar]] — Sidebar 슬롯 안에 담김
- [[components/topbar]] — Topbar 슬롯 안
- [[components/tabs]] — Tabs 슬롯 (optional, Topbar 아래 contextual nav)
- [[axes/density]] — sidebar/topbar 폭·높이 토큰이 Density에 반응
- [[axes/shape]] — outlined/floating의 radius·shadow가 Shape 축에 반응

### Props 시그니처
```tsx
<AppFrame
  variant="outlined | floating | flat"       // default: outlined
  layout="sidebar-first | topbar-first"      // default: sidebar-first
>
  <AppFrame.Sidebar>
    <Sidebar>...</Sidebar>
  </AppFrame.Sidebar>

  <AppFrame.Topbar>
    <Topbar>...</Topbar>
  </AppFrame.Topbar>

  <AppFrame.Tabs>                            {/* optional */}
    <Tabs>...</Tabs>
  </AppFrame.Tabs>

  <AppFrame.Content>
    {page}
  </AppFrame.Content>
</AppFrame>
```

### Variant × Layout 매트릭스
| variant | 시각 | 자리 |
|---|---|---|
| `outlined` | 전체 bg + hairline border | 기본 — 관리·대시보드 |
| `floating` | 쉘이 떠있는 느낌, shadow | 랜딩·마케팅·모던 SaaS |
| `flat` | 쉘 티 안 남, 콘텐츠가 바탕에 직접 | 미니멀·docs·에디터 |

| layout | 구조 | 레퍼런스 |
|---|---|---|
| `sidebar-first` | 사이드바가 세로 전체, 탑바는 오른쪽만 | Linear · Slack · Figma |
| `topbar-first` | 탑바가 가로 전체, 사이드바는 아래 왼쪽만 | Jira · Vercel · Confluence |

### 조합 예시
```tsx
// 가장 흔한 쉘 — Sidebar + Topbar + Content
<AppFrame variant="outlined" layout="sidebar-first">
  <AppFrame.Sidebar><Sidebar>…</Sidebar></AppFrame.Sidebar>
  <AppFrame.Topbar><Topbar>…</Topbar></AppFrame.Topbar>
  <AppFrame.Content>{children}</AppFrame.Content>
</AppFrame>

// Topbar 아래 Tabs가 있는 상세 페이지
<AppFrame>
  <AppFrame.Sidebar><Sidebar>…</Sidebar></AppFrame.Sidebar>
  <AppFrame.Topbar><Topbar title="프로젝트" />.</AppFrame.Topbar>
  <AppFrame.Tabs>
    <Tabs value={tab} onValueChange={setTab}>
      <Tabs.List>
        <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
        <Tabs.Trigger value="activity">Activity</Tabs.Trigger>
      </Tabs.List>
    </Tabs>
  </AppFrame.Tabs>
  <AppFrame.Content>{tab === "overview" ? <Overview /> : <Activity />}</AppFrame.Content>
</AppFrame>

// 랜딩 — Topbar만, Sidebar 없음
<AppFrame variant="flat" layout="topbar-first">
  <AppFrame.Topbar><Topbar variant="landing" /></AppFrame.Topbar>
  <AppFrame.Content><Hero /></AppFrame.Content>
</AppFrame>
```
