# Palette

### 원칙
브랜드 컬러의 **강도**를 결정. Hue가 "어떤 색"이라면 Palette는 "얼마나 강한 색".
OKLCH의 chroma·lightness를 스왑.

### Do
- 프로젝트의 톤을 정하는 첫 축. Hue보다 Palette를 먼저 결정한다.
- 정보 밀도가 높은 화면은 `calm` 또는 `standard`.
- 마케팅·랜딩·온보딩은 `vivid` 또는 `pastel`.
- 완전 중성(브랜드 컬러 없는 흑백 톤)이 필요하면 `mono`.

### Don't
- Palette를 컴포넌트별로 다르게 쓰지 않는다. 프로젝트 전체가 한 Palette.
- `pastel` 컬러 위에 흰 텍스트를 얹지 않는다 (대비 부족).
- `mono`에서 "브랜드 색이 왜 안 보여?"는 설계 의도 — 상태색(status)만 유색 유지, 그 외 아이콘·포커스·nav-active·secondary는 전부 중성 fg 톤.

### Fallback
`standard`

### 값
- `mono` — chroma 0. 브랜드 컬러를 쓰지 않는 완전 중성 톤. 흑백·그레이 레벨만. 상태색(status)만 유색 유지(사용자 안전 신호). 에디터 UI·커맨드 중심 도구에 적합.
- `vivid` — 채도 높음. 강한 인상, 브랜드 강조.
- `standard` — 기본. 일반 웹 UI.
- `calm` — 채도 낮음. 차분, 신뢰. 금융·의료·공공.
- `pastel` — 매우 낮은 채도 + 밝은 명도. 부드러움. 교육·유아·라이프스타일.

### 기본값
`standard`

### 축 간 상호작용

- **`mono` + [[axes/icon]]**: mono palette일 땐 `--icon-color`가 `--primary` 대신 `--fg-muted`로 override. [[components/icon]]은 자동 반응.
- **`mono` + 선택 상태**: Checkbox·Radio·Tab 등의 활성 색도 primary 아닌 fg 톤. 상태 자체는 다른 신호(배경·테두리·weight)로 전달됨.
- **`mono` + status**: warning/danger/success/info는 유색 유지. mono라도 안전 신호는 색으로 봐야 함.

### 페어링
- `calm` + 낮은 chroma hue(220~260°) — 신뢰·안정 인상 (금융·의료·공공)
- `vivid` + 따뜻한 hue(0~40°) — 강한 브랜드 인상 (스타트업·프로모션)
- `pastel` + 중간 hue — 부드러움 (교육·라이프스타일)
- `pastel` + [[axes/mode]] `dark` — 비권장. 파스텔은 밝은 배경에서 최적화됨
- `mono` + [[axes/hue]] — hue 값은 저장되지만 chroma가 0이라 실제로 안 보임. mono에선 hue 변경 무의미.

### 관련
- [[axes/hue]] — Palette와 조합해 최종 브랜드 컬러 생성
- [[axes/icon]] — mono에선 아이콘 색이 primary 아닌 fg-muted
