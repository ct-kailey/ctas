# Shape

### 원칙
컴포넌트의 **촉감**(radius + shadow + border 두께). 세 요소를 세트로 스왑해 시각적 일관성 유지.

### Do
- 프로젝트 성격에 맞춰 하나 선택. 컴포넌트별로 다르게 쓰지 않는다.
- 데이터 밀도 높은 화면은 `crisp` — 각진 경계가 정보 구분에 유리.
- 콘텐츠·마케팅 화면은 `soft` — 친근함·여유.

### Don't
- radius/shadow/border를 개별 하드코딩하지 않는다. Shape 축으로만 조정.
- 특정 컴포넌트만 다른 shape를 갖게 만들지 않는다 (예: Modal만 soft).

### Fallback
`standard`

### 값
- `soft` — 큰 radius, 부드러운 넓은 그림자, 얇은 border. 캐주얼·친근.
- `standard` — soft와 crisp의 산술 중간. 무난한 표준.
- `crisp` — 작은 radius, 짧고 예리한 그림자 + 아웃라인, 뚜렷한 border. 신뢰·전문.

### 기본값
`standard`

### 페어링
- `soft` + [[axes/motion]] `bouncy` — 부드러운 촉감과 표현력 있는 모션이 자연스러움
- `crisp` + [[axes/motion]] `calm` — 신뢰·전문 인상에는 절제된 모션
- `crisp` + [[axes/density]] `compact` — 데이터 밀도 화면의 표준 조합
- `soft` + [[axes/density]] `compact` — 비권장. 부드러운 촉감과 밀도가 충돌

### 관련
- [[tokens/radius]] · [[tokens/shadow]] — Shape가 스왑하는 토큰들
