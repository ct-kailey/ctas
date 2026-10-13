# Theme Schema

Theme 레이어 자체의 규칙. 개별 Theme 문서는 이 스키마를 따른다.
[[PRINCIPLES]] · [[GUIDE]]의 전제를 모두 이어받는다.

---

## 원칙
Theme은 **6개 축의 preset 묶음 + 축 밖 산문 레이어**다. "룩의 뼈대"를 담고, 색은 담지 않는다.

- Theme이 묶는 축 6개: **Mode / Shape / Density / Font / Icon / Motion**
- Theme에서 빠지는 축 3개: **Palette / Hue / Voice**  
  → 같은 Theme에 다른 Palette·Hue를 자유롭게 입힌다. editorial Theme에 cream도 slate도 pink도 성립.
  → Voice는 Theme과 독립 — editorial Theme에 `casual`도, mechanical Theme에 `formal`도 성립.
- Theme이 담는 축 밖 레이어는 **산문·네거티브 선언만**. 토큰화하지 않는다.

### Do
- Theme 하나 = 파일 하나. 파일명은 `<theme-slug>.md` (kebab-case).
- 축 6개 preset을 모두 선언한다 (하나라도 빠지면 Theme이 아니다).
- 모든 preset에 **왜 1문장** 붙인다.
- 산문 레이어 4섹션(Layout / Imagery / Decoration / Negative)은 **값이 없으면 "N/A"**로 명시. 섹션 자체를 생략하지 않는다.
- Signature 1문장은 "이 Theme IS ___" 공식으로 쓴다 (ANALYSIS §3 수사 장치 참고).

### Don't
- 색을 Theme에 담지 않는다. `color: #...`, `palette: warm-cream` 등 모두 금지. 색은 Palette/Hue 축이 담는다.
- 레이아웃·간격·radius·duration **수치를 Theme에 쓰지 않는다**. 수치는 축/토큰이 담는다. Theme은 "선호"만.
- 커스텀 토큰·CSS 변수를 Theme에서 새로 정의하지 않는다. Theme은 기존 토큰 선택기일 뿐.
- override 상한을 걸지 않는다. **override는 전부 자유, 책임은 사용자**(공주 결정).

### Fallback
축 6개 중 preset 선택이 애매하면 각 축의 기본값([[axes/mode]] 등 참고)으로 둔다. 그래도 애매하면 사용자에게 확인.

### 관련
- [[GUIDE]] — Theme도 공통 골격 §2를 따른다. 아래 "Theme 전용 추가 항목"이 §3의 축/토큰/컴포넌트/프리미티브 다음 다섯 번째 타입.
- [[themes/_TEMPLATE]] — 복사해서 쓰는 Theme skeleton.

---

## Theme 전용 추가 항목 (공통 골격 §2 뒤)

Theme 문서는 공통 골격 5섹션(원칙/Do/Don't/Fallback/관련) 뒤에 아래 4블록을 **이 순서로** 붙인다.

### 1. Signature

```markdown
### Signature
이 Theme IS ___. <비교 수사 1문장: "not X, but Y because Z" 공식 권장>
```

- 1~2문장. ANALYSIS §3의 "editorial pacing", "software-craft documentation" 류 어휘.
- "경쟁 레퍼런스 공간 안에서의 좌표"를 심는다. 예: "not a bright SaaS marketing page, but a long-form reading column."

### 2. Preset table (축 6개)

```markdown
### Preset

| Axis | Value | Why |
|---|---|---|
| [[axes/mode]] | `<값>` | <한 줄 이유> |
| [[axes/shape]] | `<값>` | <한 줄 이유> |
| [[axes/density]] | `<값>` | <한 줄 이유> |
| [[axes/font]] | `<값>` | <한 줄 이유> |
| [[axes/icon]] | `<값>` | <한 줄 이유> |
| [[axes/motion]] | `<값>` | <한 줄 이유> |
```

- 6행 전부 채운다. 빈 셀 금지.
- `Value`는 각 축 문서에 선언된 값만 쓴다. 새 값을 Theme에서 발명하지 않는다.
- Voice는 Theme 묶음 바깥 축이므로 Preset table에 포함하지 않는다 ([[axes/voice]] 참고).

### 3. 축 밖 레이어 (산문 4섹션)

각 섹션은 **수치 없이 선호·태도만**. 수치는 Density/Shape 축에 양보.

```markdown
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
- <"no X" 선언 1>
- <"no X" 선언 2>
- <최소 3개, 최대 5개 권장>
```

- Negative는 **최소 3개**. ANALYSIS §3 "네거티브 선언이 포지티브만큼 정체성을 만든다" 원칙.
- Negative 각 항목은 "경쟁 default가 뭔지 전제한 반대 선언" 공식을 권장. 예: "no uppercase (SaaS marketing default)".

### 4. Override 정책 + Known Gaps + Iteration Guide

```markdown
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
```

- Known Gaps: ANALYSIS §1 "환각 봉쇄" 공식. "animation 시퀀스는 Motion 축에 양보", "Voice는 축 바깥 — Theme이 추천하지 않음" 식.
- Iteration Guide: 다음 LLM/작성자에게 주는 유지보수 문법. 명령형. ANALYSIS §4.5.

---

## 보이스
Linear "software-craft documentation" 톤 (ANALYSIS §4.7). 짧은 문장 + 토큰 레퍼런스 + 비교 수사.
한국어로 쓰되 축/토큰/preset 식별자는 영어 유지.

---

## 셀프 체크리스트
- [ ] 공통 골격 5섹션(원칙/Do/Don't/Fallback/관련) 모두 있는가
- [ ] Signature에 "IS ___" 공식 + 비교 수사가 있는가
- [ ] Preset 표 6행이 모두 채워져 있는가
- [ ] Preset 표의 Value가 각 축 문서에 선언된 값과 일치하는가
- [ ] 산문 4섹션(Layout/Imagery/Decoration/Negative)이 모두 있는가 (없으면 N/A)
- [ ] Negative가 최소 3개 있는가
- [ ] Known Gaps · Iteration Guide가 있는가
- [ ] 색(hex/palette)·수치(px/ms)를 Theme 안에 쓰지 않았는가
- [ ] [[PRINCIPLES]] §6 하드코딩 금지 전부 준수
