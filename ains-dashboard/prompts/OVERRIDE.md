# 컴포넌트 Override 체크리스트

CTDS 공통 컴포넌트(`web/components/<Name>/`)를 로컬에서 override·확장할 때 쓰는 문서.
템플릿·페이지·앱 조립에서 "작은 수정인데 왜 안 먹지?"가 반복되는 걸 막는다.

이 문서의 모든 규칙은 **override 전**에 통과해야 한다. 추측으로 CSS를 던지지 말고 체인을 먼저 특정한다.

---

## 0. 왜 이 문서가 필요한가

CTDS 공통 컴포넌트는 **여러 가정**을 깔고 설계돼 있다. 예:

- Sidebar `.profile`은 Sidebar Root의 `padding-inline: var(--space-4)`를 **음수 margin으로 상쇄**해서 hover 영역을 사이드바 끝까지 늘린다.
- MenuItem `.root`는 `position: relative`를 active일 때만 걸고, active bar를 `::before`로 그린다.
- Sidebar.Body는 `mask-image`로 상단 fade + `overflow-x: hidden`으로 음수 margin 삐져나감을 clip한다.

이 가정들을 **모르고** 로컬에서 Root padding을 0으로 바꾸거나 `width: 100%`만 추가하면:

- Profile이 사이드바 바깥으로 삐져나가 오른쪽이 잘림
- active bar가 전혀 안 보임
- Body에 추가한 콘텐츠가 mask에 가려 사라짐

이런 사고가 **매번 반복된다**. 아래 체크리스트가 그걸 끊는다.

---

## 1. Override 전 선행 체크 (하드룰)

### 1-1. 공통 컴포넌트의 현재 CSS를 **파일로 읽어라**

머리에 저장된 "원래 그랬던 모습"으로 override 금지. 세션 중에 사용자/린터가 수정했을 수 있다.

- 수정할 대상 컴포넌트 `<Name>.module.css`를 **Read 툴로 열어 현재 선언 전부 확인**
- 특히 **다음 속성들**이 걸려있는지 반드시 체크:
  - `position` (`absolute`·`sticky`의 containing block 결정)
  - `margin-inline` 음수 값 (상위 padding 상쇄 패턴)
  - `padding-inline`
  - `width`·`max-width`
  - `overflow-x`·`overflow-y` (음수 margin / `::before` clip 여부)
  - `mask-image` (콘텐츠 가림 여부)
  - `border-radius` (full-bleed와 충돌)

### 1-2. 사용자가 DOM·computed style·스크린샷을 주면 **범인 후보부터 특정하라**

```
사용자가 computed style 붙여줌 → 눈으로 훑고 "Footer padding 때문이겠지" 추측 금지
→ computed style 안의 모든 선언을 범인 후보로 올림
→ 하나씩 소거해서 진짜 범인 찾음 → 그제서야 수정
```

이번 세션 실제 사례:
- 사용자가 Profile computed style을 붙여줌 → `margin-inline: calc(var(--space-4) * -1)` 적혀있음
- 그걸 못 보고 Footer padding을 넣었다 뺐다 반복
- 결국 사용자가 "원복해"를 세 번 외친 뒤에야 원인 특정

### 1-3. 요청의 **타겟 요소**를 상상으로 치환하지 마라

"좌우 여백 없애" → 어느 요소의? 어느 축의?
사용자가 DOM을 가리키면 **그 DOM을 그대로** 수정 대상으로 삼는다.

- ❌ 사용자: `<div class="profile">` 가리키며 "여백 없애"
  AI: Footer padding을 뺌 (엉뚱한 요소)
- ✅ 같은 요청
  AI: `.profile`의 `margin-inline` 음수값을 확인하고 그걸 상쇄

---

## 2. 자주 틀리는 패턴 레시피

### Case A. Hover 영역이 작아 보임 / 오른쪽만 잘려 보임

증상: 아바타+텍스트까지만 hover 배경이 깔리고 사이드바 가장자리 빈 공간엔 반응 없음.

범인 후보 (우선순위):
1. **`.profile`의 `margin-inline` 음수값**이 상위 Root padding과 짝지어 있는데, **상위 padding을 0으로 바꿔** 음수 margin만 남아 overflow 발생 → `overflow-x: hidden`이 그걸 clip
2. `width: auto`로 자식 크기만큼만 늘어남 → `width: 100%` 필요
3. `border-radius`가 있어서 양쪽 끝이 둥글어 "안 꽉 찬" 느낌

처방:
```css
/* 상위 Root padding을 0으로 바꿨다면 음수 margin도 함께 0으로 */
.profile {
  margin-inline: 0;
  width: 100%;
  /* 필요하면 자체 padding으로 내부 들여쓰기 */
  padding-inline: var(--space-4);
  border-radius: 0; /* full-bleed일 땐 각지게 */
}
```

### Case B. Full-bleed가 안 됨 (음수 margin으로 뚫어도)

증상: `.item`에 `margin-inline: -16px`를 걸었는데 사이드바 가장자리까지 안 가고 중간에 잘림.

범인 후보:
1. 상위 **스크롤 컨테이너의 `overflow-x: hidden`** — 음수 margin이 그 경계에서 clip
2. 상위에 걸린 **`mask-image`** — 가장자리 콘텐츠가 fade로 사라짐
3. 상위의 **`padding-inline`이 음수 margin보다 작음** — 음수가 모자람

처방: full-bleed가 필요한 섹션(Divider·Profile·메뉴 리스트)은 **스크롤 컨테이너 밖**(Header/Footer)으로 뺀다. 못 빼면 **상위의 padding을 로컬 override로 0으로 두고** 자식에 자체 padding을 넣는다.

### Case C. Active 스타일이 안 먹음

증상: `active activeStyle="accent-bar"`를 넘겼는데 좌측 bar가 안 나오고 hover 배경(fill)만 보임.

범인 후보:
1. **wrapper 컴포넌트(`Sidebar.Item`, `Menu.Item` 등)가 `activeStyle` prop을 통과시키지 않음** → MenuItem까지 전달 안 됨
2. CSS 변수 `--menu-active-fg`가 **투명 색**으로 떨어져 bar는 그려졌지만 안 보임
3. `::before` containing block의 `position: relative`가 사라져 bar가 엉뚱한 좌표에 그려짐

처방: wrapper를 거치지 말고 **MenuItem을 직접 사용**하거나, wrapper에 `activeStyle` 전달 로직을 추가. 색은 `.nav { --menu-active-fg: var(--primary); }`로 명시.

### Case D. Body에 넣은 콘텐츠(Header 역할)가 스크롤에 묻힘

증상: Sidebar.Body에 Profile/divider를 넣었더니 메뉴 스크롤 따라 올라가 사라짐.

범인 후보: Sidebar.Body는 **스크롤 영역**이다. 거기 넣은 콘텐츠는 당연히 스크롤됨.

처방: 고정이 필요한 섹션(Brand/Profile/divider 모두)은 **Sidebar.Header 안에 몰아넣고** flex column으로 세로 스택. Body엔 스크롤될 메뉴만.

### Case E. Mask에 콘텐츠 첫/마지막 아이템이 잘림

증상: Body 상단 `mask-image: linear-gradient(transparent 0, black --space-3, ...)` 때문에 첫 메뉴 아이템 윗부분이 fade로 반쯤 가려짐.

처방: Body에 **mask 투명 구간과 같은 양의 padding**(`padding-top: var(--space-3)`)을 넣어 콘텐츠를 fade 구간 아래로 밀어낸다. mask 자체는 유지 — 스크롤 시 fade 효과는 그대로.

### Case F. 사이즈 override했는데 과하게 커짐

증상: "메뉴 아이템 세로 좀 늘려" → `min-height: calc(--control-h-lg + --space-3)` → 너무 큼.

처방: 공통 컴포넌트의 **원래 size별 값**을 먼저 확인. CTDS는 size 토큰(`sm`/`md`/`lg`)이 이미 있고 각각 `--menu-item-h-*`를 쓴다. 원래 값 + 작은 증분(`--space-1` 수준)으로 시작, 사용자 반응 보고 조정.

### Case G. 왕복 수정 (넣었다 뺐다 반복)

증상: Footer padding을 넣고 → 사용자 "오른쪽 잘림" → 뺐다 → 사용자 "안 됨" → 넣었다 …

처방: **왕복하기 전에 체인을 끝까지 추적**. 같은 요소에서 2번 왕복이면 멈추고, 1-1·1-2를 다시 수행. 어디가 범인인지 특정될 때까지 CSS 수정 금지.

---

## 3. 사용자가 "원복"을 요청하면

- 어떤 변경을 원복할지 **범위를 먼저 복창**하고 확인받는다 (한 줄? 섹션? 전체?)
- 원복 범위를 또 잘못 잡으면 사용자 분노 2배

---

## 4. 사용자가 "건들지 마"라고 명시한 영역

- 디자인·사이즈·텍스트·아이콘 등 **명시적으로 유지하라고 한 것**은 다른 수정의 사이드이펙트로도 바꾸지 않는다
- "메뉴만 늘려"에 아이콘·텍스트를 임의로 바꾸는 식의 넘겨짚기 금지

---

## 5. 디버깅 플로우 (요약)

```
증상 접수
  ↓
공통 컴포넌트 .module.css Read  ← 1-1
  ↓
사용자가 준 DOM/computed style 전부 훑기  ← 1-2
  ↓
범인 후보 리스트업 (position, margin-inline, overflow, mask, radius, width)
  ↓
한 번에 한 줄만 수정, 사용자 확인
  ↓
안 되면 1-1로 돌아가서 다른 범인 특정  ← 왕복 금지, 체인 재추적
```
