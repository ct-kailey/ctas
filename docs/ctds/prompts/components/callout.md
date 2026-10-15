# Callout

### 원칙
사이드바·리스트 끝·설정 패널의 여백에 상주하는 소형 안내 카드. 페이지 흐름을 끊지 않고 새 기능·이동 경로를 제시한다. hover가 없는 [[components/tooltip]], 휘발되는 Toast, 페이지 폭 전체를 덮는 [[recipes/page-banner]]와 구분된다.

### Do
- 표면은 `fill` 하나 — tone tint 배경 + 투명 border 로 신호를 담는다. 색 테두리 없음.
- 강조 색은 `tone` 으로 제어한다.
- `dismissible=true`면 `onDismiss`와 함께 부모가 숨김 상태를 저장한다.
- `actions`는 [[components/button]] slot이다 — variant는 자유, size는 `xs`(기본) 또는 `sm`만.
- 액션 Button의 색은 `tone`을 따라간다 — solid/soft 버튼이면 같은 tone(warning엔 warning 버튼, destructive엔 destructive 버튼), 아니면 `ghost`/`outline` 중립. tone과 다른 색 solid 버튼으로 신호를 깨지 않는다.
- 좁은 컨테이너에선 `actionsPlacement="bottom"` 유지, `right`는 본문이 짧고 카드가 가로로 넓을 때만.
- `warning`/`destructive` tone은 `icon` 미지정 시 각각 `warning-circle`(주의) / `warning`(위험)이 자동. 다른 의미 아이콘이 필요할 때만 override한다.
- 톤을 "비권장" 수준으로 낮추고 싶으면 Callout 자체를 쓰지 않는다 — [[components/callout]] 대신 `fg-muted` 색 **인라인 텍스트 한 줄**로 처리.

### Don't
- 페이지 폭 전역 경고에 쓰지 않는다 — [[recipes/page-banner]] 영역.
- 임시 피드백에 쓰지 않는다 — Toast를 쓴다.
- 본문을 4줄 넘게 채우지 않는다.
- `tone`을 임의 색상으로 확장하지 않는다.
- **[HARD] `variant="outline"` 금지** — 색 테두리 + 색 배경 조합(outlined Callout류) 영구 금지. "안 연한 배경 + 진한 스트로크" 는 UI 를 싸구려·시끄럽게 만듦 ([[PRINCIPLES]] §5b, [[feedback_no_outlined_callout]]). 과거 outline variant 는 폐기 — 쓰지 말 것. 비권장 메시지는 Callout 자체 대신 muted 인라인 텍스트로.

### Fallback
`variant` 는 `fill` 하나뿐. `tone` 애매하면 `brand`. `actionsPlacement` 애매하면 `bottom`.

### 관련
- [[recipes/page-banner]] — 페이지 폭 전면 경고. Callout은 국소 카드.
- [[components/button]] — actions 슬롯의 실제 요소이며 variant 규칙 원본.
- [[components/badge]] — title 옆 상태 라벨.
- [[axes/hue]] · [[axes/palette]] — tone별 강조 색을 스왑.

### Props 시그니처
```tsx
<Callout
  title={ReactNode}                                     // required
  icon={IconName}
  tone="neutral | brand | success | warning | destructive"  // default: brand
  actions={ReactNode}
  actionsPlacement="bottom | right"                     // default: bottom
  dismissible={boolean}                                 // default: false
  onDismiss={() => void}
  dismissLabel={string}
>{children}</Callout>
```

> `variant` prop 은 폐기됨. 과거 코드는 자동으로 `fill` 로 동작하지만, 신규 작성 시 명시하지 않는다.

### Variant 매트릭스
`variant` 는 `fill` 하나로 고정. tone 별 표면 색만 바뀐다.

| tone | fill (유일 variant) | 용도 |
|---|---|---|
| `neutral`     | 회색 표면(`bg-subtle`) + `fg-muted` 아이콘 | 톤 없는 기본 안내·중립 컨텍스트 |
| `brand`       | tone 8% tint 표면 + brand 아이콘 | 신기능·프로모션·마이그레이션 유도 |
| `success`     | success 8% tint + success 아이콘 | 완료·다음 스텝 제안 |
| `warning`     | warning 8% tint + warning 아이콘 | 만료·용량 임박·설정 누락 |
| `destructive` | destructive 8% tint + destructive 아이콘 | 삭제 예정·비가역 상태 |

모든 tone 에서 border 는 `transparent` — 색 테두리는 fill 표면과 신호가 겹쳐 소음만 더한다. 영역 분리가 필요하면 외부 레이아웃 gap 으로 해결, Callout 자체는 테두리를 그리지 않음.

**금지 조합**
tone이 톤 신호를 쥐고 있으므로, 그 안의 요소들(액션 버튼·아이콘)도 같은 신호를 유지해야 한다. 색이 어긋나면 사용자는 어느 쪽을 믿어야 할지 결정하지 못한다.

- `tone`과 다른 색상 CTA Button을 섞지 않는다 — `warning` 콜아웃 안에 `brand`(파랑) solid 버튼, `destructive` 콜아웃 안에 `success`(초록) 버튼처럼 신호가 어긋나는 조합은 금지. 액션 Button은 같은 tone의 색을 쓰거나(`solid`/`soft`), 색 신호를 비우는 `ghost`/`outline` 중립 버튼만 허용.
- `brand` tone 콜아웃에 `secondary` 톤 solid 버튼으로 메인 CTA를 두지 않는다 — 톤이 brand면 주 액션도 brand solid, 보조 액션만 ghost.
- `tone=success` + 파괴 액션(`destructive` Button) — 긍정 맥락 안의 비가역 액션은 사용자를 속인다.
- `tone=destructive` + `success` 아이콘(check 등) — 아이콘이 톤을 뒤집는다.
- `tone=warning` + `success` 아이콘, `tone=warning` + brand solid 버튼 등 톤↔요소 신호 역전 금지.
- 한 콜아웃 안에 서로 다른 tone의 solid 버튼 둘을 나란히 두지 않는다 — primary 1개 + 중립(ghost/outline) 1개 패턴만.

### 조합 예시
```tsx
<Callout
  icon="stack"
  title="Import Issues"
  dismissible
  onDismiss={() => setHidden(true)}
  dismissLabel="Dismiss"
  actions={
    <Button variant="ghost" size="sm" rightIcon={<Icon name="arrow-right" />}>
      Try Now
    </Button>
  }
>
  Use our Migration Assistant to copy issues from another service.
</Callout>
```
