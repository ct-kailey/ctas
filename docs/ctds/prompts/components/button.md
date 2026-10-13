# Button

### 원칙
텍스트 액션의 최소 단위. 클릭 시 무언가 **일어나는** 컨트롤 — 페이지 이동은 [[components/link]]. size는 [[axes/density]] 축과 연동되고, variant는 semantic 역할(강조 위계)만 담당한다.

### Do
- **중요=`primary`, 서브=`outline`**이 기본 쌍이다. 모달 하단, 폼 하단, 페이지 액션 영역 등 "확정 + 취소/이전" 구조의 기본값. `secondary`는 primary tint가 섞인 색조 액션이 필요한 특별 맥락에서만 — 중립 서브 액션엔 `outline`이 먼저다.
- **버튼 사이 gap은 언제나 `space-1`(4px) 고정.** footer action 쌍, 툴바 액션 묶음, 폼 하단 등 어느 자리든 동일. `space-2` 이상 금지 — 두 버튼이 하나의 액션 묶음으로 묶여 읽히는 밀도를 유지.
- **기본은 `size="md"`**. 90% 이상의 경우 md. 다른 사이즈로 갈 명확한 이유가 있을 때만 바꾼다.
- **폼·컨트롤과 나란히 놓일 때는 그 컨트롤의 size와 맞춘다** — Input md 옆엔 Button md, Input sm 옆엔 Button sm. 미묘한 높이 차이가 정렬을 무너뜨린다.
- 한 화면에 `variant="primary"`는 **1개**. 페이지의 대표 액션만.
- **아이콘만 있는 버튼도 Button으로 처리** — label 없이 `leftIcon`만 넣으면 자동으로 정사각(width = height = `--control-h-*`), `leftIcon` + `rightIcon`(예: 아이콘 + `caret-down`)이면 텍스트 없이 좁은 대칭 패딩. 어느 쪽이든 `aria-label` 필수. 별도 [[components/icon-button]] 컴포넌트는 legacy — 신규 사용은 지양.
- **파괴적 액션은 위계로 2단 분리한다.**
  - `destructive` — **강한 위계.** 확인 모달의 "정말 삭제하시겠습니까?" 최종 확인, 되돌릴 수 없는 결정적 순간. 평상시 옅은 빨강 배경 + 빨강 텍스트, hover 시 solid 빨강으로 전환되며 위험을 예고.
  - `destructive-ghost` — **약한 위계.** 테이블 행/헤더의 삭제, 페이지에 그냥 노출된 삭제 버튼 등 일상적 목록 조작. 평상시 fg(검정) 텍스트로 눈에 띄지 않다가 hover 시에만 빨강 톤(8% 배경 + 빨강 텍스트)이 나타남.

### Don't
- 한 화면에 primary 2개 이상 금지. 시각 위계 붕괴.
- 버튼 사이 gap에 `space-2`(8px) 이상 금지 — 반드시 `space-1`(4px).
- height를 CSS로 덮어쓰지 않는다. `size` prop 경유.
- 페이지 이동에 Button 쓰지 않는다 — 시맨틱은 `<a>`.
- disabled 색을 variant별로 다르게 덮어쓰지 않는다. **모든 variant는 disabled 시 회색 배경(`--bg-muted`) + 실버 텍스트(`--fg-disabled`) + 투명 보더로 통일** — "지금은 못 누른다"가 variant 위계보다 우선 읽혀야 한다.

### Fallback
size 애매하면 `md`, variant 애매하면 서브 자리에선 `outline`·대표 자리에선 `primary`.

### 관련
- [[components/split-button]] — 메인 액션 + 부가 옵션(caret) 2-part 버튼
- [[components/icon-button]] — legacy, 신규는 Button icon-only 사용
- [[components/input]] · [[components/select]] — 같은 화면에서 size 맞춤
- [[axes/density]] — `--control-h-*`가 size에 매핑
- [[axes/shape]] — radius가 Shape 축에 반응
- [[tokens/color]] — `--primary`, `--destructive` 등 variant 매핑

### Props 시그니처
```tsx
<Button
  size="xs | sm | md | lg"                       // default: md
  variant="primary | inverse | secondary | outline | ghost | destructive | destructive-ghost"  // default: primary
  leftIcon={ReactNode} rightIcon={ReactNode}
  loading={boolean} disabled={boolean}
  fullWidth={boolean}
  asChild={boolean}                              // Radix Slot 패턴
/>
```

### Variant 매트릭스
| variant | 용도 | 금지 조합 |
|---|---|---|
| `primary` | **중요 액션의 기본값.** 페이지 대표 액션(가입·제출·확인·다음) | 한 화면 2개 이상 금지 |
| `inverse` | 흑백 반전. Palette=mono에서 primary 대신 강조 | Hue와 무관 |
| `outline` | **서브 액션의 기본값.** 취소·이전 등 primary와 짝 이루는 중립 액션. 툴바·필터에도 사용 | — |
| `secondary` | primary tint가 섞인 색조 액션이 필요할 때만. 중립 서브엔 `outline`이 먼저 | — |
| `ghost` | 최소 시각 무게. 인라인·툴바. | — |
| `destructive` | **강한** 위험 위계 — 확인 모달의 최종 삭제 버튼, 되돌릴 수 없는 결정 | 목록·툴바의 일상 삭제엔 과함 → `destructive-ghost` 사용 |
| `destructive-ghost` | **약한** 위험 위계 — 테이블/페이지에 노출된 일상적 삭제 | 최종 확인 자리엔 부족 → `destructive` 사용 |

### Size 가이드
| size | height | 언제 |
|---|---|---|
| `xs` | 24 | **거의 쓸 일 없음.** 극한 밀도가 정말 필요한 예외적 상황(인라인 태그 액션, 셀 내부 미니 컨트롤)에서만. 쓴다면 **`variant="ghost"` 강력 권장** — filled/outline은 이 크기에서 시각 무게가 과해 튀고 답답함. |
| `sm` | 32 | 밀도 높은 관리 UI, 툴바, 테이블 행 액션 |
| `md` | 36 | **기본.** 폼·모달·페이지 액션 대부분 |
| `lg` | 40 | 랜딩·온보딩의 대표 CTA. 손가락 hitbox 필요한 터치 |

> **`xs` 사용 전 재고**: 밀도가 부족하다고 느껴진다면 먼저 Density 축(`--space-scale`)을 조이는 게 옳다. 페이지에 `xs`가 튀어나온다면 대부분 `sm` + Density 축 조정으로 해결된다.

### 조합 예시
```tsx
// 폼 하단: outline(서브) + primary(중요) 나란히, Input과 같은 size
<div style={{ display: "flex", gap: "var(--space-1)" }}>
  <Button variant="outline">취소</Button>
  <Button variant="primary" leftIcon={<CheckIcon />}>저장</Button>
</div>

// 테이블 행 액션: sm ghost로 밀도 확보
<Button size="sm" variant="ghost" leftIcon={<PencilIcon />}>수정</Button>

// 테이블/페이지의 일상적 삭제: destructive-ghost (약한 위계, hover에만 빨강)
<Button size="sm" variant="destructive-ghost" leftIcon={<TrashIcon />}>삭제</Button>

// 확인 모달의 최종 삭제 버튼: destructive (강한 위계)
<Modal>
  <p>정말 삭제하시겠습니까?</p>
  <Button variant="outline" onClick={close}>취소</Button>
  <Button variant="destructive" onClick={confirmDelete}>삭제</Button>
</Modal>

// 아이콘만: 정사각 (aria-label 필수)
<Button variant="ghost" aria-label="검색" leftIcon={<Icon name="search" />} />

// 아이콘 + caret: 드롭다운 트리거 (텍스트 없이 좁은 대칭 패딩)
<Button
  variant="outline"
  aria-label="사용자 메뉴"
  leftIcon={<Icon name="user" />}
  rightIcon={<Icon name="caret-down" />}
/>
```
