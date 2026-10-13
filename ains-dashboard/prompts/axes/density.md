# Density

### 원칙
정보 밀도를 결정. `--space-scale`은 spacing·컨트롤 높이를, `--font-scale`은 폰트 사이즈 스케일을 연쇄 스왑.
폰트 스케일은 위계를 흔들지 않도록 spacing보다 좁은 폭으로 조절한다 (0.95× / 1× / 1.05×).

### Do
- 데이터 테이블·관리 도구는 `compact`. 정보량이 승부.
- 태블릿·터치 인터페이스는 `comfortable`. hitbox 확보.
- Density가 바뀌면 컴포넌트 선택 자체가 바뀔 수 있음. 예: `comfortable`이면 폼 필드 한 줄 2개 이하.

### Don't
- Density를 무시하고 항상 같은 그리드/한 줄 필드 수를 강제하지 않는다.
- 컨트롤 높이(`--control-h-*`)를 하드코딩하지 않는다.
- 폰트 스케일 폭을 spacing과 같은 비율(0.85×/1.15×)로 넓히지 않는다 — 위계·가독성 붕괴.

### Fallback
`default`

### 값
| Density | `--space-scale` | `--font-scale` | 용도 |
|---|---|---|---|
| `compact` | 0.85× | 0.95× | 관리 도구·데이터 테이블. Excel 대체 UI. |
| `default` | 1× | 1× | 일반 웹 UI. |
| `comfortable` | 1.15× | 1.05× | 태블릿·터치·콘텐츠 중심. |

### 기본값
`default`

### 페어링
- `compact` + [[axes/shape]] `crisp` — 데이터 밀도 화면 표준 조합
- `compact` + [[axes/motion]] `calm` — 밀도 높을수록 모션 이동 거리도 축소돼야 어색하지 않음
- `comfortable` + [[axes/shape]] `soft` — 태블릿·터치·콘텐츠 중심에 자연스러움
- `comfortable` + [[axes/motion]] `bouncy` — 여유 있는 화면에서 표현력 있는 모션 가능

### 관련
- [[tokens/spacing]] — Density가 스왑하는 spacing 토큰
- [[tokens/typography]] — Density가 `--font-scale`로 사이즈 스케일 연동 (line-height는 스케일에 포함되어 함께 조절, weight·letter-spacing은 불변)
