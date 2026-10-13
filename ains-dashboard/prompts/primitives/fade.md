# fade

### 원칙
opacity만 트랜지션. 위치·크기 변화 없음. 상태 전환의 가장 기본 프리미티브.

### Do
- 요소의 표시/숨김, 상태 전환에 사용.
- 다른 프리미티브와 조합해 "fade + scale" 같은 오버레이 등장 표현.

### Don't
- 공간 이동이 필요한 곳에는 fade만 쓰지 않는다.
- 반복(무한 loop)에 fade 쓰지 않는다 (`pulse` 사용).

### Fallback
가장 안전한 트랜지션. 상태 전환의 기본값.

### 관련
- [[axes/motion]] — duration을 스왑
- [[primitives/scale]] · [[primitives/emerge]] — fade와 자주 조합

### 축별 스왑
| data-motion | 파라미터 |
|---|---|
| `bouncy` | duration 400ms |
| `standard` | duration 200ms |
| `calm` | duration 100ms |
| `none` | duration 0ms (즉시) |

### 겹침 규칙
- `scale`, `slide-*`, `emerge-*`와 조합 허용.
- 스스로 반복하지 않음 (단발성).
