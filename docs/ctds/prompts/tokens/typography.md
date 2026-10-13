# Typography

### 원칙
텍스트 크기·라인하이트 스케일. 크기 위계는 항상 유지 (xs < sm < base < ...).
스케일 전체는 [[axes/density]]의 `--font-scale`로 연쇄 스왑되지만 위계·라인하이트 비율은 불변.

### Do
- 본문은 `text-base`. 애매하면 이것부터.
- Table·리스트 밀도가 중요한 곳은 `text-sm`.
- 헤딩은 `text-xl` 이상, 페이지 타이틀은 `text-4xl` (h1) 관례.
- line-height는 스케일에 이미 포함. 별도 조정하지 않는다.
- **라벨/UI 텍스트(버튼, 메뉴, 사이드바 Item, Chip, Badge)는 `--label-{sm,md,lg}-size`**. 본문 스케일(`--text-*`)과 라벨 스케일은 분리돼 있고 라벨 쪽이 UI 전용으로 보정됨.

### Don't
- font-size에 임의 px 하드코딩 금지.
- `line-height`를 spacing 토큰으로 조정하지 않는다 (별개 시스템).
- 한 화면에서 3단계 이상 크기 건너뛰지 않는다 (위계 어색).
- **20px(=`text-xl`) 미만에 `semibold`/`bold` 사용 금지**. 20px 이상이어도 **컴포넌트 내부 자체 타이틀/display에만** 허용 — 페이지의 섹션 타이틀, 범용 h2/h3처럼 "컴포넌트에 포함되지 않은" 자리에는 사용 금지. 그 외(본문·라벨·버튼·사이드바·메뉴·테이블·배지, 페이지 섹션 헤딩 전부)는 **`medium` 또는 `regular`만** 쓴다. 작은 글자에서 두꺼운 획은 가독성·시각 균형을 깨뜨린다. 강조가 필요하면 색(`fg-strong`) 또는 medium으로 해결.
- **유령 토큰 금지**. 아래 "CSS 변수 whitelist" 밖의 이름(예: `--font-size-sm`, `--text-size-sm`, `--fs-sm`)은 **존재하지 않는 토큰**이고 참조 시 브라우저 base(≈16px)로 상속돼 사이즈감이 깨진다. 반드시 whitelist의 정확한 이름만 사용.

### Fallback
본문 `text-base`, 라벨 `text-sm`, 헤딩 `text-2xl`.

### 관련
- [[axes/font]] — 폰트 스택·포인트 폰트 범위 결정
- [[axes/density]] — `--font-scale`로 사이즈 스케일 전체를 스왑 (compact 0.95× / default 1× / comfortable 1.05×)

### CSS 변수 whitelist (이 이름만 유효 — 다른 접두어는 전부 유령 토큰)

| 용도 | CSS 변수 | 참고 |
|---|---|---|
| 본문/캡션 크기 | `--text-{3xs,2xs,xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}` | line-height는 `--lh-{...}` 짝으로 매칭 |
| 라벨/UI 크기 | `--label-{sm,md,lg}-size` | 라벨 폰트는 `--label-font` |
| 라인하이트 | `--lh-{3xs,2xs,xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}` | font-size 토큰과 짝 |
| Weight | `--font-weight-{regular,medium,semibold,bold}` | |
| Font family | `--font-normal`, `--label-font` | |

금지 예: `--font-size-sm`, `--font-size-xs`, `--text-size-sm`, `--fs-sm`, `--size-text-sm`. 이 중 어느 것도 globals.css에 정의돼 있지 **않다**.

### 토큰 표

**Font Size / Line-height**
| Token | CSS 변수 | 용도 |
|---|---|---|
| `text-3xs` | `--text-3xs` / `--lh-3xs` | Micro meta (사용 자제) |
| `text-2xs` | `--text-2xs` / `--lh-2xs` | Dense table meta, tag |
| `text-xs` | `--text-xs` / `--lh-xs` | Caption, Helper, Badge |
| `text-sm` | `--text-sm` / `--lh-sm` | Body Small, Table, Label |
| `text-base` | `--text-base` / `--lh-base` | Body (기본) |
| `text-lg` | `--text-lg` / `--lh-lg` | Lead 문단, 강조 본문 |
| `text-xl` | `--text-xl` / `--lh-xl` | H4 |
| `text-2xl` | `--text-2xl` / `--lh-2xl` | H3 |
| `text-3xl` | `--text-3xl` / `--lh-3xl` | H2 |
| `text-4xl` | `--text-4xl` / `--lh-4xl` | H1, Page Title |
| `text-5xl` | `--text-5xl` / `--lh-5xl` | Display (Hero) |

**Font Weight**
| Token | 용도 | 허용 자리 |
|---|---|---|
| `regular` | 본문·대부분의 UI 텍스트 | 모든 자리 |
| `medium` | 라벨, 강조 본문, 서브 헤딩, 작은 UI 강조 | 모든 자리 |
| `semibold` | **20px(`text-xl`) 이상 + 컴포넌트 내부 자체 타이틀/display** | 아래 조건 모두 |
| `bold` | **컴포넌트 내부 디스플레이·히어로만** (극히 제한적) | 아래 조건 모두 |

**규칙 (semibold/bold 사용 조건):**
1. `font-size ≥ var(--text-xl)` (20px) — 미만이면 무조건 금지
2. **컴포넌트에 포함된 자리**여야 함 — Hero·MetricCard value·Dialog 내부 타이틀 등. 범용 섹션 h2/h3, 페이지 내부 heading처럼 "컴포넌트가 아닌 자리"에선 사이즈와 무관하게 금지.

본문·라벨·버튼·메뉴·사이드바·테이블·배지·페이지 섹션 헤딩은 전부 `medium`/`regular`만. 강조는 색(`fg-strong`)·medium으로 해결.

**Letter Spacing**
| Token | 용도 |
|---|---|
| `tight` | 큰 헤딩(text-2xl 이상) |
| `normal` | 본문 |
| `wide` | 대문자 라벨, 뱃지 텍스트 |
