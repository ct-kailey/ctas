# Toast

### 원칙
휘발성 피드백 — 사용자 액션의 결과를 짧게 알리고 자동으로 사라진다. 흐름을 끊지 않는다. [[components/callout]]은 상주 안내, [[components/banner]]는 페이지 폭 경고, Toast는 **일회성 결과 신호**.

### Do
- `tone`은 **아이콘 색**에만 적용. 표면 색은 `surface`(`inverse` 기본 / `default`)가 담당.
- 비파괴 결과(저장·복사됨)엔 `tone="neutral"`, 성공 상태 전환엔 `success`, 설정 누락·용량 임박엔 `warning`, 삭제·실패엔 `destructive`.
- `tone` 미지정 시 아이콘 자동 매칭 — `neutral`→`info`, `success`→`check-circle`, `warning`→`warning-circle`, `destructive`→`warning`. 다른 의미 아이콘 필요할 때만 `icon` override. 아이콘 없는 Toast는 허용하지 않는다.
- `action` 1개 + 자동 close `×` 1개까지. `action` Button은 size `xs`·variant `ghost` 또는 `outline`만 — Toast 표면이 inverse일 때 solid 버튼은 신호 역전.
- 스택 최대 3개. 4번째가 들어오면 가장 오래된 1개를 자동 제거.
- `placement`는 `bottom-right`(데스크톱 생산성 도구) 또는 `top-center`(모바일·간결 앱) 둘 중 하나. 혼용 금지.
- `placement="top-center"`는 **단일 라인 강제** — Viewport가 title 1줄만 보여주고 `description`은 자동 숨김, 긴 title은 ellipsis. 2줄 이상 신호가 필요하면 `bottom-right` 또는 [[components/callout]].
- `duration` 기본 4000ms. 중요도 높으면 `6000`, action 포함 시 `6000` 권장. `destructive` + 사용자 결정 필요엔 `Infinity`(수동 close 전엔 유지).
- `role` 자동 — tone이 `destructive`면 `alert`(즉시 읽힘), 그 외엔 `status`(polite).
- Provider는 앱 루트 1곳에 `<ToastProvider>` + `<ToastViewport>` 배치. Viewport가 placement를 결정.

### Don't
- Toast 표면색에 tone별 tint 금지 — 색은 아이콘·action 버튼에만.
- action Button 2개 이상 두지 않는다 — Toast 폭에서 신호 분산.
- action variant에 `primary`·`destructive` solid 금지 — inverse 표면에서 색 신호가 깨짐.
- 긴 본문(2줄 초과) 금지 — Toast는 1~2줄까지. 그 이상이면 [[components/callout]] 또는 [[components/banner]].
- `placement="top-center"`에 `description` 전달 금지 — Viewport가 숨긴다. multiline 신호 필요하면 placement부터 `bottom-right`로.
- 비동기 로딩 상태(spinner Toast)로 쓰지 않는다 — Toast는 완료 신호 전용.
- 플로팅이지만 `data-side` 기반 `.m-float` 유틸은 쓰지 않는다 — Toast는 placement별 slide-in 전용 애니.
- 영구 안내·설명·FAQ 유도에 쓰지 않는다 — [[components/callout]] 영역.
- `duration`을 [[axes/motion]] 스케일로 조절하지 않는다 — motion은 애니메이션 속도 축이고, duration은 "사용자 읽는 시간" 축. 둘은 독립. motion=`none`이어도 duration은 그대로(툭 나타나 4초 보고 툭 사라짐이 정상).

### Fallback
`tone` 애매하면 `neutral`. `surface` 애매하면 `inverse`. `placement` 애매하면 `bottom-right`. `duration` 애매하면 `4000`.

### 관련
- [[components/callout]] — 상주 안내 카드. Toast는 휘발.
- [[components/banner]] — 페이지 폭 전역 경고. Toast는 코너 소형.
- [[components/button]] — `action` 슬롯의 요소.
- [[axes/motion]] — placement별 slide-in·fade-out 파라미터 스왑.
- [[tokens/z-index]] — `z-toast` 레이어 (Modal 위, Tooltip 아래).

### Props 시그니처
```tsx
// Provider — 앱 루트 1곳
<ToastProvider duration={4000}>
  {children}
  <ToastViewport placement="bottom-right | top-center" />  // default: bottom-right
</ToastProvider>

// Toast — ToastProvider 자손에서 open 상태로 렌더
<Toast
  open={boolean}
  onOpenChange={(open: boolean) => void}
  title={ReactNode}                       // required
  description={ReactNode}
  tone="neutral | success | warning | destructive"  // default: neutral
  surface="inverse | default"             // default: inverse
  icon={IconName}                         // tone별 자동 매칭 override
  action={ReactNode}                      // Button size="xs" variant="ghost|outline"만
  actionAltText={string}                  // required if action — 스크린리더 설명
  dismissible={boolean}                   // default: true
  dismissLabel={string}
  duration={number | "Infinity"}          // default: 4000
/>

// Hook — 명령형 호출 (권장)
const { toast } = useToast();
toast({ title: "저장됨", tone: "success", duration: 3000 });
```

### Variant 매트릭스
Toast는 **5개 축의 독립 조합**이다. 축별로 결정 → 조합의 완성도는 아래 금지 조합만 피하면 보증.

**1. `placement` (Viewport 레벨, 앱당 1곳 지정)**

| 값 | 레이아웃 | description | 용도 |
|---|---|---|---|
| `bottom-right` (기본) | 우하단 → 위로 스택 | **허용** (2줄까지) | 데스크톱 생산성 도구 |
| `top-center` | 상단 중앙 → 아래로 스택 | **자동 숨김** (단일 라인 강제, title ellipsis) | 모바일·간결 앱 |

**2. `surface` (Toast별)**

| 값 | 표면 | 텍스트 | 용도 |
|---|---|---|---|
| `inverse` (기본) | `--fg`(라이트에선 검정) | `--bg`(라이트에선 흰색) | 주변 UI와 명확 분리. 생산성 도구 |
| `default` | `--bg` + `--shadow-lg` | `--fg` | Callout·Tooltip과 같은 톤. 가벼운 느낌 |

**3. `tone` (아이콘·action 색만 스왑. 표면 색은 영향 없음)**

| 값 | 아이콘 색 | 자동 아이콘 | 용도 |
|---|---|---|---|
| `neutral` (기본) | 중립(bg/fg-muted) | 없음 | 저장됨·복사됨 등 일반 완료 |
| `success` | `--success` | `check-circle` | 성공 전환(업로드 완료·결제 완료) |
| `warning` | `--warning` | `warning-circle` | 설정 누락·용량 임박 |
| `destructive` | `--destructive` | `warning` | 삭제·실패·롤백. `role="alert"` 자동 승격 |

**4. `dismissible` (우측 X 버튼)**

| 값 | 결과 | 용도 |
|---|---|---|
| `true` (기본) | 우측에 X IconButton | 대부분의 경우. `duration=Infinity`일 땐 **필수** |
| `false` | X 숨김 | duration 짧고(≤4000) action도 없는 순수 알림 전용 |

**5. `action` (Button 1개 slot)**

| action variant | 허용 조건 |
|---|---|
| `ghost` | 모든 tone·surface |
| `outline` | 모든 tone·surface |
| `primary`/`solid` | **금지** (아래 참조) |

**금지 조합**
- `surface=inverse` + action `primary`/`solid` — 반전 표면에서 solid는 색 신호 깨짐. `ghost`/`outline`만.
- `tone=destructive` + action `primary`(brand) — 파괴 맥락에 brand 색 신호 금지.
- `tone=success` + action `destructive` — 긍정 맥락에 비가역 액션 혼재 금지.
- `placement=top-center` + `description` 전달 — Viewport가 숨긴다. 2줄 신호 필요하면 bottom-right.
- `duration=Infinity` + `dismissible=false` — 사용자가 영원히 닫을 수 없음.
- action 2개 이상 — slot 1개로 제한.

### 애니메이션
`.m-float` 쓰지 않는다 (data-side 기반이라 placement 스택 구조에 안 맞음). Toast 전용 keyframe을 컴포넌트 CSS에 두되, duration·easing은 **반드시 `--duration-*`/`--ease-*` 토큰 경유**.

톤은 Sonner/Linear 계열 — **짧은 거리 slide + fade + 미세 scale**. 뷰포트 밖 전체 폭에서 밀고 들어오는 긴 slide는 쓰지 않는다 ("확 끼어드는" 인상). open은 공간에 '놓이는' 느낌, close는 '사라지는' 느낌.

- `placement=bottom-right` — open: `translateX(space-4)` + `scale(0.96)` + opacity 0 → 1. `--duration-slow` + `--ease-emphasized`.
- `placement=top-center` — open: `translateY(-space-4)` + `scale(0.96)` + opacity 0 → 1. 같은 토큰.
- close(dismiss) — placement 공통으로 `scale(1 → 0.96)` + opacity 1 → 0만. slide 없음. `--duration-base` + `--ease-in`.
- swipe dismiss는 `--radix-toast-swipe-move-x` 추적 → end 시 손가락이 민 방향으로 짧게 밀어내며 fade.
- `prefers-reduced-motion: reduce` — 모든 Toast 애니 즉시 완료.

### 조합 예시
```tsx
// 앱 루트
<ToastProvider>
  <App />
  <ToastViewport placement="bottom-right" />
</ToastProvider>

// 호출부
const { toast } = useToast();

toast({
  title: "변경사항이 저장되었습니다",
  tone: "success",
  action: (
    <Button size="xs" variant="outline" onClick={undo}>
      실행 취소
    </Button>
  ),
  actionAltText: "방금 저장을 되돌리기",
  duration: 6000,
});
```
