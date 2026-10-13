# Z-index

### 원칙
겹침 순서(layering)의 계층. 이름 붙은 스케일만 사용해 stacking context 사고를 방지.
Tooltip은 언제나 최상단.

### Do
- 오버레이 레이어는 이름 있는 z-index 토큰 사용.
- Sticky header는 `z-sticky`, dropdown류는 `z-dropdown`.
- Modal은 `z-modal`, 그 위 popover는 `z-popover`.
- Tooltip은 `z-tooltip` (항상 최상단).

### Don't
- 임의 정수(9999 등) 하드코딩 금지.
- Tooltip을 Modal 아래에 두지 않는다.
- Toast를 Modal 아래에 두지 않는다 (Modal 열린 상태에서도 알림은 보여야 함).

### Fallback
정할 수 없으면 `z-base` (0).

### 관련
N/A

### 토큰 표
| Token | 용도 |
|---|---|
| `z-base` | 기본 |
| `z-docked` | 도킹된 요소 (컨텐츠 내 sticky sub-header 등) |
| `z-dropdown` | Dropdown, Select |
| `z-sticky` | Page-level sticky header |
| `z-overlay` | 배경 dim overlay |
| `z-modal` | Modal, Drawer |
| `z-popover` | Popover, Hover Card |
| `z-toast` | Toast |
| `z-tooltip` | Tooltip (최상단) |
