# Spare

### 원칙
Vercel / Supabase / Raycast / Linear가 공유하는 "엔지니어드된 자제"를 뼈대로 삼는 Theme. "꾸미지 않음"이 디폴트가 아니라 **"규칙 격자를 먼저 정하고 그 안에서만 움직임"**이 디폴트다. 앱·대시보드·설정·문서·커맨드 UI 등 "매일 쓰는 도구" 전반의 기준이 된다.

### Do
- UI chrome은 전부 축 값 그대로 상속한다. 특정 섹션만 다른 Shape/Motion으로 튀게 하지 않는다.
- Palette/Hue만 바꾸면 브랜드별 변주가 자연스럽게 성립해야 한다 — 뼈대는 색에 의존하지 않는다.
- accent는 한 페이지에 한 지점에서만 터뜨린다 (primary CTA 또는 상태 이벤트 하나).

### Don't
- 전환형 랜딩·게임·엔터테인먼트의 자리에 억지로 쓰지 않는다. 자극·대비·그라디언트가 없어 전환이 안 터진다.
- 성격을 색·장식으로 보강하려 들지 않는다. 성격이 더 필요하면 Theme 자체를 바꾼다.
- "비어 보여서" 요소를 추가하지 않는다. 비어 보이는 게 이 Theme의 피드백이다.

### Fallback
축 preset은 아래 표 값으로 고정. override는 자유지만 Negative에 걸린 조합이면 한 번 확인한다.

### 관련
- [[themes/_SCHEMA]] — Theme 스키마
- [[axes/palette]] · [[axes/hue]] — Theme 바깥. 어떤 색이든 이 뼈대 위에 올라감.

---

### Signature
이 Theme IS "격자부터 정한 뒤 그 격자 안에서만 움직이는" UI. 미니멀리즘의 수동적 비움이 아니라, Vercel·Supabase·Raycast·Linear가 공유하는 **엔지니어드된 자제** — 왜냐하면 매일 쓰는 도구는 "무엇을 넣느냐"가 아니라 "무엇을 들이지 않느냐"로 신뢰를 번다.

### Preset

| Axis | Value | Why |
|---|---|---|
| [[axes/mode]] | `light` | 제품 UI 기본. dark override는 열려 있고, 이 Theme의 뼈대는 두 mode 모두에서 동일하게 성립. |
| [[axes/shape]] | `standard` | 콘솔 톤을 유지하되 crisp처럼 날카롭지 않은 중립 모서리. soft는 캐주얼, crisp는 과하게 engineered. |
| [[axes/density]] | `default` | compact은 데이터 테이블·관리자 전용, comfortable은 터치·콘텐츠. 매일 쓰는 도구의 중앙값. |
| [[axes/font]] | `lang=ko` | 한국어 기본. 실제 폰트 스택은 Font 축이 담당. |
| [[axes/icon]] | `phosphor` · `regular` | 얇은 outline이 UI 호흡을 끊지 않음. 활성 상태만 `fill`로 전환. |
| [[axes/motion]] | `calm` | 100ms linear. 반복 사용 시 bouncy는 피곤. 피드백은 있되 과장 없음. |

### Layout
특별한 선호 없음. 1열·2열·그리드 전부 성립. 사이드바·상단 네비·멀티 컬럼 모두 이 Theme에 맞음 — Theme이 레이아웃을 강요하지 않는 게 디폴트의 성격. 섹션 간 호흡은 Density에 양보.

### Imagery
UI 안에 사진·3D·일러스트가 **반드시 들어와야 할 자리에만** 쓴다. 장식용 이미지는 쓰지 않는다. 이 Theme의 자연스러운 "이미지"는 제품 스크린샷·다이어그램·코드블록 — Raycast·Supabase의 공통 패턴.

### Decoration
없음. mesh gradient·노이즈·장식 라인·배경 패턴 전부 쓰지 않는다. elevation은 **표면 색의 사다리**(canvas → surface → surface-elevated)와 hairline border로만 만든다 — 그림자로 띄우지 않는다.

### Negative
- no heavy display weight (브랜드 랜딩의 default — display weight는 500~600에서 멈춘다)
- no uppercase + wide tracking (브랜드 랜딩의 default — sentence case 강제)
- no mono in body (technical voice는 caption·code 자리에만, body에 섞지 않는다)
- no gradient background (AI·fintech 랜딩의 default)
- no hero illustration·3D object (SaaS 홈의 default)
- no decorative shadow·glow (게임·엔터 UI의 default — elevation은 표면 사다리만)
- no multi-accent — 한 페이지에 accent voltage는 한 지점에서만

### Override
전부 자유. 사용자가 "이 Theme에서 Shape만 soft로" 또는 "mode만 dark로"처럼 지시하면 그대로 적용. 책임은 사용자.
Theme 선언을 벗어난 조합의 완성도는 보증하지 않는다 ([[PRINCIPLES]] §7).

### Known Gaps
- Voice는 Theme 바깥 축이라 이 Theme이 추천하지 않는다. engineered 톤이든 캐주얼 톤이든 어떤 Voice와도 결합 가능 ([[axes/voice]] 참고).
- 신택스 하이라이트·차트·데이터 비주얼의 팔레트는 Palette 축이 담는다.
- "weight 상한 500~600" 같은 타이포 규칙은 Negative 선언으로만 남고, 수치 레벨 강제는 Font 축에 양보한다.
- 표면 색 사다리의 단계 수·명도 간격은 Palette 축이 담는다. 이 Theme은 "사다리로 depth를 만든다"는 규칙만 담음.

### Iteration Guide
1. 축 preset을 바꿀 때 반드시 "왜" 1문장을 새로 쓴다. 기존 Why를 그대로 둔 채 Value만 바꾸지 않는다.
2. Negative에서 "no X"를 추가·삭제할 때는 "X가 어떤 카테고리의 default인지"를 괄호로 명시한다. 좌표 없는 금지는 금지가 아니다.
3. Layout·Imagery·Decoration 어느 섹션에도 수치를 넣지 않는다. "넉넉한 호흡" OK, "80px 간격" 금지.
4. Signature를 수정할 때 "IS ___" 공식과 비교 수사(not X, but Y)를 유지한다.
5. 이 Theme에 Palette·Hue를 선언하지 않는다. 색은 조합 시점에만 결정.
6. 성격 어휘(editorial / playful / radical)를 더 바르지 않는다. 이 Theme의 성격은 "격자부터 정한 뒤 그 안에서만 움직임" — 그 외는 다른 Theme의 자리.
