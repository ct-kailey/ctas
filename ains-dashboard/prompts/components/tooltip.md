# Tooltip

### 원칙
hover·focus 시 뜨는 **짧은 보조 설명**. Radix Tooltip 위에 얹은 compound. 라벨이 없는 [[components/icon-button]]의 의미 설명, 축약된 단어의 보충, 단축키 힌트에 사용. **클릭 액션은 담지 않는다** — 그건 [[components/popover]].

### Do
- 라벨이 없는 아이콘 버튼엔 반드시 Tooltip + `aria-label` 둘 다.
- 내용은 **한 줄** 또는 **최대 두 줄** — Tooltip은 설명이 아니라 힌트.
- 단축키는 [[components/shortcut]]과 조합: `content={<>붙여넣기 <Shortcut>⌘V</Shortcut></>}`.
- `side`로 방향 지정 — 공간이 좁은 쪽은 자동 flip.
- `followMouse`는 긴 호버 요소(차트·툴바)에서만.

### Don't
- 모바일/터치에선 Tooltip 금지 — hover가 없음. 중요한 정보는 Label·description으로.
- 액션 버튼이 담긴 Tooltip 금지 — [[components/popover]]로.
- content에 긴 문단 금지. 설명이 길면 Dialog 또는 Popover.
- hover 시 사라지는 중요 정보 금지 — WCAG 2.5.3 (호버 지속성) 위반.
- 커스텀 애니메이션 금지. `.m-float` 유틸이 전담.

### Fallback
side 애매하면 `top`, align 애매하면 `center`, delayDuration 애매하면 Radix 기본(~700ms).

### 관련
- [[components/icon-button]] — 가장 흔한 트리거 (aria-label 보충)
- [[components/shortcut]] — content 안쪽 단축키 힌트
- [[components/popover]] — 액션·입력이 담긴 자리 (Tooltip 대신)
- [[axes/motion]] — Content in/out은 `.m-float` 유틸

### Props 시그니처
```tsx
<Tooltip
  content={ReactNode}                          // 한 줄 또는 Shortcut 조합
  side="top | right | bottom | left"           // default: top (자동 flip)
  align="start | center | end"                 // default: center
  sideOffset={number}                          // default: 6
  arrowOffset={number}                         // 꼭지 중심 오프셋 (followMouse=true 시 무시)
  followMouse={boolean}                        // 트리거 위 커서 추적
  arrow={boolean}                              // default: true
  delayDuration={number}                       // ms, default: Radix 기본
  open={boolean}
  onOpenChange={(open: boolean) => void}
>
  {trigger}                                    // 자동으로 asChild 처리
</Tooltip>
```

### Size · 색
Tooltip은 size prop 없음 — 콘텐츠에 맞춰 자동 폭 (최소 240px). 색은 Mode 반전 (라이트에선 다크 Tooltip, 다크에선 라이트) — `--tooltip-bg`·`--tooltip-fg` 토큰이 자동.

### 조합 예시
```tsx
// 아이콘 버튼 라벨 — 가장 흔한 자리
<Tooltip content="복사">
  <IconButton icon={<Icon name="copy" />} aria-label="복사" />
</Tooltip>

// 단축키 힌트 — Shortcut 조합
<Tooltip content={<>붙여넣기 <Shortcut>⌘V</Shortcut></>}>
  <IconButton icon={<Icon name="clipboard" />} aria-label="붙여넣기" />
</Tooltip>

// followMouse — 긴 요소 (툴바 레이블)
<Tooltip content="Timeline에서 이 시점을 선택" side="bottom" followMouse>
  <div className="timeline-track">...</div>
</Tooltip>

// 축약어 보충
<Tooltip content="Operational Expenditure (운영비)" side="top">
  <span className="metric-label">OPEX</span>
</Tooltip>
```
