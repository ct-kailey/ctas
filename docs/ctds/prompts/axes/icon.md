---
axis: icon
selector: '[data-icon-family]'
values: [phosphor, solar, lucide]
default: phosphor
layer: 1
---

# Icon

### 원칙
Icon 축은 **Family** 하나만 담당. 한 페이지 = 한 Family.
Weight는 축이 아니라 `<Icon weight="..." />` prop (컴포넌트별 자유 지정) — 상태 표시용.

### Do
- 아이콘은 항상 의미 기반 이름으로 참조: `<Icon name="check" />`.
- 프로젝트 시작 시 Family 하나 결정. 리스킨 아닌 이상 안 바꾼다.
- 활성/선택 상태 표시엔 `weight=fill`, 그 외에는 `weight=regular`.
- **단순한 상징 우선** — Button/MenuItem 라벨이 이미 의미를 담고 있으니, 아이콘은 1초 안에 분류되는 "모양 꼬리표" 역할. 조합형 메타포(`envelope-plus`, `pencil-simple` 등)보다 원형 상징(`plus`, `x`, `check`, `search`, `trash`, `arrow-right`)이 우선 ([[feedback_simple_icons]]).

### Don't
- 한 페이지에서 두 Family를 섞지 않는다.
- 아이콘을 SVG로 하드코딩하지 않는다. 항상 `<Icon />` 경유.
- Lucide에서 `weight=fill`을 요구하지 않는다 (원본이 fill 미제공).
- 조합형 메타포로 의미를 "그림으로 설명" 하지 않는다 — "새 메시지" 는 `plus` 지 `envelope-plus`/`pencil-simple` 가 아니다. "제출" 은 `arrow-right` 지 `paper-plane` 이 아니다. 라벨에 의미를 넣고 아이콘은 보편 상징.
- 예외: Sidebar·네비처럼 **아이콘 혼자 뜻을 담아야 하는 자리**는 구체 아이콘 OK (`gear`, `house`, `bell`).

### Fallback
Family는 `phosphor`, Weight는 `regular`.

### 값

**Family** (`data-icon-family`)
- `phosphor` — regular/fill 매트릭 매칭. 가장 유연.
- `solar` — 6-스타일 팩. Linear(regular)/Bold(fill) 매칭.
- `lucide` — Feather 계승. 얇은 stroke. regular만.

**Weight** (`<Icon weight="…" />` prop — 축 아님)
- `regular` — 기본 outline.
- `fill` — 채움. 활성/선택 상태.

### 기본값
`family=phosphor`, `weight=regular`

### 축 간 상호작용

- **[[axes/palette]] = `mono`**: `--icon-color`가 자동으로 `--primary` 대신 `--fg-muted`로 override. 아이콘은 어떤 family든 중성 fg 톤. Family 선택과 무관하게 "mono 모드"의 색 규칙이 상속됨.
- **[[axes/palette]] 비mono**: `--icon-color = --primary`. 아이콘은 브랜드 액센트 톤.
- **[[axes/density]]**: `--icon-size-xs/sm/md/lg`가 `--space-scale`에 반응. 밀도 축을 바꾸면 아이콘 크기도 비례 스케일.

### 페어링
- `phosphor`·`solar` — regular/fill 모두 매칭. 활성 상태 표시 필요한 프로젝트 표준
- `lucide` — regular만 지원. 활성 상태를 색·배경으로만 표현하는 프로젝트에 적합
- 특정 [[axes/shape]] 값과의 강한 페어링은 없음. Family 선택은 브랜드 톤 기준

### 관련
- [[axes/palette]] — mono 선택 시 icon-color 자동 중성화
