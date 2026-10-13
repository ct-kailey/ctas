# Radius

### 원칙
컴포넌트 크기별 상대 위계. 이름은 고정, 값은 Shape 축이 결정.
Tooltip < Button < Card < Modal 순서는 어떤 프로젝트에서도 유지.

### Do
- 컴포넌트 크기에 맞춰 스케일 선택: 작을수록 작은 radius.
- 완전한 원형(Avatar, Pill Chip)은 `radius-full`.
- 각져야 하는 표·시트 셀은 `radius-none`.

### Don't
- px 하드코딩 금지. Shape 축이 값 스왑을 담당.
- Modal에 `radius-sm`, Tooltip에 `radius-xl` 같은 위계 역전 금지.

### Fallback
애매하면 `radius-sm` (Button·Input 기본 스케일).

### 관련
- [[axes/shape]] — radius 값을 스왑

### 토큰 표
| Token | 용도 |
|---|---|
| `radius-none` | 표·시트 셀, 각져야 하는 경계 |
| `radius-xs` | Chip, Badge, Tooltip |
| `radius-sm` | Input, Button, Icon Button (기본) |
| `radius-md` | Card, Panel |
| `radius-lg` | Modal, Popover, Dropdown |
| `radius-xl` | 대형 카드 |
| `radius-2xl` | 히어로 카드 |
| `radius-3xl` | 랜딩·대형 오버레이 |
| `radius-full` | Avatar, Pill Chip, 원형 버튼 |
