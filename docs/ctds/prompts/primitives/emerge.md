# emerge

### 원칙
앵커(트리거)에서 자라나는 등장. slide + scale + fade가 하나로 묶인 프리미티브.
Radix의 `data-side` 자동 스왑과 결합해 방향이 자동 결정.

### Do
- 앵커 기반 오버레이(Tooltip·Popover·DropdownMenu·ContextMenu·HoverCard) 등장에 사용.
- `transform-origin`은 Radix의 `--radix-{component}-content-transform-origin` 사용.
- 방향 클래스는 아래 [방향 매핑](#방향-매핑) 표를 따른다 (Radix `data-side` 자동 반영).

### Don't
- 뷰포트 가장자리에서 오는 Drawer·Sheet·Toast에는 emerge 쓰지 않는다 (`slide-*` 사용).
- `transform-origin`을 직접 계산해 넣지 않는다. 반드시 Radix의 `--radix-{component}-content-transform-origin`을 참조 (앵커 위치 자동 반영).

### Fallback
앵커 기반 오버레이는 무조건 emerge. 방향은 Radix가 계산한 `data-side` 신뢰.

### 관련
- [[axes/motion]] — duration·거리·scale amount를 스왑
- [[primitives/slide]] · [[primitives/scale]] — emerge의 구성 요소

### 축별 스왑
| data-motion | 파라미터 |
|---|---|
| `bouncy` | duration 400ms · distance 1.3× · scale 0.94→1 |
| `standard` | duration 200ms · distance 1× · scale 0.96→1 |
| `calm` | duration 100ms · distance 0.7× · scale 0.98→1 |
| `none` | 즉시 (변화 없음) |

### 겹침 규칙
- 자기 자신이 이미 slide + scale + fade 조합이라 다른 프리미티브와 겹치지 않는다.
- 다른 프리미티브(예: shake, pulse)는 emerge 등장 후 별개 이벤트로 실행 가능.

### 방향 매핑
Radix의 `data-side`가 앵커 위치 반대 방향에서 등장하도록 자동 매핑된다.

| Radix `data-side` | emerge 방향 클래스 | 의미 |
|---|---|---|
| `top` | `m-emerge-from-bottom` | 아래에서 올라옴 |
| `bottom` | `m-emerge-from-top` | 위에서 내려옴 |
| `left` | `m-emerge-from-right` | 오른쪽에서 옴 |
| `right` | `m-emerge-from-left` | 왼쪽에서 옴 |
