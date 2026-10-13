# Spinner

### 원칙
짧은 비동기 작업의 **로딩 신호**. 색은 currentColor로 묶여 부모 톤을 그대로 승계. **variant 미지정이 기본** — [[axes/motion]] 축의 `--loader-style`을 따라가서 bouncy=dots-bounce / standard=ring / calm=dots-fade로 자동 스왑. "버튼 안 로딩이 테마 바꾸면 같이 바뀌는" 축 추종 구조가 설계의 핵심이다. 긴 작업(파일 업로드 등 진행률이 있는 것)은 [[components/progress-bar]].

### Do
- Button `loading` prop이 자동으로 Spinner를 중앙에 overlay — 소비자가 직접 Spinner 꽂을 필요 없음.
- 색이 필요하면 부모 요소에 `color: var(--accent)` 식으로 지정 — Spinner는 그대로 승계.
- 페이지 로딩이면 중앙에 size=`lg` 하나로 충분. 과한 fullscreen overlay는 피한다.
- variant 미지정이 default — Motion 축 바꾸면 모든 로더가 함께 바뀌는 게 설계 의도.

### Don't
- 진행률(퍼센트) 로딩에 쓰지 않는다 — [[components/progress-bar]].
- 스켈레톤 자리에 Spinner 쓰지 않는다 — 레이아웃이 이미 그려지는 자리면 shimmer skeleton이 맞음.
- 색을 하드코딩하지 않는다. currentColor가 부모 색을 승계하도록 두거나, 부모에 토큰 색을 걸 것.
- `size="xs"`는 아이콘 크기 로더 전용(Button xs 안쪽). 독립적으로 쓸 땐 sm 이상.
- variant를 소비 측에서 자꾸 override하지 않는다 — 축 추종이 "브랜드 톤 일관성"의 유일한 보장.

### Fallback
`size="sm"`, variant 미지정(= Motion 축 따라감), `label="Loading"`.

### 관련
- [[axes/motion]] — `--loader-style` 토큰을 축이 스왑
- [[components/button]] — `loading` prop이 Spinner를 자동 overlay
- [[components/progress-bar]] — 진행률 표시용 (Spinner와 역할 분리)

### Props 시그니처
```tsx
<Spinner
  size="xs | sm | md | lg"                                        // default: sm
  variant="ring | dots-bounce | dots-fade | pulse | lottie-<name>" // default: Motion 축 따름
  label={string}                                                  // SR 라벨. default: "Loading"
/>
```

### Variant 매트릭스
| variant | 시각 | 쓰임 |
|---|---|---|
| ring | 회전 반원 테두리 | 표준·중립. standard motion 자동 매핑 |
| dots-bounce | 3 dot 순차 bounce | 표현력. bouncy motion 자동 매핑 |
| dots-fade | 3 dot 순차 fade (위치 고정) | 미니멀. calm motion 자동 매핑 |
| pulse | 단일 원 scale pulse | 특수(온보딩·대기 신호). 자동 매핑 없음 — 명시 지정만 |
| `lottie-<name>` | 번들된 Lottie 로티 | 성격 있는 자리(AI 생성·온보딩·브랜드) |

### Lottie 로티 (10종 번들)
`lottie-react` 플레이어가 `/public/lottie/<name>.json`을 로드. 단색 로티는 `currentColor` 추종, 다색 로티는 원본 색 유지.

| name | 성격 | colorBind |
|---|---|---|
| `lottie-rabbit` | 뛰어가는 토끼. 긴 작업·AI 생성 대기 | ✓ |
| `lottie-infiniti` | 무한 루프 선. 네트워크·동기화 | ✓ |
| `lottie-dots` | 그라데이션 dot 흐름. 포인트 로더 | — |
| `lottie-spinner` | 표준 라인 스피너 | ✓ |
| `lottie-clock` | 회전 시계 바늘. 처리 대기·타임아웃 | ✓ |
| `lottie-cosmos` | 그라데이션 궤도. 몽환적·온보딩 | ✓ |
| `lottie-diamond-star` | 다이아몬드 바운스. 성공·축하 | — |
| `lottie-image-gen` | 이미지 생성 대기. AI 이미지 | ✓ |
| `lottie-loading-square` | 회전하는 사각형. 미니멀 처리 | ✓ |

**colorBind=✓** 로티는 Palette/Hue 축 바꾸면 로더 색도 자동 추종. **✗** 로티는 작가 의도된 다색이 그대로 유지됨.

**사이즈 주의**: Lottie는 vectorized라 size가 작으면 디테일 뭉개짐. `size="md"` 이상 권장. Button loading 안에 Lottie 쓰는 건 비권장 — 기본 variant(dots/ring)가 적합.

### Size 매트릭스
IconButton 박스 크기와 1:1 매칭 — 로더가 들어가는 자리의 IconButton·Button 박스와 같은 size로.

| size | 실제 크기 | 쓰임 |
|---|---|---|
| sm | 20px | 인라인 라벨 옆, 리스트 아이템, AIMessage generating |
| md | 24px | 섹션 로딩, 카드 중앙 |
| lg | 32px | **기본**. 조금 더 강조된 영역 |
| xl | 40px | 페이지 중앙 로딩, 모달 바디 로딩, Button loading(전 사이즈) |

Lottie 로더는 캔버스 충전율이 다르므로 `visualScale`로 bounds를 꽉 채우도록 보정됨 — size만 고르면 체감이 일관되게 맞아야 함. 특정 Lottie가 작아 보이면 `lottieManifest.ts`의 `visualScale`을 올려 글로벌 보정, 사용처에서 size를 올리지 말 것.

### 축 추종 매핑 (variant 미지정 시)
| Motion | Spinner 자동 variant |
|---|---|
| bouncy | dots-bounce |
| standard | ring |
| calm | dots-fade |
| none | ring (접근성 예외: 로딩 신호는 유지. `prefers-reduced-motion`은 상위 CSS가 처리) |

### 색 바인딩
Spinner는 `currentColor` 바인딩. 즉:
- Button primary 안에서는 Button의 fg 색(흰색 등)
- Button outline 안에서는 fg 기본색
- 커스텀 자리에 색이 필요하면 부모에 `color: var(--accent)` 식으로 걸 것

Palette·Hue 축이 바뀌어도 Spinner는 자동 추종 — 별도 색 지정 금지.

### 조합 예시
```tsx
// Button loading — 소비자가 신경쓸 거 없음 (Button이 자동 처리)
<Button loading>저장</Button>

// 페이지 중앙 로딩
<div style={{ display: "grid", placeItems: "center", minHeight: 240 }}>
  <Spinner size="lg" />
</div>

// 리스트 아이템 inline 로딩
<li>
  <Spinner size="xs" /> 불러오는 중
</li>

// 축 추종 끄고 명시 variant
<Spinner variant="pulse" size="md" />
```
