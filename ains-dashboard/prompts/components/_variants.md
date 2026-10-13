# Variants

### 원칙
컴포넌트마다 variant 이름이 역사적으로 조금씩 다르다 (Button `primary` ≈ Badge `solid` ≈ Input `filled`). 이 문서는 **역할 축**과 **컴포넌트 축**을 교차해, 지금 자리에 들어가야 할 variant 이름이 뭔지 매번 확인하지 않고 결정할 수 있게 하는 매핑표다.

이 표는 **기존 이름을 바꾸지 않는다**. 각 컴포넌트의 variant 이름은 그대로 유지된다 (breaking change 금지). 대신 "같은 역할"이 컴포넌트마다 뭐라 불리는지 보여줘, AI 에이전트·사람이 일관되게 매핑하도록 돕는다.

### 역할 축
- **Primary** — 화면의 주 액션. 한 화면에 1개 원칙.
- **Secondary** — 보조 액션. 폼의 "취소", 모달의 "닫기".
- **Tertiary / Quiet** — 조용한 액션. 테이블 행 action, 아이콘 버튼 default.
- **Destructive** — 되돌릴 수 없는 액션. 삭제·해제.
- **Inverse** — 반전된 배경(어두운 섹션의 라이트 버튼) 위.

표면(surface) 축은 별도로 둔다 — Badge·Chip·Callout·Input 같이 액션이 아닌 "표시" 컴포넌트에만 쓴다:
- **Solid** — 꽉 찬 배경.
- **Soft** — 연한 배경 + 어두운 텍스트.
- **Outline** — 투명 배경 + 테두리.
- **Line** — 아래선 하나 (입력류).
- **Fill** — 꽉 찬 배경 (알림류).
- **Plain / Ghost** — 배경·테두리 둘 다 없음.

### 액션 컴포넌트 — 역할 × variant 매핑

| 컴포넌트 | Primary | Secondary | Tertiary | Destructive | Inverse |
|---|---|---|---|---|---|
| [Button](button.md) | `primary` | `outline` *(또는 `secondary`)* | `ghost` | `destructive` + `destructive-ghost` | `inverse` |
| [IconButton](icon-button.md) | — *(강조는 Button 쪽)* | `outline` | `ghost` | `destructive` | — |
| [SplitButton](split-button.md) | `primary` | `outline` | `ghost` | `destructive` | — |
| [IdentityButton](identity-button.md) | — | `muted` | `ghost` | — | — |

**선택 규칙 (액션)**
- 중요 액션=`primary`, 서브 액션=`outline`. 폼·모달·페이지 액션의 기본 쌍. **`secondary`는 레거시, 신규 코드에선 `outline`을 쓴다.** (관련: feedback 메모리 [Button variant defaults](../../memory/feedback_button_variant_defaults.md))
- 테이블 행·툴바 안 액션은 `ghost`.
- 삭제·해제는 `destructive`, 삭제가 두 번째 시선이면 `destructive-ghost`.
- IconButton엔 `primary`가 없다 — "꽉 찬 색의 아이콘 버튼"은 CTDS에서 금지. 강조가 필요하면 label 붙은 Button을 써라.

### 표시 컴포넌트 — 역할 × variant 매핑

| 컴포넌트 | Solid | Soft | Outline | Line | 기타 |
|---|---|---|---|---|---|
| [Badge](badge.md) | `solid` | `soft` | — | — | `inverse` |
| [Chip](chip.md) *(필터 선택값 전용)* | — | `soft` | `outline` | — | — |
| [Callout](callout.md) *(알림 블록)* | — | — | `outline` | — | `fill` |
| [MetricCard](metric-card.md) | — | `soft` | — | `line` | `bare` |

**선택 규칙 (표시)**
- 상태·카테고리 라벨=`Badge solid`(기본) 또는 `soft`(순한 톤). 선택된 필터 값=`Chip`.
- Chip은 "선택된 값(X로 제거 가능)" 전용. 카테고리·태그·메타 라벨은 **반드시 Badge** (관련: feedback 메모리 [Chip filter-only](../../memory/feedback_chip_filter_only.md)).
- 알림·안내 박스는 `Callout fill` *(색 테두리+색 배경 금지 — 메모리 [No outlined Callout](../../memory/feedback_no_outlined_callout.md))*.

### 입력 컴포넌트 — 매핑

| 컴포넌트 | Default | 폼 블록 | 밀도 승부처 |
|---|---|---|---|
| [Input](input.md) | `line` | `outline` | `filled` |
| [Textarea](textarea.md) | `line` | `outline` | `filled` |
| [Select](select.md) | `line` | `outline` | `filled` |
| [TimePicker](time-picker.md) | `line` | `outline` | `filled` |

**선택 규칙 (입력)**
- `line`을 먼저 고려. 독립 폼 블록이면 `outline`, 테이블 셀처럼 밀도가 극한이면 `filled` (관련: feedback 메모리 [Input line default](../../memory/feedback_input_line_default.md)).

### 레이아웃·구조 컴포넌트
"역할" 매핑과 맞지 않는 축을 쓰는 것들. 이름 그대로 사용:
- [AppFrame](app-frame.md): `outlined` · `floating` · `flat` — 외곽 쉘 톤
- [Toolbar](toolbar.md): `floating` · `attached` — 위치
- [Tabs](tabs.md): `underline` · `segmented` · `text` — 시각 패턴
- [TableHeader](table-header.md): `line` · `plate` — 헤더 톤
- [Pagination](pagination.md): `numbered` · `compact` · `jump` — 밀도
- [MessageQuote](message-quote.md): `plain` · `blockquote` — 인용 톤
- [ListItem](list-item.md): `activity` · `notification` · `mention` · `system` — 내용 종류
- [Spinner](spinner.md): `ring` · `dots-bounce` · `dots-fade` · `pulse` · `lottie-*` — 애니메이션 종류

### Don't
- 신규 컴포넌트에 "역할 축"의 네이밍을 쓸 수 있으면 **primary/outline/ghost/destructive**를 그대로 재사용한다. "solid"는 표면 축, "primary"는 역할 축이라는 구분을 유지.
- 기존 컴포넌트의 variant 이름을 바꾸지 않는다 — 소비자 breaking.
- 매핑표에 없는 역할을 임의로 추가하지 않는다. 신규 역할이 필요하면 이 문서를 먼저 업데이트.

### 신규 컴포넌트 체크리스트
1. 액션? → 역할 축 네이밍(`primary`/`outline`/`ghost`/`destructive`)
2. 표시? → 표면 축 네이밍(`solid`/`soft`/`outline`/`line`/`fill`)
3. 입력? → `line` 기본 + `outline`/`filled` 선택
4. 레이아웃? → 자유. 다만 "variant"가 아니라 더 의미 있는 prop 이름(예: `position`, `tone`)을 먼저 검토
