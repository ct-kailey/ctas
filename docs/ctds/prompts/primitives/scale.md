# scale

### 원칙
크기 변화(0.96 → 1). `transform-origin`을 앵커 쪽으로 두면 앵커에서 자라나는 느낌.
강조 등장의 기본. fade와 조합해 사용.

### Do
- Popover·Modal·Tooltip 등장 시 fade와 조합해 "안착" 느낌.
- `transform-origin`을 앵커 방향으로 명시. 오버레이는 Radix의 `--radix-*-content-transform-origin` 사용.

### Don't
- 큰 스케일 변화(0.5 → 1) 금지 — 위압적. 0.9 ~ 1.0 범위 유지.
- 반복 스케일에 쓰지 않는다 (`pulse` 사용).
- 좁은 UI 안에서 여러 요소가 동시에 scale 등장하지 않는다.

### Fallback
Popover/Modal/Tooltip은 이걸 사용. 나머지는 fade가 우선.

### 관련
- [[axes/motion]] — duration과 scale amount를 스왑
- [[primitives/emerge]] — scale + slide + fade 조합의 표준 형태

### 축별 스왑
| data-motion | 파라미터 |
|---|---|
| `bouncy` | duration 400ms · scale 0.94 → 1 |
| `standard` | duration 200ms · scale 0.96 → 1 |
| `calm` | duration 100ms · scale 0.98 → 1 |
| `none` | 즉시 scale 1 (변화 없음) |

### 겹침 규칙
- `fade`와 조합 필수 (opacity 없이 scale만 하면 어색).
