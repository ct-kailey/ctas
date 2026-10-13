# Font

### 원칙
**의미 기반 슬롯**으로 관리. 컴포넌트는 슬롯(`--font-normal/code`)만 참조.
Language 축이 슬롯의 스택을 언어별로 스왑한다.

특별 요구가 없으면 **한 폰트만 사용**한다 — 본문·헤딩·강조 전부 `--font-normal`.
포인트/세리프 이중 폰트 체계는 사용하지 않는다.

### Do
- 본문·헤딩·강조는 `--font-normal`, 코드·숫자 정렬은 `--font-code`.
- 위계는 size/weight/color로만 만든다 (font-family 스왑 아님).
- 프로젝트에서 새 폰트를 쓰고 싶으면 슬롯 매핑을 갈아끼운다 (컴포넌트 코드 안 건드림).
- `html.lang`을 `data-lang`과 동기화한다 (스크린 리더 정확도).

### Don't
- `font-family: "Pretendard", ...`처럼 폰트 이름 하드코딩 금지.
- 헤딩·hero·인용문을 "예쁘게 하려고" 세리프/명조로 바꾸지 않는다.
- 컴포넌트가 특정 폰트 특성(예: 세리프)에 의존하는 레이아웃 만들지 않는다.

### Fallback
`lang=ko`

### 값

**Language** (`data-lang`) — 슬롯의 폰트 스택을 언어별로 스왑
- `ko` · `en` · `ja` · `zh`

### 기본값
`lang=ko`

### 페어링
- Language는 다른 축과 독립적 (한 프로젝트가 여러 언어 동시 지원해도 다른 축은 그대로)

### 관련
- [[tokens/typography]] — 사이즈·라인하이트·웨이트 토큰
