# slide

### 원칙
공간 이동(translate). 이동 거리는 `--motion-distance-scale`이 축 값에 따라 스왑.
Drawer·Toast·Sheet 등 화면 가장자리에서 들어오는 요소.

### Do
- 뷰포트 가장자리에서 들어오는 큰 오버레이(Drawer, Sheet, Toast).
- 방향은 요소의 논리적 위치와 일치. 하단 Toast → `slide-up`, 상단 배너 → `slide-down`.

### Don't
- 앵커(트리거 요소) 기반 등장에는 slide만 쓰지 않는다 (`emerge` 사용).

### Fallback
방향 애매하면 `slide-up`.

### 관련
- [[axes/motion]] — duration과 이동 거리를 스왑
- [[primitives/emerge]] — 앵커 기반 등장은 이쪽

### 축별 스왑
| data-motion | 파라미터 |
|---|---|
| `bouncy` | duration 400ms · distance 1.3× |
| `standard` | duration 200ms · distance 1× |
| `calm` | duration 100ms · distance 0.7× |
| `none` | 즉시 (이동 없음) |

### 겹침 규칙
- `fade`와 조합 필수.
- `emerge-*`와는 대체 관계. 뷰포트 기반이면 slide, 앵커 기반이면 emerge.
