# Hue

### 원칙
브랜드 컬러의 **색상**을 결정. 프리셋 이름으로 시작하고 필요 시 다이얼(0~360°)로 미세조정.
`--hue` CSS 변수 하나가 primary·ring·chart 계열 hue를 동시 결정 — CTDS는 "한 프로젝트 = 한 hue, 한 브랜드 색"이 원칙.

### Do
- 프리셋 이름(`ocean`, `forest` 등)을 우선 사용. AI 지시도 이름이 명확.
- 다이얼은 프리셋과 조금 다른 브랜드 컬러가 필요할 때만.

### Don't
- 컴포넌트마다 개별 hue를 쓰지 않는다. 한 프로젝트 = 한 hue.
- Chart 팔레트를 hue와 별개로 재정의하지 않는다 (Chart는 hue 기준 자동 분산).

### Fallback
`ocean` (210°)

### 값
- `ocean` (210°) — 신뢰. 금융·공공.
- `forest` (145°) — 안정. 헬스케어.
- `sunset` (25°) — 활력. 스타트업·이커머스.
- `lavender` (280°) — 창의. 교육·문화.
- `crimson` (355°) — 강조. 프로모션.
- `slate` (260°, 낮은 chroma) — 무채색 계열. 관리 도구.

### 기본값
`ocean`

### 페어링
- `ocean`·`forest`·`slate` + [[axes/palette]] `calm` — 차분한 브랜드 인상
- `sunset`·`crimson` + [[axes/palette]] `vivid` — 강한 강조
- `lavender` + [[axes/palette]] `pastel` — 부드러움
- `slate`는 낮은 chroma가 특성 — [[axes/palette]] `vivid`와 조합 시 원래 강도가 안 나옴 (비권장)

### 관련
- [[axes/palette]] — chroma·lightness와 결합해 최종 색 생성
