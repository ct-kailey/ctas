# Color

### 원칙
Semantic 이름으로 참조. 실제 색은 Hue × Palette × Mode 세 축의 조합이 결정.
컴포넌트가 "파란색" 같은 색상 자체를 지시하지 않고 "브랜드 강조" 같은 역할로 참조.

### Do
- **브랜드 색은 하나 — `--primary`**. 주 액션(CTA·submit·confirm)·링크·활성 상태·강조 전부 primary로. 브랜드 톤이 둘로 쪼개지지 않게.
- 텍스트 위계: 본문 `--fg`, 보조 `--fg-muted`, 메타·플레이스홀더 `--fg-subtle`.
- 표면 위계: 페이지 `--bg`, 카드/영역 `--bg-subtle`, 코드/hover `--bg-muted`.
- 상태 표시는 status 토큰: 성공 `--success`, 경고 `--warning`, 삭제·오류 `--destructive`, 정보 `--info`.
- Focus 표시는 `--ring`.

### Don't
- hex/rgb/oklch 리터럴 금지. 모든 색은 CSS 변수 경유.
- Status hue를 재정의하지 않는다 (성공은 항상 초록, 경고는 항상 주황).
- 밝은 배경에 흰 텍스트, 어두운 배경에 검은 텍스트 금지 — 항상 semantic pair 사용.
- **`--accent`를 쓰지 않는다** — CTDS는 Hue 축이 "한 프로젝트 = 한 hue"로 설계돼 primary 외의 별도 브랜드 색이 존재하지 않는다. 과거 `--accent` 참조는 `--primary`로 교체.

### Fallback
텍스트 `--fg`, 배경 `--bg`, 강조 `--primary`.

### 관련
- [[axes/palette]] · [[axes/hue]] · [[axes/mode]] — 실제 색상값 결정
- [[tokens/shadow]] — Shape 축이 color·shadow·border를 함께 결정하므로 짝으로 자주 참조

### 토큰 표

**표면**
| Token | 용도 |
|---|---|
| `--bg` | 페이지 배경 |
| `--bg-subtle` | 카드·영역 배경 |
| `--bg-muted` | 코드 인라인·hover 배경 |

**텍스트**
| Token | 용도 |
|---|---|
| `--fg` | 본문 |
| `--fg-muted` | 보조 텍스트 |
| `--fg-subtle` | 메타·플레이스홀더 |

**경계**
| Token | 용도 |
|---|---|
| `--border` | 기본 경계 |
| `--border-strong` | 강조 경계 (crisp shape에서 두드러짐) |

**브랜드**
| Token | 용도 |
|---|---|
| `--primary` | 브랜드 색 전부 — 주 액션·링크·활성·CTA. Mode에 따라 톤 반전 |
| `--primary-hover` | primary hover 상태 |
| `--primary-subtle` | primary의 매우 연한 배경 (soft 변형) |
| `--icon-color` | 아이콘 기본 색. Palette 축이 결정 (mono=fg-muted, standard/colorful=primary) |
| `--ring` | Focus 표시 |

> primary 위 텍스트는 자동 대비(`--bg`)로 처리. 별도 `--primary-fg` 토큰 없음.

**보조 (Secondary variant 전용 — Palette=colorful에서만 유의미)**
| Token | 용도 |
|---|---|
| `--secondary-bg` · `--secondary-bg-hover` · `--secondary-fg` | Button `variant="secondary"` 등이 참조 |

**상태**
| Token | 용도 |
|---|---|
| `--success` | 성공·완료 (항상 초록 계열) |
| `--warning` | 경고·주의 (항상 주황 계열) |
| `--destructive` | 삭제·오류 (항상 빨강 계열) |
| `--info` | 정보 안내 (항상 파랑 계열) |

**오버레이 · 인터랙션**
| Token | 용도 |
|---|---|
| `--hover` | 반복 리스트·메뉴·탭·테이블 hover 공통. 라이트 검정 3%, 다크 흰색 3% 알파 오버레이 |
| `--tooltip-bg` | Tooltip 배경 (Mode 반전: light면 다크, dark면 라이트) |
| `--tooltip-fg` | Tooltip 텍스트 (Mode 반전) |
