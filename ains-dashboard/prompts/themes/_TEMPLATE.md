# <Theme Name>

<!--
새 Theme을 만들 때 이 파일을 복사하고 파일명을 `<theme-slug>.md`로 바꿔 쓴다.
스키마·보이스·셀프 체크리스트는 [[themes/_SCHEMA]] 참고.
HTML 주석은 작성 완료 후 지운다.
-->

### 원칙
<이 Theme이 왜 존재하는가. 1~2줄. 어떤 사용 맥락에서 쓰이도록 설계되었는가.>

### Do
- <이 Theme을 쓸 때의 명령형 규칙 1>
- <규칙 2>
- <규칙 3>

### Don't
- <이 Theme을 쓸 때 하드 리젝 사유 1>
- <사유 2>

### Fallback
<축 preset이 애매할 때의 기본 처리. 보통 "각 축의 기본값으로 두거나 사용자에게 확인".>

### 관련
- [[themes/_SCHEMA]] — Theme 스키마
- [[axes/palette]] · [[axes/hue]] — 이 Theme 바깥. 색은 조합 시점에 결정.
- [[presets/<관련-preset>]] — <어떤 관련인지 한 줄> (없으면 삭제)

---

### Signature
이 Theme IS ___. <비교 수사 1문장. "not X, but Y because Z" 권장.>

### Preset

| Axis | Value | Why |
|---|---|---|
| [[axes/mode]] | `<값>` | <한 줄 이유> |
| [[axes/shape]] | `<값>` | <한 줄 이유> |
| [[axes/density]] | `<값>` | <한 줄 이유> |
| [[axes/font]] | `<값>` | <한 줄 이유> |
| [[axes/icon]] | `<값>` | <한 줄 이유> |
| [[axes/motion]] | `<값>` | <한 줄 이유> |

### Layout
<1~3문장. column 수 선호, section 호흡, 1-column 중심인지 그리드 중심인지. 수치 금지.>
또는 N/A

### Imagery
<1~3문장. 사진 / 3D / 플랫 일러스트 / 아이코노그래피 / 없음. 소스·톤 가이드.>
또는 N/A

### Decoration
<1~3문장. mesh gradient / grid lines / 노이즈 / 없음.>
또는 N/A

### Negative
- <"no X" 선언 — 경쟁 default 전제 1>
- <선언 2>
- <선언 3>

### Override
전부 자유. 사용자가 "이 Theme에서 Shape만 soft로"처럼 지시하면 그대로 적용. 책임은 사용자.
Theme 선언을 벗어난 조합의 완성도는 보증하지 않는다 ([[PRINCIPLES]] §7).

### Known Gaps
- <이 Theme이 터치하지 않는 것 1>
- <이 Theme이 터치하지 않는 것 2>

### Iteration Guide
1. <이 Theme을 수정·확장할 때 지켜야 할 규칙 1>
2. <규칙 2>
3. <규칙 3>
