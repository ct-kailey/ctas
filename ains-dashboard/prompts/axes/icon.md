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

### Don't
- 한 페이지에서 두 Family를 섞지 않는다.
- 아이콘을 SVG로 하드코딩하지 않는다. 항상 `<Icon />` 경유.
- Lucide에서 `weight=fill`을 요구하지 않는다 (원본이 fill 미제공).

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

### 페어링
- `phosphor`·`solar` — regular/fill 모두 매칭. 활성 상태 표시 필요한 프로젝트 표준
- `lucide` — regular만 지원. 활성 상태를 색·배경으로만 표현하는 프로젝트에 적합
- 특정 [[axes/shape]] 값과의 강한 페어링은 없음. Family 선택은 브랜드 톤 기준

### 관련
N/A
