# Icon

### 원칙
의미 기반 아이콘 렌더러. `name`으로 **의미 슬롯**을 지정하고, 실제 SVG는 [[axes/icon]]의 Family(phosphor/solar/lucide)가 결정. **한 페이지 = 한 Family** 원칙. family는 `<html data-icon-family>` 축에서 자동 상속. Weight(regular/fill)는 축이 아니라 prop — phosphor·solar만 실제 반응, lucide는 regular 고정.

### Do
- 항상 `name`으로 의미 지정: `<Icon name="check" />`.
- 라벨 없는 아이콘 쓰임엔 반드시 `aria-label` 또는 Tooltip (sender 쪽에서).
- `size`는 number(px). 컴포넌트 안에서 자동 상속되므로 대부분 지정 안 함.
- 활성/선택 상태 표시엔 `weight="fill"` (phosphor/solar만).
- 축 override가 필요한 특수 자리(브랜드 로고 아이콘 등)에만 `family` prop.

### Don't
- 인라인 `<svg>` 로 아이콘 그리지 않는다 — 반드시 Icon 컴포넌트. 브랜드 로고·Tooltip tail은 예외.
- `name`에 Icon.tsx 유니온 밖 문자열 금지 — 유령 아이콘은 **family별 placeholder 사각형**으로 렌더됨 (설계된 폴백).
- 한 페이지에서 여러 family 섞지 않는다. 축 override를 과용하면 CTDS 지문이 깨짐.
- Lucide에서 `weight="fill"` 요구 금지 — 원본이 fill 미제공, regular로 폴백.
- 아이콘 크기를 CSS로 override 금지. `size` prop 또는 컨테이너의 `--icon-size-*` 토큰 경유.

### Fallback
family는 축 상속(기본 `phosphor`), weight는 축 상속(기본 `regular`), size 애매하면 `20`.

### 관련
- [[axes/icon]] — Family 축 (data-icon-family). Weight는 축 아님.
- [[components/icon-button]] · [[components/button]] — 아이콘 담는 가장 흔한 자리
- [[components/menu-item]] · [[components/badge]] · [[components/chip]] — leadingActions/leftIcon 자리
- [[tokens/color]] — `--icon-color`가 Palette 축에 반응

### Props 시그니처
```tsx
<Icon
  name={IconName}                              // Icon.tsx 유니온 (phosphor + solar + lucide 합집합)
  family="phosphor | solar | lucide"           // default: 축 상속
  weight="regular | fill"                      // default: 축 상속 (phosphor/solar만 반응)
  size={number | string}                       // default: 20
  // 그 외 SVG attributes 전부 통과
/>
```

### Family별 지원
| Family | Weight 반응 | 스타일 특징 | 쓰임 |
|---|---|---|---|
| `phosphor` | regular / fill | 다재다능, 모던, 선·면 균형 | **기본** |
| `solar` | Linear(regular) / Bold(fill) | 두꺼운 선·단단한 느낌 | 모바일·터치 |
| `lucide` | regular만 (fill 요청 시 regular) | 얇은 Feather 계승, 미니멀 | 미니멀·docs |

### 유령 이름 처리
- `name="존재하지-않는-슬롯"` → **family별 placeholder 사각형**이 자동 렌더. 레이아웃 공간 유지.
- 축 전환 시 "이 아이콘은 이 family에 없다"가 시각적으로 드러나는 설계된 폴백.

### 조합 예시
```tsx
// 기본 — 축 상속
<Icon name="check" />
<Icon name="warning" size={16} />

// 활성 상태 fill
<Icon name="heart" weight={isLiked ? "fill" : "regular"} />

// Family override — 로고 자리처럼 특수한 지점만
<Icon name="github-logo" family="phosphor" size={24} />

// Button 안 — 자동 크기 상속 (ICON_SIZE 매핑)
<Button leftIcon={<Icon name="plus" />}>추가</Button>

// MenuItem leadingActions
<MenuItem leadingActions={[<Icon name="user" />]}>프로필</MenuItem>
```
