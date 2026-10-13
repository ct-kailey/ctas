# Shadow

### 원칙
표면이 얼마나 위로 떠 있는가 — 시각 위계(elevation). Shape 축이 스타일 스왑.

### Do
- 컴포넌트 elevation에 맞춰 스케일 선택.
- Input focus·미세한 depth: `shadow-xs`.
- Card: `shadow-sm`. Dropdown·Popover: `shadow-md`. Modal: `shadow-lg`. Command Palette: `shadow-xl`.
- 눌린 상태(pressed inset)는 `shadow-inner`.

### Don't
- `box-shadow` 리터럴 하드코딩 금지. 색도 포함 — `rgba(0,0,0,...)`·`oklch(0 0 0 / ...)` 직접 쓰지 말고 `--shadow-*` 토큰 경유.
- 아래 요소(카드)가 위 요소(Modal)보다 강한 그림자 갖지 않는다 (elevation 역전 금지).

### Shadow 색
- `--shadow-color`: oklch(L C H) 세 성분. 알파는 shadow 단계별 상수로 보존.
- 기본은 중성 검정(`0 0 0`), 다크 모드도 동일(그림자는 "빛의 반대", Mode 반전 안 함) — 알파만 다크에서 상향.
- 테마가 override 하면 전체 shadow 톤이 스왑: 예 `--shadow-color: 0.15 0.03 40` → warm 브랜드의 갈색 틴트 그림자.

### Fallback
카드·패널이면 `shadow-sm`, 오버레이면 `shadow-md`.

### 관련
- [[axes/shape]] — Shape가 그림자 스타일을 스왑

### 토큰 표
| Token | 용도 |
|---|---|
| `shadow-xs` | Input focus, 미세 depth |
| `shadow-sm` | Card 기본 |
| `shadow-md` | Dropdown, Popover, Hover Card |
| `shadow-lg` | Modal, Drawer |
| `shadow-xl` | Command Palette, 화면 중심 |
| `shadow-inner` | 눌린 상태 (inset) |
