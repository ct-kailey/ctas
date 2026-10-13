# Input

### 원칙

폼 입력의 최소 단위. 사용자가 한 줄의 텍스트/숫자/비밀번호 등을 입력하는 컨트롤. 라벨·설명·에러는 이 컴포넌트가 아니라 [[components/form-field]]가 담당한다 — Input은 **입력 자체**에만 책임을 진다.

### Do
- **variant는 `line`을 먼저 쓴다.** 모달·폼·대시보드 어디든 기본값. 밑줄 하나로 입력 표식이 끝나 시각 무게가 가장 가볍고 주변 레이아웃을 흐트러뜨리지 않음. `outline`은 폼이 독립 블록(가입/로그인 전용 페이지 등)으로 자리할 때, `filled`는 관리자·엑셀 대체 UI 등 밀도가 승부처일 때만.
- **사이드바 안쪽은 `line` 금지, `outline` 또는 `filled`만.** 사이드바 안은 ghost MenuItem 리듬이라 line의 밑줄 하나가 흐름에 녹아 "검색창이 비어 보임"으로 읽힌다 ([[components/sidebar]]).
- 라벨이 필요한 실제 폼에서는 항상 `FormField`로 감싼다. Input을 라벨 없이 단독으로 두는 것은 검색창 · Popover 트리거 · 인라인 필터에 한한다.
- 통화 · 단위 · 도메인처럼 사용자가 편집하지 않는 고정 문자열은 `prefix` / `suffix`로 넣는다. placeholder에 넣지 않는다.
- 아이콘은 시맨틱 힌트(`leftIcon`=검색 돋보기, 메일 봉투 등). 인터랙션이 있으면 `rightAction` 슬롯으로 실제 버튼을 넣는다.
- 값을 지울 수 있어야 하면 `clearable`. 비밀번호는 `passwordToggle` 을 켠다.
- 검증 실패 시 `invalid` 활성 + `FormField.Error`로 사유를 알린다. `invalid`만 켜고 에러 문구를 안 주면 사용자가 이유를 모른다.
- 다른 컴포넌트(DatePicker · Combobox · Select)가 트리거로 Input을 재사용할 때는 `readOnly` + `role="combobox"` 조합. 새 스타일을 만들지 않는다.

### Don't
- `leftIcon`에 클릭 액션을 붙이지 않는다. 아이콘은 항상 `aria-hidden`. 액션이 필요하면 `rightAction`.
- placeholder를 라벨 대신 쓰지 않는다 — 값이 들어가면 힌트가 사라진다. 접근성 실패.
- `variant="filled"`와 `invalid`를 조합해서 배경까지 destructive 계열로 물들이지 않는다. 보더/링만 destructive.
- 사이즈 조정용으로 CSS로 height를 덮어쓰지 않는다. `size` prop 경유.

### Fallback
variant가 애매하면 **`line`**(기본 권장). 독립 폼 블록이면 `outline`, 밀도 승부면 `filled`. **사이드바 안쪽에선 `outline`**. size가 애매하면 `md`. 폼 전체가 일관된 밀도를 갖도록 한 화면에서 size·variant를 섞지 않는다.

### 관련
- [[components/form-field]] — 라벨 · 설명 · 에러 · required 별표를 담당. Input의 접근성 짝.
- [[components/date-picker]] — Input을 readOnly 트리거로 재사용.
- [[axes/density]] — `--control-h-sm/md/lg`가 size에 매핑.
- [[axes/shape]] — 컨테이너 radius가 Shape 축에 반응.
- [[tokens/color]] — `--primary`(focus), `--destructive`(invalid), `--bg-subtle`(filled/readOnly).

### Props 시그니처

```tsx
<Input
  size="sm | md | lg"                 // default: md
  variant="line | outline | filled"   // default: outline (문서 권장 기본: line)

  value={string} defaultValue={string}
  onChange={(e) => void}
  type="text | email | password | number | ..."
  placeholder={string}

  invalid={boolean}
  disabled={boolean}
  readOnly={boolean}
  fullWidth={boolean}

  leftIcon={ReactNode} rightIcon={ReactNode}     // 시각용
  prefix={ReactNode}   suffix={ReactNode}        // 짧은 텍스트

  clearable={boolean}       onClear={() => void}
  passwordToggle={boolean}                        // type="password"에만 유효
  rightAction={ReactNode}                         // 커스텀 우측 액션(버튼 등)
/>
```

### Variant 매트릭스

| variant | 용도 | 금지 조합 |
|---|---|---|
| `line` | **권장 기본값.** 모달·폼·대시보드 어디든. 밑줄만으로 입력 자리를 알리고 주변 레이아웃을 흐트러뜨리지 않음 | — |
| `outline` | 독립 폼 블록(가입/로그인 전용 페이지 등) | — |
| `filled` | 밀도 높은 관리자·대시보드. 시각 무게가 가벼움 | `invalid`와 결합 시 배경까지 물들이지 말 것 |

**상태 조합:**

| 상태 | 시각 반응 | 접근성 |
|---|---|---|
| `disabled` | 반투명 + cursor:not-allowed | 포커스 불가 |
| `readOnly` | 배경만 살짝 눌림(bg-subtle) | 포커스 가능, 편집 불가 |
| `invalid` | destructive 보더/링 | `aria-invalid="true"` |

### 조합 예시

```tsx
// 로그인 폼: 라벨/에러 자동 연결
<FormField required invalid={!!error}>
  <FormField.Label>이메일</FormField.Label>
  <Input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    leftIcon={<MailIcon />}
    invalid={!!error}
  />
  <FormField.Error>{error}</FormField.Error>
</FormField>

// 검색: 라벨 없이 단독
<Input placeholder="검색" leftIcon={<SearchIcon />} clearable value={q} onChange={..} />

// 금액: prefix/suffix
<Input prefix="$" suffix="USD" type="number" placeholder="0.00" />
```
