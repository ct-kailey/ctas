# ChoiceCard

### 원칙
페이지 중앙에서 시각적으로 큰 선택지를 나열하거나(온보딩·유저 타입·플랜 선택), 아이콘·설명이 있는 네비게이션 카드가 필요할 때(문서 지도·설정 라우트). 세로 정렬(vertical, 기본)은 가로 그리드에 2~4개 나란히, 가로 정렬(horizontal)은 아이콘+텍스트가 좌측정렬된 리스트/그리드. radio/checkbox 모드는 native `<input>`을 label 안에 숨겨 시맨틱과 폼 전송을 유지하고, link 모드는 Next Link로 렌더되어 선택 상태 없이 네비게이션만 담당.

### Do
- **selection은 페이지 중앙 큰 선택지 전용**: 폼 안의 옵션 나열이면 [[components/selectable-card]] (가로 리스트) 또는 [[components/radio]]. radio/checkbox 모드의 ChoiceCard는 선택 자체가 페이지 목적일 때.
- **link 모드는 아이콘+설명이 있는 네비게이션**: 문서 지도·설정 하위 라우트 진입처럼 다음 페이지에 어떤 내용이 있는지 미리 보여줘야 할 때. 단순 메뉴라면 [[components/menu-item]], 아이콘 없는 네비 리스트는 [[components/list-item]].
- **그리드 레이아웃**: vertical은 `repeat(3, 1fr)` 표준 리듬, horizontal은 `repeat(auto-fill, minmax(240px, 1fr))` 로 2열씩 쌓이는 리듬이 자연스럽다. 옵션이 5개 이상인 selection은 [[components/selectable-card]] 세로 리스트로 전환.
- **같은 그룹은 같은 `name`**: radio/checkbox는 `role="radiogroup"` 래퍼 권장. link 모드는 `name` 불필요.
- **icon slot은 ReactNode까지 허용**: 기본은 `icon="palette"` 같은 IconName 문자열. 필요하면 fill variant·커스텀 색 Icon·`<img>`·로고 svg를 직접 넘길 수 있다. 생략하면 아이콘 영역 자체가 사라져 텍스트만.
- **아이콘·설명 둘 다 선택**: 둘 다 있으면 가장 풍부, 하나만 있어도 레이아웃 유지. horizontal은 아이콘 생략해도 좌측정렬이라 어색하지 않지만, vertical은 아이콘이 없으면 플레인한 라벨 카드가 된다.
- **상단 잘림 방지**: hover 시 `translateY(-1px)`. 부모 컨테이너의 `padding-top` 최소 `space-1` 또는 `overflow: visible` 유지. 컴포넌트가 `margin-top: var(--hairline)`로 1차 방어.

### Don't
- 선택 인디케이터(dot/check)를 카드에 그리지 않는다 — 카드 전체가 인디케이터(경계 accent 승격 + 아이콘 색 반전).
- title/description 밖의 커스텀 콘텐츠(입력 필드, CTA 버튼) 금지 — 카드 안에 넣지 말고 별도 카드/스텝으로 분리.
- vertical 레이아웃을 세로 스택으로 여러 개 쌓지 않는다. 세로 리스트는 [[components/selectable-card]] 또는 horizontal 레이아웃의 용도.
- link 모드에 radio/checkbox 상태 흉내 금지 — 네비게이션은 눌리면 떠나는 거라서 "선택됨" 개념이 없다. 현재 페이지 하이라이트가 필요하면 [[components/menu-item]].
- 커스텀 ReactNode icon slot에 큰 이미지 그대로 넣지 않는다 — slot 폭이 커지면 세로 리듬이 깨짐. 자체 width/height를 아이콘 크기 수준(~24~32px)으로 맞춘 뒤 넘긴다.

### Fallback
`mode` 미지정 시 `radio`, `layout` 미지정 시 `vertical`. link 모드는 `href` 필수.

### 관련
- [[components/selectable-card]] — 가로 정렬(좌측 아이콘/인디케이터 + 우측 텍스트). 세로 리스트·폼 안 옵션용.
- [[components/radio]] — 텍스트 한 줄 단일 선택.
- [[components/checkbox]] — 다중 선택 인디케이터.
- [[tokens/color]] — checked 상태의 `--selected-fg` 토큰.
- [[axes/icon]] — 아이콘이 화면 위계에서 강한 시각 요소이므로 Icon 축 값이 카드 인상을 좌우.

### Props 시그니처
```tsx
<ChoiceCard
  mode="radio | checkbox | link"                   // default: radio
  layout="vertical | horizontal"                   // default: vertical
  icon={IconName | ReactNode}                      // optional. 문자열이면 기본 Icon, 노드면 그대로 slot
  title={ReactNode}                                // required
  description={ReactNode}
  // mode="radio" | "checkbox":
  name / value / checked / defaultChecked / onChange / disabled ...
  // mode="link":
  href="/path"                                     // required when mode="link"
/>
```

### Variant 매트릭스
| mode | 선택 정책 | 용도 |
|---|---|---|
| `radio` | 그룹 내 단일 | 온보딩 유저 타입, 플랜 선택 등 하나만 고르는 경우 (기본) |
| `checkbox` | 다중 | 관심사·기능 세트 다중 선택 (예: "관심 있는 주제를 모두 골라주세요") |
| `link` | 없음 (Next Link) | 아이콘+설명이 있는 네비게이션 — 문서 지도, 설정 섹션 입구 |

| layout | 정렬 | 용도 |
|---|---|---|
| `vertical` | 아이콘 위·텍스트 아래 가운데 | 페이지 중앙 큰 선택지 (기본) |
| `horizontal` | 아이콘 왼쪽·텍스트 오른쪽 좌측정렬 | 리스트형 네비게이션, 밀도 높은 그리드 |

**금지 조합**
- vertical layout + 5개 이상 세로 스택 → 리스트형([[components/selectable-card]])으로 전환.
- 한 그리드 안에서 아이콘 있는 카드 + 없는 카드 섞기 금지 — 중심축이 흔들림. 전부 있거나 전부 없거나.
- link 모드 + radio/checkbox 상태 흉내 금지.

### 조합 예시

**radio + vertical — 온보딩 유저 타입 선택**
```tsx
<div
  role="radiogroup"
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "var(--space-4)",
  }}
>
  <ChoiceCard
    name="user-type"
    value="designer"
    icon="palette"
    title="디자이너"
    description="UI/UX 작업이 주 업무"
    defaultChecked
  />
  <ChoiceCard
    name="user-type"
    value="developer"
    icon="code"
    title="개발자"
    description="코드를 작성하고 배포"
  />
  <ChoiceCard
    name="user-type"
    value="pm"
    icon="clipboard"
    title="PM"
    description="제품과 팀을 조율"
  />
</div>
```

**link + horizontal — 문서 지도**
```tsx
<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
    gap: "var(--space-3)",
  }}
>
  <ChoiceCard
    mode="link"
    layout="horizontal"
    href="/getting-started/architecture"
    icon="stack"
    title="전체 구조"
    description="템플릿·축·토큰·컴포넌트가 어떻게 연결되나."
  />
  <ChoiceCard
    mode="link"
    layout="horizontal"
    href="/tokens/color"
    icon="palette"
    title="토큰"
    description="color·spacing·radius·shadow·motion·typography 전체 값."
  />
</div>
```
