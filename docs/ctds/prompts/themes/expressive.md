# Expressive

### 원칙
Apple Reminders·Linear Mobile·Things·Notion Calendar가 공유하는 "**중립 바탕 + 소수의 accent 자리 + hue 안에서 묶은 2-톤**" Theme. 통통 튀는 느낌은 pastel을 "많이 깔아서"가 아니라, **대부분 중립인 캔버스 위에 꼭 필요한 2~3자리에만 pastel field가 찍히고, 그 pastel 안에 같은 hue의 진한 ink가 포인트로 눌러주는** 구조에서 온다. 색은 **의미 있는 자리에만** 쓰여야 "강조"가 되고, pastel과 ink가 **같은 hue**로 묶여야 "조화"가 된다. 리마인더·태스크·커뮤니티·모바일 생산성 앱의 자리.

### Do
- 전체 캔버스·대부분의 카드/필드는 **중립**으로 둔다 (`--bg` 또는 `--bg-subtle`). pastel은 자동 default가 아니다.
- 캔버스 중립은 **가능한 가장 옅은 톤**(흰색 또는 `--bg-subtle`)으로. "회색이 섞인" 바탕은 그 자체로 배경 색이 되어 accent의 자리를 뺏는다 — 바탕이 조용해야 pastel 포인트가 돋보임.
- accent 자리는 "지금 가장 중요한 하나"에만 — 가장 급한 KPI 하나, 선택된 카드 하나, 플로팅 CTA 하나. 한 화면에 **총 2~3개**.
- ink point(원형 배지·pill·강조 라벨)는 **tint의 짝 fg**를 쓴다. pink field엔 wine ink, blue field엔 deep-blue ink. **블랙 ink 금지**.
- ink badge를 중립 자리에도 넣으려면 **ghost 모드**(배경 투명, 아이콘만 `--fg-muted`)로. solid wine은 accent 자리에만.
- 소문자 bold 제목 + 소문자 regular 본문의 weight 대비는 유지한다 — "통통 튀는데 정돈된"의 축.

### Don't
- 모든 카드/섹션을 pastel로 깔지 않는다. 전부 색이면 무지개가 되고 "강조" 축이 사라진다. **중립이 바탕, pastel은 포인트**.
- 캔버스·중립 카드 배경에 **진한 중성톤**(짙은 회색, `--bg-muted`보다 어두운 톤)을 쓰지 않는다. 바탕이 "색"으로 지각되는 순간 accent pastel이 묻힌다. 중립은 **거의 흰색**이어야 한다.
- pastel field 위에 **블랙/다크그레이 ink**를 올리지 않는다 — 두 hue가 어긋나서 "회색 + 핑크" 같은 추한 조합으로 떨어진다. ink는 **같은 hue의 진한 명도**여야 한다.
- 모든 카드마다 ink 원형 배지를 똑같이 박지 않는다. 배지 자체가 과한 신호 — 중립 자리는 ghost 또는 생략, accent 자리에만 solid.
- "통통 튀게" 하려고 큰 글자를 남발하지 않는다. **한 화면의 "가장 큰 글자"는 하나** — hero head 하나, 또는 KPI value 하나. 나머지는 조용해야 그 하나가 묵직해진다.
- `tracking-tight`·`tracking-wide` 같은 트래킹을 모든 타이포에 바르지 않는다. 큰 묵직한 자리(hero head, 큰 숫자)에만 `tracking-tight`. 나머지는 default.
- 데이터 테이블·엔터프라이즈 설정·금융 거래 화면에는 쓰지 않는다. 이 Theme의 "경쾌함"이 신뢰를 깎는 자리.

### Fallback
축 preset은 아래 표 값으로 고정. override는 자유지만 Negative에 걸린 조합이면 한 번 확인한다.
pastel을 어디에 쓸지 고민되면 **중립이 default**. "지금 이 카드가 가장 중요한가?"라는 질문에 Yes가 아니면 중립.

### 관련
- [[themes/_SCHEMA]] — Theme 스키마
- [[themes/spare]] — 반대축. spare는 "격자 안에서만 움직임", expressive는 "격자 위에 소수 accent 자리".
- [[themes/pure]] — 다른 축. pure는 "가두는 장치 없이 흐름", expressive는 "중립 바탕 + accent 자리".
- [[components/topbar]] — hero head·환영 메시지를 Topbar에 끼우지 않는 공식. expressive의 hero는 body 첫 블록.
- [[components/sidebar]] · [[components/app-frame]] — Sidebar top padding = Topbar top padding으로 좌·우 상단 baseline 정렬.
- [[axes/palette]] `pastel` · [[axes/shape]] `soft` · [[axes/motion]] `bouncy` — 이 Theme의 세 토대 축. 조합이 깨지면 Theme의 지문도 깨진다.

---

### Signature
이 Theme IS **중립 바탕에 소수의 accent field + 같은 hue의 ink로 묶는** Theme. Notion Calendar·Apple Reminders가 공유하는 "chrome 자체의 리듬" 공식의 한 분파이되, 그 리듬이 **"모든 카드가 pastel"이 아니라 "거의 다 중립인데 1~2자리만 pastel"**로 작동한다는 좌표. 통통 튀면서도 유치하지 않은 이유는 — **중립이 대부분을 받치고, pastel이 "강조" 자리에만 등장하고, pastel 안의 ink는 같은 hue의 진한 명도로 조화되고, 소문자 bold 제목이 두 톤을 묶기** 때문. 색은 **의미**로 쓰이고, 큰 글자는 **하나**이고, 리듬은 **절제**로 만들어진다.

### Preset

| Axis | Value | Why |
|---|---|---|
| [[axes/mode]] | `light` | 중립 캔버스 + pastel accent + 짙은 ink 대비가 성립하려면 밝은 canvas가 전제. dark에선 중립=딥 중성, pastel→딥 틴티드로 재해석되지만 기본은 light. |
| [[axes/shape]] | `soft` | 큰 radius·원형 아이콘 배지·pill 버튼이 이 Theme의 "통통 튀는" 촉감 세트. crisp는 격자 신호가 되어 pastel accent의 "분위기 깔림"이 안 나옴. |
| [[axes/density]] | `default` | 중립 카드가 숨 쉴 공간은 필요하되, comfortable은 모바일/생산성 앱의 밀도를 깨고 compact은 카드가 서로 뭉개짐. 중앙값이 맞음. |
| [[axes/font]] | `lang=ko` | 한국어 기본. 폰트 스택은 Font 축에 양보. 다만 "소문자 bold 제목"은 Theme 지문이라 Font 축과 무관하게 강제. |
| [[axes/icon]] | `phosphor` · `regular` | 기본 regular, 활성·선택만 `fill`. ink 원형 배지 안에서 아이콘은 반전되어 조용히 받친다. |
| [[axes/motion]] | `bouncy` | spring easing + 400ms. accent field가 등장하고 ink가 눌러주는 리듬과 짝. standard는 밋밋하고 calm은 "통통"을 죽인다. |

### Layout
중립이 대부분을 받치고, pastel이 "가장 중요한 자리"에만 찍히는 레이아웃. 2열 카드 그리드·수직 스크롤 섹션·칸반 보드가 자연스러운 자리. **섹션 head**는 body의 첫 블록에서 큰 소문자로 한 번만 — hero head를 Topbar에 끼우지 않는다 (hero를 끼우려는 순간 `align-items: flex-start` 수습이 필요해지는 신호, [[components/topbar]] 참고).

**여백 위계 — 4단계 리듬:**
- **섹션↔섹션** (큼): 가장 넉넉하게. 섹션끼리 "다른 블록"으로 보이게.
- **섹션 head ↔ 콘텐츠** (중): head가 콘텐츠에 "속해있다"고 느껴지는 거리.
- **카드끼리** (작): 그리드 간격. 숨은 쉬지만 "같은 블록"으로.
- **카드 안 요소** (아주 작): label↔value, badge↔body. 요소끼리 "같은 정보"로 묶임.

flat한 간격(섹션·카드·내부 전부 같은 수치)이면 Theme이 지루해진다. 네 단계가 눈에 보여야 "읽히는 리듬".

**상단 baseline 정렬:**
Sidebar top padding = Topbar top padding으로 맞춘다 ([[components/app-frame]] 조립 공식). 좌·우 상단이 한 줄에 서야 shell이 깔끔.

### Imagery
사진·앨범 아트가 **없어도 성립하는** Theme. accent field 자체가 "이미지 자리"를 대신하고, ink 원형 배지가 포인트가 된다. 실제 이미지가 들어올 때는 **아바타(원형)·썸네일(소형 중립 카드)** 형태로 chrome 리듬에 녹인다 — 전면 hero 이미지는 이 Theme의 자리가 아님.

### Decoration
- **Neutral base**: 캔버스·대부분의 카드/필드는 중립 (`--bg` 또는 `--bg-subtle`). pastel이 default가 아님. **중립은 "거의 흰색"에서 멈춤** — 짙은 회색 바탕은 그 자체가 색이 되어 accent를 묻히게 함.
- **Accent field**: 지금 가장 중요한 1~3자리에만 pastel 면 — 가장 급한 KPI, 선택된 카드, 플로팅 CTA. hairline 생략 (색 자체가 분리).
- **Hue-matched ink**: pastel field 안의 ink는 **같은 hue의 진한 명도** (pink → wine, blue → deep-navy). 블랙 ink 절대 금지.
- **Ink badge (2단계)**:
  - 중립 자리: **ghost** — 배경 투명, 아이콘만 `--fg-muted`. 또는 아예 생략.
  - accent 자리: **solid** — pastel 위에 같은 hue 진한 명도의 원형 배지. 이 자리의 포인트.
- **Lowercase + weight 대비**: 제목은 소문자 bold/semibold, 본문은 소문자 regular. 두 weight의 대비가 색 대비와 짝.
- **큰 글자 한 자리**: 한 화면의 "가장 큰 글자"는 하나 — hero head 또는 그 섹션의 중심 KPI value. 나머지는 조용해야 그 하나가 묵직.
- mesh gradient·노이즈·장식 라인·배경 패턴 쓰지 않는다. 리듬은 중립/accent · ink · 소문자 · 여백 위계 네 축으로만.

### Negative
- no photo-first hero (Airbnb·Spotify 공식의 default — 이 Theme은 콘텐츠 없이도 chrome이 성격을 만듦)
- no all-pastel surface (키즈·게임 UI의 default — 모든 카드가 pastel이면 무지개가 되어 "강조" 축이 사라짐. 중립이 바탕, pastel은 포인트)
- no heavy neutral background (SaaS 대시보드의 default — 짙은 회색 캔버스/카드 바탕은 그 자체가 "색"으로 지각되어 accent pastel을 묻힘. 중립은 `--bg` 또는 `--bg-subtle`에서 멈춤)
- no black ink on pastel field (잘못된 2-톤 default — pastel + 블랙/다크그레이는 hue가 어긋나서 추해짐. ink는 같은 hue 진한 명도)
- no high-saturation tint (키즈·게임 UI의 default — tint는 반드시 pastel 라인에서만)
- no ink badge on every card (장식 과잉의 default — 모든 카드에 solid 배지를 박으면 포인트가 소음이 됨. 중립 자리는 ghost 또는 생략)
- no multiple accent fields side-by-side without reason (화면 전체가 accent로 가득 차는 default — accent는 한 화면에 2~3곳이 상한)
- no oversized typography everywhere (브랜드 랜딩의 default — 모든 title을 크게 하면 "가장 중요한 하나"가 사라짐. 큰 글자는 한 화면에 하나)
- no tracking-tight on every heading (타이포 과장의 default — tracking은 묵직한 자리 1~2곳만. 나머지는 default)
- no hero head inside Topbar ([[components/topbar]] 위반 default — hero는 body 첫 블록. Topbar에 끼우면 `align-items` 전쟁)
- no sidebar/topbar baseline mismatch ([[components/app-frame]] 위반 default — Sidebar top padding = Topbar top padding)
- no deep elevation shadow (skeuomorphism의 default — pastel field 자체가 색으로 분리하므로 shadow 불필요)
- no card nesting (앱 UI의 default — accent 카드가 중립 카드를 품지 않음)
- no uppercase titles (브랜드 랜딩의 default — 제목까지 소문자 bold가 이 Theme의 지문. UPPERCASE + wide tracking은 "정돈된" 좌표를 "격식 있는" 좌표로 끌어내려서 Theme이 깨짐)

### Override
전부 자유. 사용자가 "이 Theme에서 mode만 dark로" 또는 "palette만 standard로"처럼 지시하면 그대로 적용. 책임은 사용자. 다만 `shape≠soft` · `motion≠bouncy` · `palette≠pastel` 셋 중 하나라도 어기면 이 Theme의 지문(중립 바탕 + accent 포인트 + hue 조화) 중 하나가 깨짐 — 그때는 [[themes/spare]] 또는 [[themes/pure]]로 좌표를 옮기는 쪽이 솔직하다.
Theme 선언을 벗어난 조합의 완성도는 보증하지 않는다 ([[PRINCIPLES]] §7).

### Known Gaps
- Voice는 Theme 바깥 축이라 이 Theme이 추천하지 않는다. 캐주얼 톤이든 포멀 톤이든 어떤 Voice와도 결합 가능 ([[axes/voice]] 참고).
- "pastel 패밀리"의 구체적 hue 세트(lavender/mint/peach/sky/sand 등)는 Palette·Hue 축이 담는다. 이 Theme은 "같은 명도 라인에 묶인 pastel + 짝 fg를 ink로 쓴다"는 전략만.
- 어느 hue를 accent로 쓸지(pink/blue/mint 등)는 조합 시점에 결정. 이 Theme은 "accent는 하나로 통일, ink는 그 hue의 짝 fg"라는 공식만.
- 소문자 bold의 weight·tracking·size는 Font 축이 담는다. 이 Theme은 "큰 글자는 한 자리, 트래킹은 묵직한 자리만, 소문자 + weight 대비"라는 태도만.
- 여백 위계의 구체적 수치는 Spacing·Density 축이 담는다. 이 Theme은 "4단계 리듬이 눈에 보여야 한다"는 원칙만.
- 모션의 spring 수치·bounce 양은 Motion 축이 담는다. 이 Theme은 `bouncy` preset 선택만.

### Iteration Guide
1. 축 preset을 바꿀 때 반드시 "왜" 1문장을 새로 쓴다. 기존 Why를 그대로 둔 채 Value만 바꾸지 않는다.
2. Negative에서 "no X"를 추가·삭제할 때는 "X가 어떤 카테고리의 default인지"를 괄호로 명시한다. 좌표 없는 금지는 금지가 아니다.
3. Layout·Imagery·Decoration 어느 섹션에도 수치를 넣지 않는다. "중립이 대부분, pastel은 소수" OK, "pastel 면 20%" 금지.
4. Signature를 수정할 때 "IS ___" 공식과 비교 수사(not X, but Y)를 유지한다.
5. 이 Theme에 Palette·Hue를 선언하지 않는다. 색은 조합 시점에만 결정. 단, "중립 바탕 + 단일 hue accent + 같은 hue 짝 ink"라는 전략은 Palette와 무관하게 Theme 안에 남는다.
6. 중립/accent · ink · 소문자 · 여백 위계 네 지문 중 어느 하나라도 Decoration·Negative 두 섹션에서 반복 강화되지 않으면 Theme이 맹탕이 된다. 네 지문의 일관성을 Iteration마다 재확인한다.
7. 성격 어휘(playful / cute / radical)를 더 바르지 않는다. 이 Theme의 성격은 "절제된 대비 리듬" — "귀여움"으로 해석되면 좌표가 깨진 신호.
8. "통통 튄다"의 반대는 "정돈된다"가 아니라 "유치해진다". 이 Theme은 통통 튀면서 **정돈된다** — 중립 바탕·소수 accent·hue 조화·큰 글자 하나가 "정돈" 쪽을 책임지므로, 하나라도 빠지면 유치 쪽으로 추락.
9. "accent를 어디에 쓸까"가 고민되면 **그 자리가 유저에게 지금 가장 중요한가?**를 묻는다. Yes 하나만 pastel, 나머지는 전부 중립. 색은 **의미**로 쓰여야 지문이 된다.
10. "큰 글자를 어디에 쓸까"도 같은 공식. 한 화면의 "가장 큰 글자"는 하나. 모든 title이 크면 지문이 아니라 소음.
11. "배경 색을 어디까지 줄까"가 고민되면 **더 옅은 쪽**. 캔버스·중립 카드가 "색"으로 보이기 시작하는 순간 accent의 자리가 사라진다. 중립은 흰색에 가까워야 pastel 포인트가 산다.
