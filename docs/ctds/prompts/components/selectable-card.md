# SelectableCard

### 원칙
카드 전체가 선택 타겟인 컨트롤. title·description으로 옵션을 서술해야 할 때 [[components/radio]]·[[components/checkbox]]의 라벨만으로 부족한 경우 사용. native `<input type="radio|checkbox">`를 label 안에 숨겨 시맨틱과 폼 전송을 그대로 받는다.

### Do
- **옵션 서술이 필요할 때만**: title 한 줄로 충분하면 Radio·Checkbox. description이 있어야 뜻이 분명해질 때 SelectableCard.
- **같은 그룹은 같은 `name`**: 시맨틱 그룹은 `role="radiogroup"` 래퍼 권장 (mode="radio"·"icon").
- **mode 선택**: 단일 선택은 `radio` 또는 `icon`, 다중 선택은 `checkbox`. `icon`은 아이콘이 옵션 성격을 즉시 알려줄 때만.
- **카드 간 간격 `space-3`**: 카드끼리 붙지 않도록 vertical stack의 gap은 최소 `space-3`.
- **상단 잘림 방지**: 카드는 hover 시 `translateY(-1px)`로 살짝 뜬다. 부모 컨테이너가 `overflow: hidden`이거나 카드가 컨테이너 top에 정확히 붙어있으면 뜨는 순간 상단이 잘린다. 컴포넌트가 `margin-top: var(--hairline)`로 1차 방어하지만, 리스트 컨테이너에도 `padding-top` 최소 `space-1` 확보 또는 `overflow: visible` 유지 권장.

### Don't
- 인디케이터를 카드 밖에 두지 않는다 — leading 슬롯 고정.
- title/description 밖의 커스텀 콘텐츠(폼 필드, 버튼)를 카드 안에 넣지 않는다. 그건 [[components/callout]] 또는 별도 카드.
- 옵션이 6개를 넘기면 Select/Combobox 검토. SelectableCard는 "한 화면에 나열되는 소수 옵션"용.
- `mode="icon"`에 `icon` 미지정 금지 — 좌측 슬롯이 비어 정렬이 무너진다.

### Fallback
`mode` 미지정 시 `radio`. `icon` 미지정이면 mode="radio" 강제 fallback.

### 관련
- [[components/radio]] — 텍스트 한 줄 옵션. SelectableCard의 native input 시맨틱 형제.
- [[components/checkbox]] — 다중 선택 인디케이터 원본.
- [[components/callout]] — 안내 카드. 선택 대상이 아님.
- [[tokens/color]] — checked 상태의 `--fg`, `--primary` 토큰.

### Props 시그니처
```tsx
<SelectableCard
  mode="radio | checkbox | icon"                        // default: radio
  title={ReactNode}                                     // required
  description={ReactNode}
  icon={IconName}                                       // mode="icon" 필수
  name / value / checked / defaultChecked / onChange / disabled ...
/>
```

### Variant 매트릭스
| mode | leading 슬롯 | 선택 정책 | 용도 |
|---|---|---|---|
| `radio` | 라디오 도트 | 그룹 내 단일 | 옵션 뜻을 title+description으로 설명해야 하는 단일 선택 |
| `checkbox` | 체크 박스 | 다중 | 여러 항목 동시 선택 (기능 토글, 필터 세트) |
| `icon` | Icon 컴포넌트 | 그룹 내 단일 | 아이콘이 옵션 성격을 즉시 전달하는 단일 선택 |

**금지 조합**
- `mode="checkbox"` + 상호배타 그룹 로직 → 의미 충돌. radio를 쓴다.
- `mode="icon"` + `icon` 미지정 → leading 슬롯 공백.

### 조합 예시
```tsx
<div role="radiogroup" style={{ display: "grid", gap: "var(--space-3)" }}>
  <SelectableCard
    name="agent-mode"
    value="leaf"
    title="Leaf"
    description="Works alone in one turn."
    defaultChecked
  />
  <SelectableCard
    name="agent-mode"
    value="supervisor"
    title="Supervisor"
    description="Splits the task across sub-workers it spawns."
  />
</div>
```
