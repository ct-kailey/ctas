# Breadcrumb

### 원칙
현재 페이지가 계층 구조의 어디에 있는지 보여주고, **상위로 한 번에** 돌아가게 해주는 nav 컨트롤. 시각 무게는 최소 — [[components/button]] `size=xs · variant=ghost`와 같은 톤. 페이지 헤더 위 얇은 한 줄로만 존재하고, 자기 자신을 스캔 대상으로 만들지 않는다.

### Do
- **깊이 3 이상**일 때만 쓴다 — 2단계면 상위 링크 하나로 충분하고, 브래드크럼은 노이즈가 된다.
- **마지막 항목은 `Breadcrumb.Current`** — 링크가 아닌 텍스트. `--fg-strong`로 자연스럽게 위계를 준다.
- **첫 항목은 워크스페이스/홈 아이콘** 하나까지 허용. 그 외 항목엔 아이콘 붙이지 않는다 (스캔 방해).
- **아이콘 단독 항목**: `Breadcrumb.Link`/`Current`에 `children` 없이 `leftIcon`만 넘기면 정사각 hit box 아이콘 버튼이 된다. `aria-label` 반드시 지정.
- **URL 계층이 그대로 라벨** — 사이트맵의 실제 위치를 그대로 반영. 계층에 없는 임의 카테고리를 만들어 붙이지 않는다.
- **모바일에서는 축약** — 첫 항목 + `Breadcrumb.Ellipsis` + 마지막 두 항목. 6개 이상이면 축약이 필수.
- **Next.js `<Link>` 등 라우터**는 `<Breadcrumb.Link asChild>`로 감싼다. 스타일 유지한 채 SPA 네비게이션 위임.
- **형제 전환이 필요한 segment**는 `Breadcrumb.Menu`로. ▾ caret이 붙은 트리거를 눌러 같은 레벨의 다른 페이지(프로젝트·워크스페이스·브랜치 등)로 바로 이동. 현재 페이지 자리에 쓸 때는 `active` 필수 — `aria-current="page"`와 `--fg-strong` 톤을 자동으로 맞춘다.
- **접근성**: 루트가 자동으로 `<nav aria-label="Breadcrumb">` + `<ol>`, 마지막 항목에 `aria-current="page"`를 붙인다. separator는 `aria-hidden`.

### Don't
- **탭 전환용으로 쓰지 않는다** — 그건 [[components/tabs]]. Breadcrumb은 URL 자체가 바뀌는 계층 이동 전용.
- **마지막 항목을 링크로 만들지 않는다** — 자기 페이지를 다시 링크하면 새로고침 트리거가 되고 사용자를 헷갈리게 한다.
- **`Button size=xs`가 아닌 다른 사이즈**로 커스텀하지 않는다 — 페이지 헤더 위 최소 무게가 유일한 존재 이유.
- **활성 색을 `--primary`로 덮지 않는다** — 활성은 `--fg-strong`(무채). 브랜드 컬러를 여기 쓰면 CTA와 위계가 충돌.
- **아이콘 남발 금지** — 첫 항목 외에 아이콘 붙이면 라벨 스캔이 무너진다.
- **draggable/sortable 만들지 않는다** — 계층은 URL이 정한다. UI에서 조작할 대상이 아님.
- **`Breadcrumb.Menu`를 탭/필터로 쓰지 않는다** — Menu는 "같은 레벨의 다른 페이지로 URL 이동" 전용. 같은 페이지 안에서 뷰만 바꾸는 건 [[components/tabs]].

### Fallback
- 라우터 결정 애매하면 기본 `<a href>` 렌더. 프레임워크 붙일 때 `asChild`로 교체.
- 축약 위치 애매하면 첫 · 마지막 두 개 유지, 중간 전부 `Breadcrumb.Ellipsis`로 접기.
- 규칙대로 판단 불가한 경우 사용자에게 확인.

### 관련
- [[components/button]] — Link 시각을 그대로 상속 (`size=xs · variant=ghost`)
- [[components/tabs]] — 페이지 안 콘텐츠 전환은 Breadcrumb이 아니라 Tabs
- [[components/sidebar]] — 계층의 "전체 뷰"는 Sidebar, "현재 위치 트레일"은 Breadcrumb
- [[axes/density]] — `--control-h-xs`가 Link 높이에 매핑
- [[axes/shape]] — `--radius-xs`가 Link hover 표면 radius에 매핑
- [[tokens/color]] — `--fg-muted`(Link) → `--fg-strong`(Current) 대비, `--hover`(hover 표면)

### Props 시그니처
```tsx
<Breadcrumb
  aria-label="Breadcrumb"            // default: "Breadcrumb"
  separator={<Icon name="caret-right" />}   // default: caret-right icon
>
  <Breadcrumb.Link href="/" leftIcon={<Icon name="house" />}>Home</Breadcrumb.Link>
  <Breadcrumb.Menu
    items={[
      { label: "Alpha", href: "/p/alpha", active: true },
      { label: "Beta",  href: "/p/beta" },
    ]}
  >
    Alpha
  </Breadcrumb.Menu>
  <Breadcrumb.Ellipsis items={[...]} />
  <Breadcrumb.Current>Breadcrumb</Breadcrumb.Current>
</Breadcrumb>
```

### Variant 매트릭스
| variant | 용도 | 금지 조합 |
|---|---|---|
| `Breadcrumb.Link` | 상위 계층 링크. Button xs · ghost 톤. hover 시 `--hover` 표면. | 마지막 항목엔 쓰지 않음. |
| `Breadcrumb.Current` | 현재 페이지. `--fg-strong` 텍스트, hover 반응 없음. | `href`·`onClick` 붙이지 않음. |
| `Breadcrumb.Ellipsis` | 축약 트리거. 항상 클릭 가능. [[components/select]]와 동일한 팝오버 표면으로 숨긴 항목 리스트를 연다. | `items`에 5개 이상 넣지 않는다 — 그러면 축약이 아니라 실질적 서브메뉴가 됨. 정적(클릭 불가) 마커는 지원하지 않는다. |
| `Breadcrumb.Menu` | 형제 전환 트리거. ▾ caret이 붙은 segment를 눌러 같은 레벨 페이지로 이동. `active=true`로 현재 페이지 자리에도 쓸 수 있다 (aria-current + fg-strong 자동). | 아이콘 단독 모드 지원 안 함 — 트리거 라벨 필수. 탭 전환용으로 쓰지 않는다. |

### 조합 예시
```tsx
// 표준 — Next Link + 홈 아이콘 + 축약
<Breadcrumb aria-label="문서 경로">
  <Breadcrumb.Link asChild leftIcon={<Icon name="house" />}>
    <Link href="/">Home</Link>
  </Breadcrumb.Link>
  <Breadcrumb.Ellipsis
    items={[
      { label: "Components", href: "/components" },
      { label: "Navigation", href: "/components/nav" },
    ]}
  />
  <Breadcrumb.Link asChild>
    <Link href="/components/nav">Navigation</Link>
  </Breadcrumb.Link>
  <Breadcrumb.Current>Breadcrumb</Breadcrumb.Current>
</Breadcrumb>

// 프로젝트 스위처 — Menu로 형제 전환
<Breadcrumb aria-label="프로젝트 경로">
  <Breadcrumb.Link asChild leftIcon={<Icon name="user" />}>
    <Link href="/">Workspace</Link>
  </Breadcrumb.Link>
  <Breadcrumb.Menu
    items={[
      { label: "Alpha", href: "/p/alpha", active: true },
      { label: "Beta",  href: "/p/beta" },
      { label: "Gamma", href: "/p/gamma" },
    ]}
  >
    Alpha
  </Breadcrumb.Menu>
  <Breadcrumb.Current>Settings</Breadcrumb.Current>
</Breadcrumb>

// 현재 페이지 자체가 메뉴 — active=true로 aria-current="page" 유지
<Breadcrumb aria-label="브랜치 경로">
  <Breadcrumb.Link href="/">Repo</Breadcrumb.Link>
  <Breadcrumb.Menu
    active
    items={[
      { label: "main",    onSelect: () => switchBranch("main"), active: true },
      { label: "develop", onSelect: () => switchBranch("develop") },
      { label: "staging", onSelect: () => switchBranch("staging") },
    ]}
  >
    main
  </Breadcrumb.Menu>
</Breadcrumb>
```
