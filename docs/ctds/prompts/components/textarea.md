# Textarea

### 원칙
다중 행 텍스트 입력. [[components/input]]과 **시각·width·label 규약 100% 공유** — 다른 점은 **높이 조절**뿐. `autoResize`로 내용에 맞춰 자동 성장(기본), 수동 모드엔 **커스텀 리사이즈 핸들**(브라우저 기본 그립 대신 bottom-center 캡슐). minRows / maxRows로 성장 한계 지정. `showCount`로 maxLength 카운터 노출.

### Do
- 짧은 입력(한 줄)엔 [[components/input]], **긴 서술·메모·설명문**엔 Textarea.
- `autoResize=true`(기본): 내용 따라감. `maxRows`에 닿으면 세로 스크롤.
- 수동 리사이즈가 유용한 자리(에디터·댓글): `autoResize={false}` + `minRows`.
- maxLength가 있으면 `showCount`로 카운터 노출. 넘기면 `.countOver`로 destructive 톤.
- Input 옆 나란히 놓을 땐 size·variant 통일.

### Don't
- 한 줄 입력에 쓰지 않는다 — [[components/input]].
- 브라우저 기본 `resize` 쓰지 않는다 (컴포넌트가 none으로 강제). 커스텀 핸들만.
- 높이를 CSS로 override 금지. autoResize 쓰거나 minRows/maxRows로.
- line-height 변경 금지. autoResize 계산이 깨짐.
- `showCount` 없이 maxLength만 걸고 끝내지 않는다 — 사용자가 왜 끊기는지 모름.

### Fallback
size 애매하면 `md`, variant 애매하면 `outline`, autoResize 애매하면 `true`, rows 애매하면 `3`.

### 관련
- [[components/input]] — 한 줄 입력, 모든 시각·width·label 규약 공유
- [[components/form-field]] — label·description·warning 자리
- [[axes/density]] — padding·font-size가 Density에 반응
- [[axes/shape]] — radius가 Shape 축에 반응

### Props 시그니처
```tsx
<Textarea
  size="sm | md | lg"                          // default: md
  variant="outline | filled | line"            // default: outline
  width="fill | md | lg | number"              // default: "fill"
  invalid={boolean}                            // warning 있으면 자동 true
  label={ReactNode}
  description={ReactNode}
  warning={ReactNode}
  autoResize={boolean}                         // default: true
  minRows={number}                             // autoResize 하한. 기본 rows=3
  maxRows={number}                             // autoResize 상한. 넘으면 스크롤
  showCount={boolean}                          // default: false
  rows={number}                                // default: 3
  value={string} defaultValue={string}
  onChange={(e) => void}
  maxLength={number}
  disabled={boolean}
  readOnly={boolean}
  required={boolean}
  placeholder={string}
  id={string}
/>
```

### Variant · Size 매트릭스
Input과 동일. 자세히는 [[components/input]] 참고.

### Mode 매트릭스
| 모드 | 조건 | 동작 |
|---|---|---|
| autoResize (기본) | `autoResize=true` | 내용 따라 성장, maxRows 도달 시 세로 스크롤, 커스텀 핸들 숨김 |
| manual | `autoResize=false` | minRows 높이 고정, 커스텀 핸들(bottom-center)로 드래그 리사이즈 |

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | Input default |
| hover | border-strong |
| focus-visible | ring |
| disabled | opacity 0.5, cursor not-allowed |
| readOnly | bg-subtle 유지, cursor default |
| invalid / warning | border destructive, warning 메시지 노출 |
| count over (showCount + maxLength) | 카운터 destructive 톤 |

### 조합 예시
```tsx
// 기본 — autoResize + 카운터
<Textarea
  label="메모"
  description="최대 500자"
  value={memo}
  onChange={(e) => setMemo(e.target.value)}
  maxLength={500}
  showCount
/>

// 매뉴얼 리사이즈 — 에디터 자리
<Textarea
  label="본문"
  autoResize={false}
  minRows={10}
  variant="filled"
/>

// 경고 상태
<Textarea
  label="피드백"
  value={feedback}
  onChange={(e) => setFeedback(e.target.value)}
  warning={feedback.length < 10 ? "최소 10자 이상 입력하세요" : undefined}
/>

// Line variant — 미니멀 폼
<Textarea variant="line" size="lg" label="소개" />
```
