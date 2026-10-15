# Page Header

### 원칙
페이지 body의 **첫 블록**. "이 페이지가 뭔지"를 담는 자리. `h1`·eyebrow·lead·메타·페이지 액션이 여기 모인다. shell의 chrome인 [[components/topbar]]와는 역할이 다르다 — Topbar는 '지금 어디(breadcrumb)·공용 액션'을 담는 **얇은 축**이고, PageHeader는 '이 페이지의 content head'다.

레이아웃은 CSS Grid 2행 2열. Title과 Actions는 **같은 가로줄**, Eyebrow·Lead·Meta는 그 위아래로 수직. Actions가 없으면 Title이 혼자 그 줄을 차지한다. 자식 slot은 자유롭게 생략 가능 — 빈 slot은 자리를 먹지 않는다.

### Do
- 페이지당 **하나만** 둔다. `h1`은 PageHeader.Title이 담당하므로 중복 금지.
- body의 **첫 섹션 바로 앞**에 둔다. Topbar 바로 아래, 또는 shell 없는 페이지라면 콘텐츠 영역 최상단.
- Title + Lead 조합이 기본. 더 담고 싶을 때만 Eyebrow·Meta·Actions을 추가한다.
- Actions는 Title과 짝. 보통 primary + outline 두 개 ([[feedback_button_variant_defaults]]). overflow·share 같은 보조 액션은 ghost [[components/icon-button]]을 섞어 쓴다 — Button은 왼쪽, **IconButton은 더 오른쪽 끝**에 둔다(라벨이 있는 쪽이 선, 아이콘 전용이 뒤). IconButton은 **한 단계 크게**(Button이 md면 `size="lg"`) — Button 옆에 두면 정사각형이 좁아 보여서 균형을 맞춰야 한다.
- Meta 안의 [[components/badge]]는 `variant="soft"` 연한 톤이 기본 — 본문 리듬에 묻어가도록. solid는 상태를 강조해야 할 때만.
- size는 기본 `md`. 설정·서브페이지는 `sm`, 랜딩·docs 인덱스는 `lg`.

### Don't
- Breadcrumb slot을 두지 않는다 — "지금 어디"는 [[components/topbar]]의 몫. shell이 없는 페이지에서도 Topbar를 두고 그 안에 Breadcrumb을 넣는다.
- Topbar **안에** 넣지 않는다 — Topbar의 "얇은 축" 약속이 깨진다 ([[components/topbar]]).
- `<section>` **안에** 넣지 않는다 — 전역 `.content section`이 `padding-top: 80px`를 꽂는다. PageHeader는 section 바깥, body 최상단에 둔다 ([[feedback_no_semantic_tags_in_components]]).
- 색 배경 + 색 테두리 조합으로 꾸미지 않는다 — 그건 [[components/callout]]의 자리 ([[feedback_bg_or_stroke_only]]).
- Eyebrow에 uppercase + wide letter-spacing 조합 금지 ([[feedback_no_uppercase]]).
- Lead에 em dash·ellipsis 금지 ([[feedback_no_em_dash]]).
- 페이지에 두 개 쓰지 않는다. 하위 섹션 head는 `<h2>`로.
- 데이터 요약(KPI·숫자·차트)을 PageHeader에 끼우지 않는다 — body 첫 섹션의 [[components/metric-card]] 자리.

### Fallback
size 애매하면 `md`. 글로벌 유틸 `.page-title`(4xl)보다 두 단계 작은 `2xl` — PageHeader가 챙기는 수직 여백/eyebrow/meta와 어우러져 "과하지 않은 head"가 되도록 톤 다운한 값이다.
Title만으로 충분하면 Lead 생략 OK. Lead를 쓸 거면 1~2문장으로 짧게.

### 관련
- [[components/topbar]] — chrome 축. Breadcrumb·공용 액션은 Topbar의 자리, 페이지 head는 PageHeader의 자리.
- [[components/breadcrumb]] — Topbar 안에서만 쓴다. PageHeader slot에는 없다.
- [[components/callout]] — "지금 공지해야 할 큰 콘텐츠"는 PageHeader가 아니라 Callout.
- [[components/badge]] — PageHeader.Meta 안에서 상태 라벨로.
- [[components/button]] — PageHeader.Actions 안에서. primary + outline 짝이 기본.
- [[tokens/spacing]] — size별 아래 margin과 row-gap을 결정.
- [[tokens/typography]] — Title letter-spacing은 -0.03em, size별 font-size는 토큰 경유.

### Props 시그니처
```tsx
<PageHeader size="sm | md | lg">
  <PageHeader.Eyebrow>Overview</PageHeader.Eyebrow>
  <PageHeader.Title>Page title</PageHeader.Title>
  <PageHeader.Lead>한두 문장 설명.</PageHeader.Lead>
  <PageHeader.Meta>
    <Badge>draft</Badge>
    <span>updated oct 14</span>
  </PageHeader.Meta>
  <PageHeader.Actions>
    <Button variant="outline">share</Button>
    <Button variant="primary">publish</Button>
  </PageHeader.Actions>
</PageHeader>
```

| 요소 | 역할 |
|---|---|
| `PageHeader` | grid 컨테이너. slot 자리와 세로 리듬을 쥔다 |
| `PageHeader.Eyebrow` | 선택. 작은 상단 라벨. muted + small |
| `PageHeader.Title` | 필수. `<h1>` 자동, size별 font-size |
| `PageHeader.Lead` | 선택. muted 본문, max-width 72ch |
| `PageHeader.Meta` | 선택. Badge·날짜 등 가로 묶음 |
| `PageHeader.Actions` | 선택. Title과 같은 줄 오른쪽 pin |

### Size 매트릭스

| size | Title | Lead | 용도 |
|---|---|---|---|
| `sm` | `--text-xl` | `--text-sm` | 설정·서브페이지 head |
| `md` (기본) | `--text-2xl` | `--text-base` | 일반 페이지 head |
| `lg` | `--text-3xl` | `--text-base` | 랜딩·docs 인덱스 |

**외부 간격**: PageHeader → 다음 섹션 간격은 **상위 wrapper gap이 담당**. 벤더가 margin-bottom으로 공급하지 않음 — margin trick 금지, `display: flex; flex-direction: column; gap: var(--space-6)` 식 group wrapper + gap만 사용 ([[feedback_page_differential_rhythm]], [[feedback_no_double_spacing]]).

### 금지 조합
- Breadcrumb을 PageHeader slot으로 노출 — Topbar만의 자리.
- `<section>` 안에 삽입 — 전역 padding 충돌.
- 색 배경 + 색 border — Callout 자리 침범.
- Title 없이 Lead/Meta만 두기 — head 역할이 성립 안 함.
- 페이지에 두 번 — `h1` 중복.
- Actions 안에 세 개 이상 Button — primary + outline 짝이 기본, 더 필요하면 overflow 메뉴로.

### 조합 예시

```tsx
// 1) 기본 — Title + Lead만
<PageHeader>
  <PageHeader.Title>Billing</PageHeader.Title>
  <PageHeader.Lead>구독 플랜과 결제 수단을 관리합니다.</PageHeader.Lead>
</PageHeader>

// 2) 액션 짝 — Title | Actions 같은 줄 자동 분리
<PageHeader>
  <PageHeader.Title>Projects</PageHeader.Title>
  <PageHeader.Lead>진행 중인 프로젝트와 아카이브를 모아 봅니다.</PageHeader.Lead>
  <PageHeader.Actions>
    <Button variant="outline">import</Button>
    <Button variant="primary">new project</Button>
  </PageHeader.Actions>
</PageHeader>

// 2-b) IconButton + primary — Button이 왼쪽, IconButton들이 더 오른쪽 끝.
//      IconButton은 한 단계 크게(size="lg") — Button md와 시각적 균형.
<PageHeader>
  <PageHeader.Title>Documents</PageHeader.Title>
  <PageHeader.Lead>팀 문서와 공유 링크를 관리합니다.</PageHeader.Lead>
  <PageHeader.Actions>
    <Button variant="primary">new doc</Button>
    <IconButton size="lg" icon={<Icon name="share-network" />} aria-label="share" />
    <IconButton size="lg" icon={<Icon name="dots-three" />} aria-label="more" />
  </PageHeader.Actions>
</PageHeader>

// 3) 메타 담긴 상세 head — Badge·날짜
<PageHeader>
  <PageHeader.Eyebrow>Spec</PageHeader.Eyebrow>
  <PageHeader.Title>Checkout flow v2</PageHeader.Title>
  <PageHeader.Lead>결제 단계의 폼 밀도와 오류 복구를 개선합니다.</PageHeader.Lead>
  <PageHeader.Meta>
    <Badge variant="soft" status="warning">draft</Badge>
    <span>updated oct 14</span>
    <span>heeyoung</span>
  </PageHeader.Meta>
  <PageHeader.Actions>
    <Button variant="outline">share</Button>
    <Button variant="primary">publish</Button>
  </PageHeader.Actions>
</PageHeader>

// 4) 설정 서브페이지 — size=sm
<PageHeader size="sm">
  <PageHeader.Title>API keys</PageHeader.Title>
  <PageHeader.Lead>개발자 토큰을 발급하고 폐기합니다.</PageHeader.Lead>
</PageHeader>

// 5) 랜딩·docs 인덱스 — size=lg
<PageHeader size="lg">
  <PageHeader.Eyebrow>CTDS</PageHeader.Eyebrow>
  <PageHeader.Title>디자인 시스템 하나로 끝</PageHeader.Title>
  <PageHeader.Lead>8축 토큰 스왑으로 브랜드·밀도·형태를 즉시 바꿉니다.</PageHeader.Lead>
  <PageHeader.Actions>
    <Button variant="outline">문서 보기</Button>
    <Button variant="primary">시작하기</Button>
  </PageHeader.Actions>
</PageHeader>
```

### 조립 — 상위 shell과의 공식
- shell 안 페이지: Topbar(size `md`) 바로 아래, body 콘텐츠 영역의 **첫 블록**.
- Topbar의 Breadcrumb과 PageHeader의 Title은 **다른 자리**다. "지금 어디(breadcrumb)" + "이 페이지(title)"는 쌍으로 들어가 되 **중복되지 않는다**.
- 아래 간격은 **상위 wrapper gap**이 쥔다. PageHeader는 margin 공급 안 함, 다음 섹션에서 `padding-top`을 또 걸지 않는다 ([[feedback_no_double_spacing]], [[feedback_page_differential_rhythm]]).

### Known Gaps
- 긴 Title의 반응형 축약 규칙은 없다. 자유롭게 줄바꿈. 필요하면 호출처가 `max-width`를 override.
- 다국어/RTL은 grid 자체가 flow 따라감 (`margin-inline`·`justify-items`로 대응).
