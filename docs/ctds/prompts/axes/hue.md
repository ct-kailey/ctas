# Hue

### 원칙
브랜드 컬러의 **색상**을 결정. 다이얼(0~360°) 하나로 끝난다. CTDS는 이름 붙은 "색 세트"를 제공하지 않는다 — 색상명은 브랜딩 어휘지 토큰이 아니다.
`--hue` CSS 변수 하나가 primary·ring·chart 계열 hue를 동시 결정 — CTDS는 "한 프로젝트 = 한 hue, 한 브랜드 색"이 원칙.

### Do
- 다이얼로 0~360° 중 하나를 고른다. 브랜드 hex가 있으면 자동 매칭(hex → hue 추출).
- 색의 "성격"은 [[axes/palette]]와 결합해 결정 — hue 혼자 쓰지 말고 palette와 짝.

### Don't
- 컴포넌트마다 개별 hue를 쓰지 않는다. 한 프로젝트 = 한 hue.
- Chart 팔레트를 hue와 별개로 재정의하지 않는다 (Chart는 hue 기준 자동 분산).
- 색상에 이름을 붙여 지시하지 않는다 ("바다색으로", "숲 톤으로" 류 금지). 각도 또는 hex로 명시.

### Fallback
`210°`

### 값
0~360° 연속값. 참고 각도:
- `0°` red · `30°` orange · `60°` yellow · `120°` green · `180°` cyan · `210°` blue · `270°` purple · `330°` magenta

### 기본값
`210°`

### 페어링
- 낮은 chroma hue(220~260°대) + [[axes/palette]] `calm` — 차분한 브랜드 인상
- 따뜻한 hue(0~40°) + [[axes/palette]] `vivid` — 강한 강조
- 중간 hue + [[axes/palette]] `pastel` — 부드러움

### 관련
- [[axes/palette]] — chroma·lightness와 결합해 최종 색 생성
