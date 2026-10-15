# CTDS 조립 가이드

**벤더에 없는 자리를 조립할 때** 쓰는 메타 알고리즘. 벤더 컴포넌트 문서(`components/*.md`)가 **"있는 컴포넌트를 어떻게 쓰는가"**를 다룬다면, 이 문서는 **"없는 컴포넌트를 어떻게 짜는가"**를 다룬다.

> 전제: [[PRINCIPLES]]·[[GUIDE]]를 이미 읽었다. 이 문서는 그 위의 조립 레이어.

---

## 0. 왜 이 문서가 필요한가

CTDS 벤더(`web/components/`)는 공통 자리(Button·Input·Modal·Badge 등)만 담는다. **페이지 헤더·섹션 헤더·배너·도메인 리스트 row** 같은 자리는 프로젝트마다 생김새가 다르다 — 벤더로 못 박기 어렵고, 유저·AI가 그때그때 조립할 수밖에 없다.

이 "조립" 자리가 CTDS의 **진짜 결과물**이다. 토큰은 토큰대로, 벤더는 벤더대로 지켜져도, **조립 알고리즘이 없으면 매 프로젝트마다 리듬·위계·여백이 흩어진다.**

이 문서는 그 흩어짐을 막는 **조립 순서**를 못 박는다.

---

## 1. 조립 알고리즘 (5단계)

벤더에 없는 자리를 짤 때 **반드시 이 순서로** 생각한다. 건너뛰면 수제 하드코딩으로 샌다.

### 1단계 — "이게 정말 벤더에 없는가"를 먼저 의심한다

조립 전에 벤더를 재확인한다. [[PRINCIPLES]] §5a — 역할이 같은 벤더가 있으면 반드시 쓴다.

- `web/components/index.ts` 또는 `prompts/components/` 디렉토리 전수 스캔
- "비슷한 역할"이 아니라 **"같은 역할"**이면 벤더 사용. 생김새가 조금 다른 건 variant·size로 해결 가능한지 재검토
- 벤더 기존 variant로 안 되면 → **새 variant/size 신설**이 로컬 조립보다 우선 ([[PRINCIPLES]] §5a)
- 정말로 벤더에 없는 자리임을 확인한 뒤에만 2단계로

**[HARD] 리스트/반복 자리는 1단계에서 반드시 벤더로 확정** — "반복 아이템 N개"가 보이는 순간 Table/ListItem/EventListItem/MenuItem 중 하나를 **반드시** 쓴다. 레시피 조립은 리스트 자리를 커버하지 않는다. ([[PRINCIPLES]] §5a HARD, card-row 레시피 폐기 참고)

### 2단계 — "가장 가까운 벤더 anatomy"를 베낀다

새 자리의 뼈대를 **같은 성격의 벤더 컴포넌트에서 복제**한다. 새로 짜지 않는다.

- "액션+라벨 묶음"이면 Button/Toolbar의 anatomy
- "표시 라벨"이면 Badge/Chip의 anatomy
- "텍스트 블록"이면 Callout의 anatomy (단, [[PRINCIPLES]] §5b 준수)
- "아이콘+텍스트 row"이면 ListItem의 anatomy

anatomy = padding·gap·radius·border 전략. 이걸 복제하면 벤더가 축에 반응하는 방식이 자동으로 따라온다.

**벤더 사용 시 반드시 확인:**
- **Prop 이름·타입**은 `web/components/<Name>/<Name>.tsx`의 export type 선언에서 확인 (레시피 예시 그대로 믿지 말 것 — Badge는 `tone`이 아니라 `status`, Stepper는 `value`가 아니라 `activeIndex`)
- **Icon 이름**은 `web/components/Icon/Icon.tsx`의 phosphor 레지스트리에서 확인 — 레시피/다른 문서에 등장하는 이름이 실제 등재된 이름이라는 보장 없음
- **`"use client"` 전염**: 쓰는 벤더 중 하나라도 `"use client"`면 조립하는 **page 자체도 `"use client"`**. compound(`Stepper.Item`·`Card.Header` 등)를 Server Component에서 접근하면 **런타임 undefined**(Next 15/React 19 경계 이슈). 현재 Button/Icon/IconButton/Stepper 등 대다수 vendor가 client — 사실상 조립 page는 모두 client로 가는 쪽이 안전

**벤더 수정 vs 로컬 파생 결정 트리** ([[feedback_no_vendor_modification]], [[feedback_local_derivative_over_handrolled]]):

벤더에 "비슷하지만 그대로는 안 되는" 자리를 만들 때 네 갈래 중 하나를 **글로 적어 결정**한다 — 수제(div+span 하드코딩) 로 빠지는 순간 토큰·여백·사이즈 리듬이 전부 깨진다.

1. **벤더 variant/size 로 커버됨** → 그대로 import, 변경 금지.
2. **커버 안 됨 + 다른 사용처에도 쓰일 패턴** → `ctds-component` 스킬로 넘겨 **벤더에 새 variant/size 신설**. Layer 1(코드)과 Layer 2(문서) 쌍으로 수정. 영향 범위 평가 필수.
3. **커버 안 됨 + 번역/페이지 이 자리에만 필요** → **로컬 파생**: 가장 비슷한 벤더 코드(JSX + CSS Module)를 소비 프로젝트 로컬 경로(`web/app/_components/` 또는 `app/components/<page>/_parts/`)에 **다른 이름**으로 복사. 토큰·height·padding·gap·radius 기본값은 **건드리지 말고 유지** — 조정은 추가 slot/위치/variant 수준. 벤더 패키지(`packages/ctds-cli/assets/`, `node_modules/ctds/`) 는 **절대 수정 금지**.
4. **벤더에 비슷한 것도 없고 레시피에도 없음** → 사용자에게 보고. 수제 조립로 임의 결정 금지.

**왜 로컬 파생이 수제보다 통일성이 좋은가**: 벤더의 토큰 선택을 그대로 베낀 상태로 시작하므로 Shape/Density/Hue 축 스왑에 자동 반응. 수제는 padding `12px`·gap `8px` 같은 직관값이 CTDS space scale 과 미묘하게 어긋나거나 하드코딩되고, 축 스왑에서 그 자리만 깨진다.

### 3단계 — 레시피를 확인한다

`prompts/recipes/`에 **자리별 조립 레시피**가 있다. 맞는 레시피가 있으면 그 토큰·구조 그대로 쓴다.

- 레시피는 "이 자리에서 어떤 토큰 조합을 쓰는가"를 명시
- 레시피가 **없는 자리**면 4단계로. 레시피가 **있는데 맞지 않으면** 레시피를 수정하거나 신설(이 문서를 업데이트)
- 안티패턴 메모리(`antipattern_*`)에 해당하는 자리인지도 확인 — 긍정형 레시피가 없어도 "하지 마"는 있을 수 있다

### 4단계 — 토큰만 쓴다

조립 코드에 리터럴을 쓰지 않는다. [[PRINCIPLES]] §6.

- 색·크기·시간·그림자·폰트 — 전부 `var(--*)` 또는 vendor 컴포넌트 경유
- 간격은 [[tokens/spacing]]의 "앱 리듬 vs 랜딩 리듬"에서 먼저 리듬 선택 → 그 안에서 스케일
- `gap`과 `padding/margin`을 양쪽에서 동시에 잡지 않는다 (이중 여백 금지, [[tokens/spacing]] Don't)
- 20px 미만 `semibold`/`bold` 금지, 섹션 h2/h3 semibold 금지 ([[tokens/typography]])

### 5단계 — 조립 검증

조립이 끝나면 자가 검증. 항목:

**값·토큰**
- [ ] 토큰·vendor 외에 **리터럴 값**이 있는가 → 없어야 함
- [ ] `width/height/max-width`에 **1px/0.75em** 같은 리터럴 있는가 → 금지. hairline은 `border-left: 1px solid var(--border)` + `align-self: stretch`로
- [ ] `border: 1px solid transparent` 가드 패턴 있는가 → 금지 (check_bg_stroke_combo hook). border 안 쓸 땐 선언 자체를 생략
- [ ] 날짜·시간이 숫자 전용("10. 13", "2026-10-13")인가 → "10월 13일 / 12분 전" 또는 Tooltip에 ISO ([[feedback-date-writing]])
- [ ] **font-weight 토큰 이름이 정확한가** → `var(--font-weight-medium)` ✓ 아니라 `var(--font-medium)` ✗ 유령 토큰. 조용히 400으로 상속되어 **"얇음" 증상의 숨은 원인** ([[PRINCIPLES]] §6a)

**레이아웃·그룹**
- [ ] 간격을 `margin-top` 또는 `A + B` 선택자로 만들고 있는가 → **그룹 설계가 틀렸음**. wrapper를 추가해 flex column + gap으로 풀어라 (§2a)
- [ ] 섹션 header에 `margin-bottom`이 있는가 → section 자체를 flex column + gap으로. header는 margin 없음
- [ ] 섹션 상단에 큰 padding으로 "위 공간" 확보 중인가 → 섹션 사이 분리는 부모 그룹의 gap으로 (§2a)
- [ ] 조립 코드에 `<section>`/`<article>`/`<nav>` semantic 태그를 썼는가 → **금지**. AppShell의 `.content section`이 `padding-top: 80px` 꽂아 "섹션 머리에 거대한 여백" 함정. `<div>`로 짠다 ([[feedback-no-semantic-tags-in-components]])

**리스트·반복 자리 (HARD)**
- [ ] 반복 아이템 N개를 `<ul>`/`<li>` + 자체 className으로 짰는가 → **즉시 금지** ([[PRINCIPLES]] §5a HARD). 아래 중 하나로 교체:
  - 표 역할 → [[components/table-row]]
  - 단건 반복(알림·활동·작업·자원) → [[components/list-item]]
  - 날짜 중심 이벤트 → [[components/event-list-item]]
  - 메뉴 아이템 → [[components/menu-item]] / [[components/sidebar-item]]
- [ ] "카드처럼 보이는 리스트"가 필요하다는 이유로 수제 조립 중인가 → ListItem은 **chrome 없음이 공식**. border/bg 두르는 리스트는 (1) 블록 하나면 Callout, (2) 리스트 전체라면 **ListItem에 새 variant 신설**. 수제 조립 금지

**리듬·여백**
- [ ] 부모 gap + 자식 padding 이중 여백이 있는가 → 한쪽만
- [ ] 콘솔 리듬에서 **섹션 간 gap이 space-6 이상**인가 → `space-4` 고려. 섹션이 border/배경으로 분리돼 있으면 space-6는 "구조 끊어진" 느낌 ([[tokens/spacing]])
- [ ] 작은 컴포 묶음(버튼↔버튼) gap이 `space-1`인가 → 고정
- [ ] 아이콘·텍스트가 hairline에 padding 없이 붙었는가 → padding 확보
- [ ] **멀티라인 블록**(banner·card)에서 padding이 상하 `space-3` 이상인가 → single-line과 같은 padding 쓰면 타이트
- [ ] **title + sub** 2줄 묶음의 내부 gap이 `space-1` 이상인가 → `space-0.5`는 녹아보임

**정렬**
- [ ] 아이콘 + 여러 줄 텍스트 조합에서 `align-items: center`인가 → **첫 줄과 어긋남**. `flex-start` + 아이콘 `margin-top: space-0.5`로 보정
- [ ] "라벨 하나만" 블록 위에 뜨거나 혼자 떠서 여백이 깨지는가 → 라벨은 header 자리에 묶거나, 블록 밖으로 승격

**색·면**
- [ ] 배경 + 테두리 동시 적용이 있는가 → 둘 중 하나만 ([[PRINCIPLES]] §5b)
- [ ] 평상시 border만, hover에서 bg 추가 패턴 쓰는가 → OK (`cardRow` 전략 A). 역으로 평상시 bg + hover border 금지

**타이포·숫자**
- [ ] 숫자 셀을 우측정렬했는가 → 좌측정렬 유지
- [ ] 가운뎃점(·) 구분자가 있는가 → hairline 세로선으로 교체
- [ ] 20px 미만 글자에 `semibold` 썼는가 → medium 이하 ([[tokens/typography]])
- [ ] **섹션 타이틀(h2)이 text-xl 이상**인가 → 콘솔 리듬에서는 `text-lg` 기본. medium 가중치만으론 크면 "크고 얇은" 느낌으로 뜸

**아이콘**
- [ ] 아이콘을 인라인 `<svg>`로 쐈는가 → Icon 컴포넌트 경유

이 체크리스트는 메모리에 쌓인 피드백의 **긍정형 자동화** — 조립 시점에 매번 돌린다. 특히 1~3번은 **hook이 자동 차단**하므로 미리 검증.

---

## 2. "조립 자리"로 흔히 등장하는 패턴

벤더에 없는 자리 중 반복적으로 등장하는 것들. **각 패턴은 `recipes/` 아래에 레시피가 있다** (없으면 신설).

- **페이지 헤더** — 큰 타이틀 + 서브텍스트 + (옵션) 우측 액션 → [[recipes/page-header]]
- **섹션 헤더** — 중간 타이틀 + (옵션) 설명 1줄 + (옵션) 우측 액션/카운트 → [[recipes/section-header]]
- **메타 라인** — 라벨 여러 개가 가로로 나열, 사이 구분자 필요 → [[recipes/meta-line]]
- **카드 리스트 row** → ~~레시피 아님~~. [[components/list-item]] 벤더 ([[PRINCIPLES]] §5a HARD)
- **폼 푸터** — Spacer + outline(취소) + primary(제출) → [[recipes/form-footer]]
- **페이지 상단 안내 배너** — 톤 있는 가로 바, 좌측 아이콘+텍스트 + 우측 액션 → [[recipes/page-banner]]
- **흐름 속 참고 각주** — 아이콘 + 1~2줄 muted 텍스트, 톤·액션 없음 → vendor [[components/hint]] (레시피 아님. "아이콘-텍스트 라인 맞추기" 함정 반복 때문에 벤더로 확정)

이 목록 자체가 "지금 CTDS가 자주 조립해야 하는 자리"의 정식 지도다. 새 패턴이 세 번 반복되면 이 목록에 추가하고 레시피를 쓴다.

---

## 2a. 레이아웃 1원칙 — "관련있는 것끼리 묶는다"

**레이아웃 설계의 가장 중요한 결정은 "그룹"이다.** 어떤 요소가 어떤 요소와 한 묶음인지 먼저 정하고, 그 다음 각 그룹을 flex column으로 만들고, gap으로 간격을 준다. padding/margin으로 간격을 벌리는 접근은 **틀렸다**.

**원칙:**
1. 역할이 가까운 요소들을 **같은 flex 컨테이너**로 묶는다 (한 그룹 = 한 wrapper)
2. 그룹 안은 **좁은 gap** (`space-2` ~ `space-3`), 그룹끼리는 **넓은 gap** (`space-6` ~ `space-10`)
3. **모든 간격은 flex gap**. `margin-top`/`margin-bottom` 트릭 금지. `+` 선택자로 "다음 요소에만 추가 공간" 트릭도 금지 — gap으로 못 풀면 **그룹을 다시 짜라**
4. 섹션 header의 `margin-bottom` 금지. 섹션 자체를 flex column + gap으로 만들어 header와 body를 자연스럽게 묶는다

**전형 (3-tier 리듬):**
```
page (gap: space-10)                             ← 그룹 사이 넓게
├─ group A: 소개 (gap: space-3)                   ← 같은 그룹은 좁게
│  ├─ banner
│  ├─ page-header
│  └─ inline hint
├─ group B: Stepper (gap: space-2)
│  ├─ eyebrow
│  └─ Stepper
└─ group C: 섹션들 (gap: space-6)                 ← 중간 호흡
   ├─ section (gap: space-2)                     ← 섹션 안은 좁게
   │  ├─ section-header
   │  └─ card-list (gap: space-2)
   └─ section (gap: space-2)
```

**금지:**
- [HARD] `.page { gap: X }` 하나로 모든 자식 블록 간격 담당 — 역할 다른 블록이 "통짜"로 뜸
- [HARD] `A + B { margin-top: ... }`로 특정 자리만 벌리기 — 그룹 설계가 틀렸다는 신호. wrapper를 추가해서 gap으로 풀어라
- [HARD] 섹션 header `margin-bottom` — section을 flex column + gap으로. 섹션 자체가 header↔body를 묶음
- [HARD] 섹션 head 쪽에 큰 padding으로 "위 공간 확보" — padding은 "안쪽" 공간, 섹션 사이 분리는 부모 그룹의 gap으로

**갭 선택 — 핵심 원칙: "가까운 관계일수록 더 좁게"**

갭의 크기는 **관계의 가까움에 반비례**한다. 두 요소가 "가장 가까운 관계"면 가장 좁은 gap, "성격이 다른 묶음"이면 가장 넓은 gap. **인접한 두 레벨은 반드시 한 단계 이상 차이**가 나야 위계가 생긴다 — 같으면 뭉쳐 보임.

**관계 → 갭 매핑 (앱/콘솔 리듬, 실측 기준):**

| 관계 | 갭 | 예시 |
|---|---|---|
| **리스트 안 반복 아이템** (가장 가까움) | `space-1` | cardList의 cardRow들 |
| **그룹 안 미니 묶음** | `space-2` | 타이틀+설명, eyebrow+컨트롤, Stepper eyebrow+Stepper |
| **같은 그룹 안 header ↔ body** | `space-3` | section header ↔ cardList, pageHeader ↔ inlineHint |
| **같은 그룹 안 성격 다른 요소** | `space-6` | 메타 banner ↔ 본문 headerBlock |
| **섹션 ↔ 섹션 (반복 작업 단위)** | `space-20` (80px) | "작업 계획" ↔ "코드 변경안 실행 요청" |
| **그룹 ↔ 그룹 (성격 다른 묶음)** | `space-20` (80px) | introGroup ↔ stepperGroup ↔ sectionsGroup |

**철칙: 인접 레벨 간 반드시 한 단계 이상 차이**
- 예: 리스트 아이템 gap `space-1` → 섹션 header↔body gap `space-3` (한 단계 뛰어넘음)
- 예: 섹션 header↔body `space-3` → 섹션 ↔ 섹션 `space-20` (큰 점프)
- **같은 값 금지**: 아이템 간 `space-2` + 섹션 header↔body `space-2` → "타이틀과 아이템이 같은 레벨"로 뭉쳐 보임

> ⚠ 처음엔 "섹션 반복은 space-6, 그룹끼리는 space-10"으로 잡았지만 실측에서 둘 다 **좁았음**. 콘솔 리듬이라도 **"독립된 작업 단위"끼리는 space-20 수준의 호흡**이 자연스러움. "space-6은 섹션 내부 블록 단위"로만 쓸 것.

## 2b. 카드로 감싸는 자리 — "균일 padding 지킬 수 있을 때만"

조립 자리에 **카드(border + radius + bg)**를 두르면 안쪽은 **상하좌우 균일 padding**이 공식 ([[tokens/spacing]] "카드·패널 내부 padding"). 지키지 못하면 카드 자체를 포기하는 게 낫다.

**카드 포기 시그널:**
- 카드 안에 **라벨/eyebrow가 혼자** 떠서 균일 padding을 깬다 → 라벨을 밖(PageHeader eyebrow)으로 승격 또는 생략, 카드 폐기
- 카드 안 요소들이 **각자 다른 수평 정렬**(가운데 정렬 Stepper + 오른쪽 정렬 라벨) → 균일 padding으론 못 담음. 풀어 놓거나 요소 하나만 남김
- 카드가 "그냥 공간 묶음용"일 뿐 **분리 신호가 없다** → border·bg 자체가 노이즈. 페이지 흐름에 그대로 두고 gap만

## 3. 조립 시 자주 틀리는 자리

조립할 때 사람·AI 모두 자주 미끄러지는 자리. 안티패턴 메모리와 쌍을 이룬다.

- **"페이지 맨 위에 Tabs만"** — Tabs 위에 PageHeader(h1/breadcrumb)가 먼저 와야 한다 ([antipattern-tabs-without-title])
- **"워크스페이스 스위처를 수제 Button+Dropdown으로 조립"** — 전용 IdentityButton + DropdownMenu 사용 ([antipattern-workspace-switcher])
- **"Topbar leading에만 요소 몰림"** — leading/center/trailing 3구역 균형. leading·trailing 짝 필수 ([[components/topbar]])
- **"Sidebar 2단 쉘을 SidebarSplit으로"** — 바깥 flex로 Rail+Sidebar 직접 조립 ([feedback-sidebar-scroll])
- **"안내 영역을 outline Callout으로"** — 색 테두리 + 색 배경 조합은 영구 금지 ([feedback-no-outlined-callout]). muted 인라인 텍스트 한 줄로 대체

---

## 관련

- [[PRINCIPLES]] — 전역 원칙. 특히 §1(값/판단 분리), §5a(컴포넌트 우선), §5b(배경 또는 테두리), §6(하드코딩 금지)
- [[GUIDE]] — 섹션 문서 작성 가이드. ASSEMBLY는 그 위의 **조립 레이어**
- [[components/_variants]] — 역할 × variant 매핑. 2단계(가장 가까운 벤더 anatomy)에서 참조
- [[tokens/spacing]] — 앱 리듬 vs 랜딩 리듬. 4단계(토큰) 참조
- `prompts/recipes/` — 자리별 조립 레시피 모음. 3단계 참조
