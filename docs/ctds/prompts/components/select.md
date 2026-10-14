# Select

### 원칙
단일 값 선택 콤보. Radix Select 위의 compound 어댑터. **Trigger 시각은 [[components/input]]과 100% 동일** (variant/size/invalid/label/description/warning 전부 공유), **Content/Item 시각은 [[components/context-menu]]와 동일** (팝오버 표면 + MenuItem 어댑터). 즉 이 컴포넌트는 두 계층을 잇는 **얇은 어댑터** — 자체 시각 규칙 금지.

**구조는 Radix 호환 compound**: `Select.Trigger` + `Select.Content` + `Select.Item`이 **모두 필수**. 셋 중 하나라도 빠지면 Radix가 런타임에 throw. Item만 넣는 간이 형태는 지원하지 않는다.

### Do
- Input 옆에 나란히 놓을 땐 size·variant를 **반드시 통일**.
- `width`는 Input의 InputWidth 규약 그대로: `"fill" | "md" | "lg" | number`.
- `label`·`description`·`warning`은 Root에 — 트리거 아래 자동 렌더.
- Group + Label로 논리 묶음. 긴 리스트는 Separator로 끊음.
- Item에 `leadingActions`로 아이콘·국기·색 스와치 삽입.

### Don't
- Trigger에 custom CSS로 Input 시각을 벗어나지 않는다 — 두 컴포넌트가 다르게 보이면 폼 전체 시각이 깨짐.
- Trigger/Content를 생략하지 않는다 — Radix 요구사항이라 structural throw.
- 5개 이하 옵션엔 Select 금지 — [[components/tabs]] variant=`segmented`가 자연스러움.
- 다중 선택에 쓰지 않는다. 그건 [[components/filter-button]] 또는 Combobox(미구현).
- Content에 자체 애니메이션 재정의 금지 — `.m-float` 유틸이 Radix in/out 담당.

### Fallback
size 애매하면 `md`, variant 애매하면 `outline`, width 애매하면 `"fill"`.

### 관련
- [[components/input]] — Trigger 시각·width·label 규약 공유
- [[components/menu-item]] — Content 안쪽 Item 어댑터
- [[components/context-menu]] · [[components/dropdown-menu]] — 팝오버 표면 공유
- [[components/form-field]] — label/description/warning 자리
- [[axes/density]] — control-h가 Trigger에, menu-item-h가 Item에
- [[axes/shape]] — radius가 Shape 축에 반응

### Props 시그니처
```tsx
<Select
  size="sm | md | lg"                            // default: md
  variant="outline | filled | line"              // default: outline
  width="fill | md | lg | number"                // default: "fill"
  value={string} defaultValue={string}
  onValueChange={(v: string) => void}
  disabled={boolean}
  invalid={boolean}
  label={ReactNode}
  description={ReactNode}
  warning={ReactNode}                            // 있으면 invalid=true 자동
  id={string}                                    // label htmlFor 자동 연결
>
  <Select.Trigger placeholder="선택하세요" leftIcon={ReactNode} />
  <Select.Content>
    <Select.Item value="kr" leadingActions={[<Icon name="flag" />]}>한국</Select.Item>
    <Select.Separator />
    <Select.Group>
      <Select.Label>유럽</Select.Label>
      <Select.Item value="de">독일</Select.Item>
      <Select.Item value="fr">프랑스</Select.Item>
    </Select.Group>
  </Select.Content>
</Select>
```

> `placeholder`는 **Trigger**에 둔다 (Root 아님). Root에 두면 반영되지 않는다.

### Size × Item 매핑
| Trigger size | Item size | 쓰임 |
|---|---|---|
| `sm` | `sm` | 밀도 높은 폼·툴바 |
| `md` | `sm` | **기본** — 트리거는 보통, 메뉴는 조밀 |
| `lg` | `md` | 랜딩·온보딩의 큰 입력 |

> 트리거가 lg여도 메뉴는 과하게 커지지 않도록 한 단계 작게 매핑. 실전에서 자연스러움.

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | Input default |
| hover | Input hover (border-strong) |
| focus-visible | Input focus (ring) |
| open | Content 열림 — `.m-float` emerge |
| disabled | opacity 0.5, cursor not-allowed |
| invalid / warning | border destructive, warning 텍스트 노출 |

### 조합 예시
```tsx
// 폼 안 Select — label + description, Input 옆에 나란히
<Select
  size="md"
  label="국가"
  description="청구 주소 기준"
  value={country}
  onValueChange={setCountry}
>
  <Select.Trigger placeholder="선택하세요" />
  <Select.Content>
    <Select.Item value="kr" leadingActions={[<span>🇰🇷</span>]}>한국</Select.Item>
    <Select.Item value="us" leadingActions={[<span>🇺🇸</span>]}>미국</Select.Item>
    <Select.Item value="jp" leadingActions={[<span>🇯🇵</span>]}>일본</Select.Item>
  </Select.Content>
</Select>

// 그룹 + 분리선
<Select label="담당자">
  <Select.Trigger placeholder="선택하세요" />
  <Select.Content>
    <Select.Group>
      <Select.Label>디자인</Select.Label>
      <Select.Item value="hy">희영</Select.Item>
      <Select.Item value="ds">도수</Select.Item>
    </Select.Group>
    <Select.Separator />
    <Select.Group>
      <Select.Label>엔지니어링</Select.Label>
      <Select.Item value="jw">지원</Select.Item>
    </Select.Group>
  </Select.Content>
</Select>
```
