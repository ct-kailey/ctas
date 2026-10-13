# Stepper

### 원칙
다단계 프로세스의 진행 위치를 시각적으로 보여주는 컴포넌트. 각 스텝은 `upcoming | active | done` 세 상태를 가지며, 상태 대비로 사용자가 "지금 어디에 있고 얼마나 남았는지"를 즉시 파악하게 한다. Rail·툴바 같은 껍데기(브랜드 슬롯·푸터)는 이 컴포넌트가 담지 않는다 — Stepper는 **스텝 리스트만** 담당.

### Do
- **기본은 `orientation="vertical"`**. 온보딩·설정·긴 폼처럼 화면 좌측 사이드에 붙는 표준 케이스.
- **좁은 헤더·상단 배너에는 `orientation="horizontal"`**. 세로 공간이 부족하고 스텝 개수가 3~5개일 때.
- **스텝이 6개를 넘으면 hint를 지운다** — title만 남기고 밀도를 확보.
- **활성 스텝은 한 번에 하나**. `activeIndex`로만 제어. 자식 Item에 `state`를 직접 넣는 건 예외 케이스(비선형 진행)에서만.
- **미도달 스텝 클릭은 막는다** — 상위에서 `disabled` prop 또는 `onStepClick`에서 조건 처리. 스텝 스킵을 허용하면 진행률의 의미가 무너진다.
- **marker는 `dot` 기본**. `number`는 순서가 정보 그 자체일 때만 (예: "3단계 결제 프로세스"처럼 숫자가 사용자 언어에 이미 있는 경우).
- **색은 로컬 CSS 변수로 오버라이드**. 특수 팔레트(온보딩 다크 rail 등)에서는 `--stepper-fg` · `--stepper-fg-muted` · `--stepper-fg-subtle` · `--stepper-line` · `--stepper-dot-idle` · `--stepper-marker-fg`를 부모에서 재정의.

### Don't
- Stepper 안에 브랜드 로고·푸터·CTA 버튼을 넣지 않는다 — 상위 shell(Rail)의 책임.
- marker 안에 이모지·아바타·커스텀 배지 삽입 금지. dot / number / check만 허용.
- 활성 스텝을 진하게, 미도달을 진하게 동시에 강조하지 않는다. 위계는 하나(active만 `--stepper-fg`).
- 스텝 사이 dashed line을 solid로 바꾸지 않는다 — dashed는 "진행 여지"의 시각 신호.
- Motion 축과 무관하게 marker에 커스텀 애니메이션(bounce, spin 등) 붙이지 않는다. 상태 전환은 `--transition-colors`로 통일.
- `data-state="active"` 위에 hover가 border/bg를 덮어쓰지 않는다. [[feedback/hover-over-active]] 원칙.

### Fallback
orientation 애매하면 `vertical`, marker 애매하면 `dot`. 스텝 6개 초과에 orientation·marker 판단 안 서면 사용자에게 확인.

### 관련
- [[components/progress-bar]] — 연속형 진행률. 스텝이 discrete 하지 않으면 이쪽.
- [[components/tabs]] — 순서·진행 개념 없이 병렬 전환이면 Tabs.
- [[axes/density]] — `--space-scale`이 스텝 간격 · marker 크기에 반영
- [[axes/motion]] — 상태 전환 duration/easing
- [[tokens/color]] — `--fg` · `--fg-muted` · `--fg-subtle` · `--border` 매핑
- [[tokens/spacing]] — `--space-5`(marker), `--space-6`(item-gap) 참고

### Props 시그니처
```tsx
<Stepper
  activeIndex={number}
  orientation="vertical | horizontal"       // default: vertical
  marker="dot | number"                     // default: dot
  onStepClick={(index: number) => void}
>
  <Stepper.Item title="..." hint="..." disabled={boolean} state="upcoming | active | done" />
</Stepper>
```

### Variant 매트릭스
| orientation | marker | 용도 | 금지 조합 |
|---|---|---|---|
| `vertical` | `dot` | **기본.** 온보딩·설정·긴 폼의 좌측 rail | — |
| `vertical` | `number` | 순서가 사용자 언어에 이미 있는 세로 rail (드묾) | 스텝 6개 초과 시 hint까지 붙이면 답답 |
| `horizontal` | `dot` | 좁은 헤더·상단 배너, 스텝 3~5개 | 스텝 6개 초과 금지 (dashed line이 짧아짐) |
| `horizontal` | `number` | 결제·체크아웃 같은 "명시적 순서" 헤더 프로세스 | 스텝 6개 초과 금지 |

### 색 오버라이드 예 (특수 팔레트)
```css
/* 예: 온보딩 다크 rail에서 Stepper를 밝은 톤으로 뒤집기 */
.myDarkRail {
  --stepper-fg: var(--onb-rail-fg);
  --stepper-fg-muted: var(--onb-rail-fg-muted);
  --stepper-fg-subtle: var(--onb-rail-fg-subtle);
  --stepper-line: var(--onb-rail-line);
  --stepper-dot-idle: var(--onb-rail-dot-idle);
  --stepper-marker-fg: var(--onb-rail);
}
```

### 조합 예시
```tsx
// 온보딩 세로 rail — 기본 dot
<Stepper
  activeIndex={stepIdx}
  onStepClick={(i) => {
    if (i <= stepIdx || isReachable(i)) setStepIdx(i);
  }}
>
  {STEPS.map((s, i) => (
    <Stepper.Item
      key={s.key}
      title={s.title}
      hint={s.hint}
      disabled={i > stepIdx && !isReachable(i)}
    />
  ))}
</Stepper>

// 체크아웃 상단 헤더 — horizontal + number
<Stepper activeIndex={1} orientation="horizontal" marker="number">
  <Stepper.Item title="장바구니" />
  <Stepper.Item title="배송 정보" />
  <Stepper.Item title="결제" />
  <Stepper.Item title="완료" />
</Stepper>
```
