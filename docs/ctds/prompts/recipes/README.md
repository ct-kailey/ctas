# Recipes

**자리별 조립 레시피 모음.** 벤더에 없는 자리를 조립할 때, 토큰·vendor 컴포넌트의 **정식 조합 규격**이다.

## 왜 레시피인가

벤더 컴포넌트 문서(`components/*.md`)는 "**있는 컴포넌트를 어떻게 쓰는가**"만 다룬다. 하지만 실제 페이지는 벤더가 없는 자리가 더 많다 — 페이지 헤더, 섹션 그룹, 메타 라인, 빈 상태 등. 이 자리들은 **여러 토큰과 vendor 컴포넌트의 조합**으로만 성립하고, 조합의 리듬·위계·여백이 매번 달라지면 CTDS의 결과물이 흩어진다.

레시피는 그 **조합을 못 박는다** — 벤더 컴포넌트를 추가하지 않고도, 조립 시점에 "이 자리는 이 토큰 조합"이라는 표준을 제공.

## 레시피 작성 규칙

레시피 파일은 [[GUIDE]]의 **공통 골격**을 따르되, 아래 추가 섹션을 포함한다.

```markdown
# <레시피 이름>

### 원칙
<1~2줄. 이 자리의 역할·언제 쓰는가>

### Anatomy
<이 자리를 구성하는 요소. 뼈대 구조. 수치가 아니라 역할 중심.>

### Do
- <토큰·vendor 조합 규칙 (명령형)>

### Don't
- <금지 조합. [HARD]/[SOFT] 명시 — PRINCIPLES §4a>

### Fallback
<규칙 밖 자리에서의 기본 선택>

### 조립 예시
<규칙을 종합한 최소 코드 예시 1개. 수치 하드코딩 금지, 토큰·vendor만.>

### 관련
- [[다른 레시피]] / [[components/X]] / [[tokens/Y]]
```

## 등재된 레시피

- [[recipes/page-header]] — 페이지 상단: 큰 타이틀 + 서브텍스트 + (옵션) 액션
- [[recipes/section-header]] — 섹션 상단: 중간 타이틀 + (옵션) 설명/액션
- [[recipes/meta-line]] — 메타 라벨 가로 나열 (구분자 포함)
- ~~[[recipes/card-row]]~~ — **폐기**. 리스트 자리는 [[components/list-item]] 벤더 사용 ([[PRINCIPLES]] §5a HARD)
- [[recipes/form-footer]] — 폼·모달 하단 액션 묶음
- [[recipes/page-banner]] — 페이지 폭 안내 배너

> "빈 상태"는 vendor [[components/empty-state]]로 해결 — 조립 레시피 아님.

## 신설 기준

새 자리가 **3번 반복**되면 레시피로 올린다. 1~2번은 vendor anatomy 복제로 처리하되, 3번째가 되면 조합 규칙이 자리 잡은 것 — [[ASSEMBLY]] §2 목록에 추가하고 이 디렉토리에 파일 신설.

## 조립 테스트 결과 (레시피 품질 보증)

레시피는 **반드시 실제 조립으로 검증**된다. 테스트 페이지는 `web/app/assembly-test/`. 지금까지 검증 중 발견된 결함:

- **meta-line separator** — 초기 레시피의 `width:1px / height:0.75em`가 check_tokens hook에서 리터럴로 차단됨 → `border-left: 1px solid var(--border)` + `align-self: stretch`로 수정
- **투명 테두리 가드 금지** — `border: 1px solid transparent` 가드 패턴이 check_bg_stroke_combo hook에서 차단됨 → border 안 쓸 땐 선언 자체 생략. page-banner, card-row 레시피 수정
- **날짜 포맷** — 초기 예시들의 "10. 13." 숫자 날짜가 [[feedback-date-writing]] 룰 위반 → "10월 13일" 표기로 수정
- **Callout 유령 참조** — `[[components/banner]]`가 유령 → `[[recipes/page-banner]]`로 교체
- **아이콘 이름 misname** — 레시피 예시의 `name="chevron-right" / "refresh" / "share" / "code" / "shield" / "checklist" / "terminal"` 중 어느 것도 CTDS Icon 세트에 **등재되지 않음**. 각각 `caret-right / arrow-clockwise / share-network / brackets-square / shield-check / clipboard-text / brackets-square`로 교체. **레시피에 "아이콘 이름은 `web/components/Icon/Icon.tsx`의 phosphor 이름 레지스트리에서 찾을 것" 가이드 추가 필요**
- **Badge API prop 오류** — 레시피가 `tone="warning"`을 썼지만 실제 API는 `status="warning"` + `variant="soft"` 조합. `tone`은 Callout prop. 레시피 수정 필요
- **Vendor prop 선언 확인 공백** — ASSEMBLY §1 2단계 "가장 가까운 벤더 anatomy 베끼기"는 API까지 확인하지 않으면 복제가 깨짐. ASSEMBLY에 **"vendor prop·타입 선언을 반드시 확인"** 단계 추가 필요
- **Compound component의 Server Component 경계 — "use client" 전염** — Stepper처럼 `"use client"` 벤더를 Server Component page에서 compound property(`Stepper.Item`)로 접근하면 **런타임에 `Element type is invalid` + undefined**. Next 15/React 19 경계 이슈. 레시피 조립 코드는 vendor 하나라도 client면 **page 자체도 `"use client"`로 선언** — ASSEMBLY에 "조립 page가 client 벤더를 포함하면 'use client' 강제" 가이드 추가

**브라우저 렌더 1차 피드백 (유저 육안 검증, 2026-10-14)**:
- **섹션 간 gap `space-6` 과잉** — 콘솔 리듬에서 섹션이 border/배경으로 이미 분리되면 `space-4`가 적정. page 레벨 gap을 `space-4`로 조정 + ASSEMBLY 체크리스트에 "섹션 간 space-6 과잉" 항목 추가
- **섹션 타이틀 `text-xl` + medium → "크고 얇음"** — [[recipes/section-header]] 기본값을 `text-lg`로 다운. text-xl은 랜딩 리듬에만
- **멀티라인 banner padding 타이트** — `padding: space-2 space-4` + `gap: space-0.5`가 멀티라인에서 숨 안 쉼. 단일/멀티라인 2 모드로 분리 + 멀티라인은 상하 `space-3`
- **아이콘 + 다줄 텍스트 center 정렬 함정** — 긴 inline hint에서 `align-items: center`면 아이콘이 중앙쯤 뜸. `flex-start` + `margin-top: space-0.5`로 **첫 줄 baseline** 맞춤 필요
- **"라벨 혼자 위에 뜨는" 함정** — Stepper 카드에서 "작업 전 점검" 라벨을 Stepper 위에 flex-end로 두니 라벨 영역만 공백 → 라벨은 header 자리로 명시적 묶음

**브라우저 렌더 2차 피드백 (유저 육안 검증, 2026-10-14)**:
- **"page gap 하나로 다 담당" = 통짜 느낌의 근원** — 섹션 간 gap을 `space-4`로 줄여도 모든 블록 사이가 같은 공간이면 역할 분리가 안 됨
- **"Stepper 카드" 자체 폐기** — 카드로 감싸면 상하좌우 균일 padding이 공식인데 "라벨 혼자" 있는 조합은 균일 못 지킴. 카드를 포기하고 페이지 흐름에 그대로 놓는 쪽이 정답. → ASSEMBLY §2b "카드 포기 시그널" 섹션 신설
- **섹션 header가 "통짜 라벨"만 있으면 어색** — h2만 떠있고 count·설명·eyebrow 없으면 섹션끼리 구별 안 됨. count badge 또는 설명 1줄 **의미 있는 자리면** 넣기

**브라우저 렌더 3차 피드백 (유저 육안 검증, 2026-10-14)** — ★ 레이아웃 전면 교체:
- **"margin-top differential rhythm"은 틀린 결론이었음** — 2차에서 시도한 `A + B { margin-top: ... }`도 그룹 설계가 틀렸다는 신호였음. 정답은 **wrapper 추가 + 그룹별 flex column + gap**. 레이아웃 1원칙은 "**관련있는 것끼리 묶기**" — 이게 **padding/margin으로 간격 조정보다 선행**해야 함. → ASSEMBLY §2a 전면 재작성, [[feedback-group-first-layout]] 메모리 교체 (기존 differential rhythm 폐기)
- **유령 토큰 `--font-medium` → 모든 타이틀 얇음의 숨은 원인** — 실제 토큰은 `--font-weight-medium`. 레시피들이 전부 `var(--font-medium)` 썼고 **check_tokens hook이 유령 토큰은 못 잡음** (리터럴만 잡음). 조용히 상속된 400으로 렌더되어 h1·h2·cardTitle 전부 얇음. → ASSEMBLY §1 체크리스트 "font-weight 토큰 이름 정확성" 추가, 전수 교체
- **섹션 header의 `margin-bottom`은 틀림** — section 자체를 flex column + gap으로 묶으면 header와 body가 자연스럽게 간격을 가짐. margin-bottom은 그룹 설계 실패의 흔적
- **3-tier 리듬 확립**: 그룹 안 `space-2~3` / 섹션 반복 `space-6` / 그룹 사이 `space-10`. 콘솔 리듬 기준
- **`<section>` 태그 금지의 재확인** — AppShell의 `.content section`이 `padding-top: var(--space-20)` = **80px**을 모든 `<section>`에 꽂음. 메모리 [[feedback-no-semantic-tags-in-components]]가 이미 못 박은 함정인데 레시피 예시가 `<section>`을 그대로 썼음. 전수 `<div>`로 교체 + section-header 레시피 Don't에 명시 + ASSEMBLY §1 체크리스트 추가
- **그룹 안에서도 "미니 그룹" 필요** — introGroup 안 banner↔header↔hint 셋을 `space-3` 하나로 통일했더니 "같은 거리로 뭉쳐" 성격 구분 안 됨. **banner(메타)와 headerBlock(타이틀+설명)**을 분리하는 중간 wrapper(headerBlock) 추가 → introGroup gap을 `space-6`로 벌리고 headerBlock 안은 `space-2` 좁게. 그룹 설계는 **재귀적**이어야 함.
- **3-tier 리듬 수치 상향** — 초기 "섹션 반복 space-6 / 그룹 space-10"은 실측에서 좁았음. "섹션 ↔ 섹션 반복"과 "그룹 ↔ 그룹"은 둘 다 `space-20` (80px) 수준이 자연스러움. space-6은 "섹션 안 블록 단위" 또는 "같은 그룹 안 성격 다른 요소"에만.
- **"가까운 관계일수록 더 좁게" 원칙 확립 (ASSEMBLY §2a 재작성)** — 유저 지적: section header↔body `space-2` + cardList 아이템 간 `space-2`가 **같은 값**이라 "타이틀과 아이템이 같은 레벨"로 뭉쳐 보임. **인접한 두 레벨은 반드시 한 단계 이상 차이**가 나야 위계 성립. 수정: 아이템 간 `space-1`, 섹션 header↔body `space-3`. 같은 원칙으로 headerBlock gap도 `space-2`→`space-3` 상향 (pageHeader 안 title↔description이 `space-1`이므로)
- **"아이콘 + 다줄 muted 텍스트" 자리 → 벤더 `Hint`로 확정** — assembly-test의 inlineHint 수제 조립이 flex align/margin-top 보정으로도 반복 어긋남. 벤더 신설 결정, 이름 `Hint`. Layer 2 스펙은 [[components/hint]], Layer 1 코드는 유저 작성. 안내 자리 3층 구분 확립:
  - 흐름 속 각주 (톤·액션 없음) = Hint
  - 액션 유도 안내 블록 = Callout
  - 페이지 폭 상태 바 = page-banner 레시피
- **벤더 신설이 레시피보다 나은 자리 식별 — 반복 함정 임계점** — 레시피 수정 2회 이상 반복해도 특정 조립 실패가 재발하면 "레시피로 담기 어려운 자리". 벤더로 승격 신호. "line-box 안 아이콘 정렬"처럼 **구현 디테일이 결과를 좌우**하는 자리는 특히.
- **card-row 레시피 폐기 — "리스트 자리는 벤더 필수" 룰 PRINCIPLES에 승격** — 유저 지적: 레시피에서 수제 조립 가이드를 올린 것 자체가 메모리 [[feedback-no-hand-rolled-components]]를 레시피가 어긴 셈. 메모리 수준이 아니라 **PRINCIPLES §5a HARD로 승격**해 "리스트는 무조건 Table/ListItem/EventListItem/MenuItem" 못 박음. "카드처럼 보이는 리스트"가 필요하면 레시피/수제 조립 금지, ListItem 벤더에 새 variant 신설. ASSEMBLY §1 1단계와 체크리스트에도 반영.

이 섹션은 **살아있는 체인지로그** — 새 결함이 나오면 추가하고 레시피를 수정한다.

## 관련

- [[ASSEMBLY]] — 조립 알고리즘. 레시피는 그 3단계에서 참조된다
- [[GUIDE]] — 공통 골격·N/A 규칙. 레시피 파일도 이를 따른다
- [[components/_variants]] — 역할 × variant 매핑. 레시피 내 vendor 선택 시 참조
