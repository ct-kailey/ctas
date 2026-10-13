# Pure

### 원칙
Stripe·Framer·Linear 랜딩이 공유하는 "경계 장치 없이 매끄럽게 흐르는" Theme. border·divider·card·drop shadow 같은 **요소를 가두는 장치**를 걷어내고, 대신 톤 차이·여백·타이포·hairline으로 흐름을 만든다. 요소 수를 줄이는 게 아니라, **요소를 가두지 않는다**. 세련됨은 덜어내서가 아니라 **공들여 매끄럽게 마감**해서 생긴다 — "장치 대신 비례"가 이 Theme의 공식.

### Do
- 콘텐츠는 필요한 만큼 담되, 요소를 **박스·선·그림자로 가두지 않는다**. 사이드바도 테이블도 폼도 "가두는 장치 없이" 구성한다.
- 분리가 필요한 자리는 **톤 차이·여백·hairline** 셋 중 하나로 해결한다. 셋 다 제어가 섬세해야 pure의 세련됨이 나온다.
- 모든 요소를 **공들여 마감**한다 — 간격·정렬·타이포 리듬·톤 대비 전부 과하게 다듬어야 "덜 가두는데도 완성도 있어 보인다".
- 사진 같은 평면성을 노린다. 입체감(그림자·광택·중첩 깊이)이 아니라 **표면의 균질함**으로 세련됨을 만든다.

### Don't
- "허전해 보여서" border·divider·card·drop shadow를 추가하지 않는다. 가두는 장치를 다시 들이는 순간 pure의 좌표가 깨진다.
- card·container를 중첩하지 않는다. frame이 frame을 품는 구조는 pure의 반대 — 정보 그룹은 여백·톤으로 묶는다.
- "덜 가둠"을 "덜 담음"으로 오해하지 않는다. 필요한 콘텐츠·보조 설명·메타 정보는 다 담되, 담는 방식만 바꾼다.
- 거친 마감으로 넘어가지 않는다. 가두는 장치가 없을수록 **정렬·간격·타이포 리듬이 과하게 정교해야** 완성도가 보인다.

### Fallback
축 preset은 아래 표 값으로 고정. override는 자유지만 Negative에 걸린 조합이면 한 번 확인한다.

### 관련
- [[themes/_SCHEMA]] — Theme 스키마
- [[themes/spare]] — 비슷해 보이지만 다른 좌표. spare는 "격자가 뼈대로 드러남", pure는 "격자조차 가두는 장치로 안 씀".
- [[themes/expressive]] — 반대축. expressive는 "콘텐츠가 chrome을 밀어냄", pure는 "chrome 자체가 녹아 사라짐".
- [[axes/palette]] · [[axes/hue]] · [[axes/voice]] — Theme 바깥.

---

### Signature
이 Theme IS **경계 장치 없이 매끄럽게 흐르는** Theme. 미니멀리즘의 "덜 꾸밈"이 아니라, Stripe·Framer·Linear 랜딩이 공유하는 **"장치 대신 비례"** — border·divider·card·drop shadow 같은 **요소를 가두는 장치**를 쓰지 않고, 톤 차이·여백·hairline·타이포 리듬만으로 흐름을 만든다. 세련됨은 **덜어내서**가 아니라 **공들여 매끄럽게 마감해서** 생긴다. 사진 같은 평면성과 과하게 정교한 비례가 지문. 모든 자리(랜딩·앱·테이블·설정)에 쓸 수 있다 — 어느 자리든 "가두지 말고 흐르게 짜라, 그리고 과하게 공들여 마감하라"는 지시로 작동한다.

### Preset

| Axis | Value | Why |
|---|---|---|
| [[axes/mode]] | `light` | Stripe·Framer 랜딩의 "white canvas" 패턴. canvas 자체가 조용해야 가두는 장치 없이도 요소가 떠오름. dark override는 가능하지만 톤 차이로 분리하는 설계가 더 까다로워짐. |
| [[axes/shape]] | `soft` | radius가 있어야 "박스로 가둔 느낌" 없이 요소가 부드럽게 자리잡음. crisp은 모서리 자체가 격자 신호가 되어 pure의 "장치 없음"과 어긋남. |
| [[axes/density]] | `comfortable` | 가두는 장치가 없으므로 각 요소의 호흡 공간이 분리 장치 역할. default는 간격이 좁아 요소끼리 뭉쳐 보이고, 톤·여백만으로 분리가 어려워짐. |
| [[axes/font]] | `lang=ko` | 한국어 기본. 폰트 스택은 Font 축에 양보. |
| [[axes/icon]] | `phosphor` · `regular` | regular weight가 타이포와 톤이 맞음. bold·fill은 아이콘이 따로 떠올라 매끄러운 흐름을 깸. |
| [[axes/motion]] | `calm` | 100ms linear. 조용히 녹아들 듯 등장하는 톤. bouncy는 요소가 튀어나와 pure의 평면성과 충돌. |

### Layout
균질한 호흡으로 흐르는 레이아웃. 1열·그리드·사이드바 전부 쓸 수 있지만, 각 요소를 card·border로 가두지 않는다. 사이드바는 배경 톤 교대 또는 hairline으로, 그리드 셀은 여백으로, 섹션은 상하 호흡으로 분리한다. 간격·정렬이 과하게 정교해야 "가두지 않았는데도 구조가 보인다".

**조립 규범 — 자리별 default 컴포넌트:**
- 리스트 자리(피드·활동·알림·오늘 할 일·일정·팀 상태 등) → **[[components/list-item]]** 로 통일. 사람·시간·대상·메타의 anatomy가 공유되고, pure 좌표에선 hairline 분리로 리스트를 만든다. 수제 `<div>` 리스트 금지 — anatomy가 리스트마다 어긋나 pure의 "과하게 공들여 마감"이 깨진다.
- 숫자 정렬·금액·대기일 등 **셀 폭·정렬·tabular-nums가 중요한 자리** → **[[components/table-header]] + [[components/table-row]]** 조합. variant는 `line`(pure default) — hairline 하나로 분리. plate(라운드 chrome)는 pure 좌표 바깥.
- 지표 strip(KPI 4개 등) → **[[components/metric-card]]** `variant="bare"` + 부모 strip이 상단 hairline + 수직 hairline으로 분리.
- 어느 자리든 "수제 조립 vs 컴포넌트 조립"이 애매하면 **컴포넌트 조립** 쪽. 그래야 자리마다 간격·정렬·톤이 어긋나지 않는다.

**리스트 조립 — hairline + wrapper 공식:**
hairline 리스트에서 콘텐츠가 선에 **딱 붙는 건 pure 좌표에서 치명적**이다 (Negative 참고). 부모 li가 세로 padding을 반드시 책임지고, self-space 공식을 가진 컴포넌트(ListItem 등)는 자식 선택자로 중화한다. 공식 상세는 [[components/list-item]] "조립 — 부모 wrapper 공식".

### Imagery
이미지는 캔버스에 **매끄럽게 녹아들도록** 배치한다. 거친 crop·강한 그림자·테두리로 가두지 않고, 자연스러운 여백 안에 놓거나 배경 톤에 섞는다. 사진·일러스트·gradient 전부 쓸 수 있지만 "가두는 frame" 없이 — Framer의 포스터 패턴, Stripe의 mesh gradient 패턴처럼 **경계가 흐려지는** 방식.

### Decoration
border·divider·card·drop shadow는 거의 쓰지 않는다 — 이것들이 "가두는 장치". 대신 **톤 차이·여백·hairline·gradient·배경 색면**은 자유롭게, 그러나 과하게 공들여 쓴다. hairline 한 줄도 색·굵기·위치가 섬세해야 pure의 세련됨이 나온다. 입체감(강한 shadow·광택·중첩 깊이) 대신 **표면의 균질함**과 **섬세한 톤 레이어링**으로 완성도를 만든다.

### Negative
- no card nesting·border nesting (앱 UI의 default — frame이 frame을 품지 않음)
- no drop shadow for elevation (SaaS card의 default — 그림자로 띄우지 않고 톤·여백으로 분리)
- no divider line between list items (설정·메뉴의 default — 리스트는 여백·톤으로 분리)
- no bordered input·bordered button as default (폼의 default — 입력·버튼은 톤 차이·배경 색면으로 성립)
- no gradient background **반복** (AI·fintech 랜딩의 default — gradient는 자유지만 섹션마다 깔지 않음, 과잉은 매끄러움을 깸)
- no sloppy spacing·misaligned baseline (pure의 치명적 default — 가두는 장치가 없으므로 거친 마감은 바로 "대충 비워둔 느낌"으로 보임)
- no content touching hairline·border·cell edge (pure의 치명적 default — 텍스트·Avatar·Icon이 선/테두리에 padding 없이 붙으면 "덜 가둠"이 아니라 "대충 비움"으로 추락. 모든 리스트 아이템·카드 셀·테이블 셀에서 완성 후 눈으로 체크)
- no mono in body (technical voice는 pure 자리가 아님)

### Override
전부 자유. 사용자가 "이 Theme에서 mode만 dark로"(Framer 패턴) 또는 "shape만 crisp로"(Stripe 편집 톤)처럼 지시하면 그대로 적용. 책임은 사용자.
Theme 선언을 벗어난 조합의 완성도는 보증하지 않는다 ([[PRINCIPLES]] §7).

### Known Gaps
- Voice는 Theme 바깥 축이라 이 Theme이 추천하지 않는다. editorial 톤이든 포스터 톤이든 어떤 Voice와도 결합 가능 ([[axes/voice]] 참고).
- 타이포 리듬의 수치(weight·tracking·size·line-height)는 Font 축이 담는다. 이 Theme은 "타이포 리듬이 과하게 정교해야 한다"는 태도만 담음.
- 톤 차이·hairline·gradient의 색·채도는 Palette/Hue가 담는다. 이 Theme은 "가두는 장치 대신 톤을 쓴다"는 원칙만.
- 호흡·여백의 수치는 Density 축이 담는다. 이 Theme은 "균질한 호흡"이라는 선호만.

### Iteration Guide
1. 축 preset을 바꿀 때 반드시 "왜" 1문장을 새로 쓴다. 기존 Why를 그대로 둔 채 Value만 바꾸지 않는다.
2. Negative에서 "no X"를 추가·삭제할 때는 "X가 어떤 카테고리의 default인지"를 괄호로 명시한다. 좌표 없는 금지는 금지가 아니다.
3. Layout·Imagery·Decoration 어느 섹션에도 수치를 넣지 않는다. "균질한 호흡" OK, "160px 간격" 금지.
4. Signature를 수정할 때 "IS ___" 공식과 비교 수사(not X, but Y)를 유지한다.
5. 이 Theme에 Palette·Hue를 선언하지 않는다. 색은 조합 시점에만 결정.
6. "덜 가둠 ≠ 덜 담음"을 Do·Don't·Decoration·Negative 네 섹션에서 반복적으로 강화한다. 한 곳이라도 "요소를 줄여라" 톤이 섞이면 pure가 다시 "대충 비운 느낌"으로 흐른다.
