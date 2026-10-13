# Radio

### 원칙
같은 그룹 안에서 **하나만 선택**하는 컨트롤. 시각(`.indicator`: 외곽 원 + 내부 도트)과 시맨틱(native `<input type="radio">`)을 분리.

색은 [[tokens/color]]의 `--primary` 기반. 상태 4종은 [[components/checkbox]]와 공통 규칙.

### Do
- **같은 name으로 묶는다**: 그룹 전체가 하나의 `name` 속성을 공유. 시맨틱 그룹은 `role="radiogroup"` 래퍼 권장.
- **옵션 2개 이상**: 라디오는 최소 2개일 때 의미가 성립. 1개면 [[components/checkbox]]나 [[components/switch]].
- **선택 취소가 필요하면 Radio가 아니다**: radio는 한 번 선택되면 다시 &ldquo;아무것도 선택 안 함&rdquo;으로 못 돌아온다. 그런 UX가 필요하면 checkbox + 그룹 로직.

### Don't
- 옵션이 5개를 넘기면 Select를 검토. 라디오는 &ldquo;한눈에 보이는 소수의 선택지&rdquo;용.
- SVG 도트를 직접 그리지 않는다. CSS `background`/`transform: scale`로 이미 checked 애니메이션까지 처리됨.

### Fallback
size `md`, status 없음.

### 관련
- [[components/checkbox]] — 다중 선택 버전. Props/스타일 스펙 형제.
- [[tokens/color]] — `--primary` · 상태 토큰

### Props 시그니처
```tsx
<Radio
  size="sm | md"                                         // default: md
  status="success | warning | destructive | info"        // optional
  name / value / checked / defaultChecked / onChange / disabled ...   // native input
>
  {children}                                              // 라벨
</Radio>
```

### 상태 매트릭스
| 상태 | 외곽 원 | 내부 도트 |
|---|---|---|
| unchecked | 배경 `--bg` · 테두리 `--border-strong` | scale(0) (숨김) |
| hover | 테두리 `--fg` | scale(0) |
| checked | 배경 `--primary` · 테두리 `--primary` | scale(1) · 색 `--bg` |
| checked + status | 배경/테두리 상태 토큰 | 그대로 |
