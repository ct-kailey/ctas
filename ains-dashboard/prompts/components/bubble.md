# Bubble

### 원칙
메시지 말풍선 **primitive**. Shape 4종 × Fill 4종 조합. [[components/user-message]]·[[components/ai-message]]의 Quote 블록·AttachmentItem 등 "담는 그릇" 역할 전부에 재사용.

### Do
- UserMessage는 `shape=circular-drop fill=translucent tail=end` 조합이 기본.
- AI Quote 블록은 `shape=rounded fill=outline` 또는 `fill=none`.
- Shape 축 따라 radius 변화 — rounded는 `radius-md` 토큰 사용 (soft/standard/crisp 반응 명확).
- circular-drop의 `tail` prop으로 꼬리 방향 지정 — user는 end, assistant/quote는 start.

### Don't
- Bubble을 "일반 Card" 용도로 쓰지 않는다 — 그건 [[components/metric-card]] / 커스텀.
- fill=`solid`는 user "강조" 메시지(선택된/하이라이트)에만 — 기본은 translucent.
- 꼬리를 양쪽 다 각지게 하지 않는다 — tail은 한 방향만.

### Fallback
shape 애매하면 `rounded`, fill 애매하면 `translucent`, size 애매하면 `md`.

### 관련
- [[components/user-message]] / [[components/ai-message]] — 상위 소비처
- [[components/badge]] — 작은 라벨은 Badge
- [[components/callout]] — 안내 상자는 Callout

### Props 시그니처
```tsx
<Bubble
  shape="rounded | circular-drop | circular | square"  // default: rounded
  fill="none | solid | translucent | outline"          // default: translucent
  size="md | lg"                                        // default: md
  tail="start | end"                                    // circular-drop에서만
>
  Text
</Bubble>
```

### 매트릭스
| shape | radius |
|---|---|
| rounded | `--radius-md` (Shape 축 반응 명확: soft 14 / standard 10 / crisp 6) |
| circular-drop | `--radius-md` 세 코너 + `0` tail 코너 하나 (각짐) |
| circular | `--radius-full` (알약) |
| square | `--radius-sm` |

| fill | bg | fg | border |
|---|---|---|---|
| none | transparent | fg-strong | — |
| solid | primary | bg | — |
| translucent | primary-subtle (알파 8%) | fg-strong | — |
| outline | bg | fg-strong | hairline border |

### Size
- `md` (기본): padding `space-2 space-3`, `text-base` — 일반 메시지 bubble.
- `lg`: padding `space-3 space-4`, `text-base` — 히어로/강조 bubble. 패딩만 넉넉, 폰트는 md와 동일.

소형 라벨이 필요하면 [[components/badge]] 사용.
