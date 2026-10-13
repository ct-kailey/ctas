# Chip

### 원칙
**검색 필터·다중 선택의 "선택된 값" 요약 전용**. 사용자가 X로 제거할 수 있는 값 라벨만 Chip이다. 이메일 To 필드, 다중 태그 입력, 필터 결과 요약 — 전부 "선택을 되돌릴 수 있는 값" 자리. 그 외 모든 라벨(카테고리·상태·메타데이터)은 [[components/badge]]. 판정 기준은 **`onRemove` 유무**: 없으면 Badge다.

### Do
- **검색 필터·다중 선택의 "선택된 값" 요약에만** 사용. `onRemove` + `removeLabel` 세트가 반드시 있어야 한다.
- 이메일 To, 멘션, 태그 입력 등 "값을 추가·제거하는 자리"에만.
- `leftIcon`은 값의 성격 힌트(국기·avatar 미니·색 스와치). 라벨 중복 금지.
- `size="sm"`은 밀도 높은 리스트(검색 필터 요약), `size="md"`는 폼 안 값(이메일 To).

### Don't
- **카테고리·태그·메타데이터 라벨에 쓰지 않는다** — 그건 [[components/badge]] (`variant="soft"`). "아티클", "가이드", "new", "beta", "draft" 전부 Badge. 공주 영구 금지 룰.
- 카드/리스트 메타 라인에 쓰지 않는다 — meta 자리는 Badge 또는 inline muted 텍스트.
- `onRemove`가 없는 Chip은 만들지 않는다. 제거 불가능하면 그 자체로 Chip이 아니다.
- 상태 표시에 쓰지 않는다 — [[components/badge]] `variant="soft" status="..."`.
- 클릭 가능한 액션 버튼으로 쓰지 않는다 — [[components/button]] 또는 [[components/filter-button]].
- removeLabel을 생략하지 않는다 — 접근성 필수.
- `disabled` 상태에서 onRemove가 호출되지 않게 — 컴포넌트가 자동 처리하지만 상위에서 비즈니스 로직을 거르지 말 것.

### Fallback
size 애매하면 `md`, variant 애매하면 `soft`.

### 관련
- [[components/badge]] — 상태 표시(제거 불가). Chip과 짝 개념
- [[components/filter-button]] — 필터 선택 트리거. 선택 결과는 Chip으로 요약
- [[components/input]] — 이메일 To 등 입력 안 Chip 리스트
- [[components/icon]] — leftIcon·remove 아이콘
- [[axes/shape]] — radius가 Shape 축에 반응

### Props 시그니처
```tsx
<Chip
  size="sm | md"                             // default: md
  variant="soft | outline"                   // default: soft
  leftIcon={ReactNode}
  onRemove={(e) => void}                     // 있으면 X 버튼 노출
  removeLabel="제거"                         // onRemove와 세트, aria-label
  disabled={boolean}
>
  라벨 텍스트
</Chip>
```

### Variant 매트릭스
| variant | 시각 | 쓰임 |
|---|---|---|
| `soft` | primary 8% 배경 + primary 텍스트 | **기본** — 선택된 값 강조 |
| `outline` | 투명 배경 + border | 보수적 톤, 다중 Chip이 나열될 때 |

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | variant 기본 |
| hover (remove 버튼) | X 배경 `--hover` |
| disabled | opacity 0.5, cursor not-allowed, X 비활성 |

### 조합 예시
```tsx
// 이메일 To 필드 — 입력 가능한 Chip 리스트
<div className="to-field">
  {recipients.map((r) => (
    <Chip key={r.id} leftIcon={<Avatar size="xs" name={r.name} />} onRemove={() => remove(r.id)}>
      {r.email}
    </Chip>
  ))}
  <input type="email" placeholder="주소 추가" />
</div>

// 필터 요약 — sm, outline
<div className="filters">
  {activeFilters.map((f) => (
    <Chip
      key={f.id}
      size="sm"
      variant="outline"
      leftIcon={f.swatch}
      onRemove={() => clearFilter(f.id)}
    >
      {f.label}
    </Chip>
  ))}
</div>
```
