# Hint

### 원칙
흐름 속에 스며드는 **참고 한 줄~두 줄**. 아이콘 하나와 muted 텍스트로만 구성된 가장 가벼운 안내. 페이지 폭을 차지하지 않고, 자리의 성격은 "이 자리에서 알아야 할 것"의 각주 — [[components/callout]]처럼 액션으로 유도하지 않고, [[recipes/page-banner]]처럼 상태를 외치지 않는다.

**아이콘 + 텍스트 조합의 모든 안내는 반드시 이 컴포넌트 경유.** 와이어프레임·페이지에 `<Icon /> + <span>`을 수제로 조립해서 "ℹ️ 어쩌구" 한 줄을 만드는 패턴 영구 금지 — Hint 하나로 통일한다. 수제 조립은 size·color·vertical-align·둘째 줄 들여쓰기가 매번 어긋나서 리듬이 깨지는 반복 함정이다 ([[feedback_no_hand_rolled_components]], [[feedback_local_derivative_over_handrolled]]).

### Do
- **아이콘 + 텍스트 한 줄짜리 안내는 전부 Hint**. 폼 helper, 섹션 각주, 리스트 하단 주석 등.
- 아이콘은 **1개 고정**, 자유롭게 선택 (`info` `question` `brackets-square` `clock` `shield-check` 등 상황에 맞게).
- 텍스트는 1~2줄. 두 줄 넘어가면 둘째 줄은 아이콘 폭만큼 자동 들여쓰기 (hanging indent — 컴포넌트가 처리).
- **줄 바꿈이 애매하면 저자가 호흡 단위로 끊어준다.** 긴 문장이 어중간한 자리에서 자동 줄 바꿈되면 리듬이 깨짐. 문장이 두 호흡으로 나뉘면 `.` 바로 뒤에서 사람이 `\n`을 넣어 **문장 단위로** 끊어라 (JSX에서는 중괄호 안 템플릿 리터럴 또는 두 `<Hint>` 분리). 자동 줄 바꿈에 맡기면 "···하고 승인한 / 뒤 실행을" 같은 어색한 지점에서 꺾인다.
- 색은 **neutral이 기본**. 톤 신호가 꼭 필요할 때만 brand/success/warning/destructive — 아이콘 색만 바뀌고 텍스트는 muted 유지 ([[components/callout]]보다 조용).
- 아이콘 수직 정렬은 **첫 줄 캡 하이트 중앙** — flex align-items 트릭 대신 `vertical-align: text-bottom`으로 line box 안에 흘려넣기 (내부 구현 책임).

### Don't
- [HARD] **아이콘 + 텍스트를 수제 조립 금지** — `<span><Icon/> …</span>`, `<div className="hint"><Icon/>…</div>` 전부 금지. 반드시 `<Hint>` 사용.
- [HARD] 액션 버튼을 넣지 않는다 — 액션이 필요하면 [[components/callout]].
- [HARD] 배경·테두리 둘 다 금지 ([[PRINCIPLES]] §5b). Hint는 **배경·테두리 둘 다 없음**이 기본.
- [HARD] 톤 신호를 띠는 **배경**은 금지 — 톤이 필요하면 아이콘 색만 (`tone="warning"`). 배경까지 가야 하면 [[components/callout]].
- [SOFT] 3줄 이상 텍스트 금지 — 길어지면 섹션 자체가 "안내 블록"이 돼야 함. Hint는 각주 성격 유지.
- [SOFT] 리스트·강조 같은 서식 금지. 평문만.
- [SOFT] 폼 필드 helper text는 [[components/form-field]]의 자체 helper를 쓴다. Hint는 **폼 밖, 섹션 안 설명** 전용.

### Fallback
아이콘이 애매하면 `info`. 질문·도움말이면 `question`, 코드·기술 설명이면 `brackets-square`.

### 관련
- [[components/callout]] — 톤·액션·배경 있는 안내 블록. Hint는 액션 없음, 배경 없음.
- [[recipes/page-banner]] — 페이지 폭 상태 바. Hint는 흐름 속 각주.
- [[components/form-field]] — 폼 helper text 전용 자리.
- [[tokens/color]] — fg-muted, primary/success/warning/destructive
- [[tokens/typography]] — text-sm 기본, line-height 1.6

### Props 시그니처
```tsx
<Hint
  icon={IconName}                        // default: "info" — 자유롭게
  size="sm | md"                         // default: "sm"
  tone="neutral | brand | success | warning | destructive"  // default: "neutral"
>{children}</Hint>
```

### Variant 매트릭스
tone은 **아이콘 색만** 스왑. 텍스트는 전 톤에서 fg-muted 고정 — Callout보다 조용한 성격을 유지한다.

| tone | 아이콘 색 | 자리 |
|---|---|---|
| `neutral` | `fg-muted` | 기본. 그냥 각주. |
| `brand` | `primary` | 자리의 핵심 기능을 가리키는 각주. |
| `success` | `success` | 완료·안전 상태 각주. |
| `warning` | `warning` | 주의 각주 (배경 띠까지 가면 Callout). |
| `destructive` | `destructive` | 되돌릴 수 없는 결과 각주. |

### Size 가이드
| size | font-size | line-height | icon size | 자리 |
|---|---|---|---|---|
| `sm` | `--text-sm` | 1.6 | 16 | 섹션 안 각주 (기본) |
| `md` | `--text-base` | 1.6 | 20 | 페이지 폭 참고 블록 |

### 조합 예시
```tsx
// 기본 각주
<Hint>최근 30일 활동만 표시됩니다.</Hint>

// 아이콘 자유 선택
<Hint icon="clock">업로드한 파일은 24시간 동안 임시 저장소에 남아 있습니다.</Hint>

// 긴 설명 — 저자가 문장 단위로 호흡을 끊어줌 (자동 줄 바꿈 금지)
<Hint icon="brackets-square">
  {`문서 등록은 추출과 정리까지 자동 처리합니다.
AI 작업 계획을 요청하고 승인한 뒤 실행을 요청하면, 연결된 실행기가 코드 변경안과 테스트 결과를 작성합니다.`}
</Hint>

// 톤 신호 — 아이콘 색만
<Hint icon="shield-check" tone="success">
  2단계 인증이 활성화되어 있습니다.
</Hint>

<Hint icon="warning" tone="warning">
  이 작업은 되돌릴 수 없습니다.
</Hint>
```

### 구현 노트 (벤더 코드에만 적용)
- 아이콘 수직 정렬은 **`display: inline-flex` + `vertical-align: text-bottom`** 조합으로 line box 안에 자동 정렬. flex `align-items` + `margin-top` 보정 조합은 **금지** (line-height 바뀔 때마다 어긋남).
- 둘째 줄 들여쓰기는 **hanging indent** 패턴: `padding-inline-start: icon + gap` + `text-indent: -(icon + gap)`.
- line-height는 `1.6` 고정 (muted 다줄 가독성).
- tone은 `--hint-accent` CSS 변수 하나만 스왑 — `--hint-fg`는 전 톤에서 `--fg-muted` 유지.
