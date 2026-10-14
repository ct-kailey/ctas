# Event Chip

### 원칙

캘린더 셀 안에서 "하루에 쌓이는 일정 하나"를 표현하는 작은 정보 블록. [[components/chip]]은 필터 선택 토큰 전용, [[components/badge]]는 카운트·상태 라벨 전용 — 캘린더 셀 안 일정은 이 자리. 가로 폭은 부모(셀)에 꽉 차고, 세로로 쌓이며, 넘치는 title은 ellipsis로 접힌다.

### Do
- props는 `title` + `tone` + `variant` + `faded` 네 개만. title 하나로 끝난다 — 부가 라벨(코드·시각·주최자)은 셀 안이 아니라 상세 패널에서 다룬다.
- 톤은 7종(default/neutral/accent/success/warning/danger/info)만 사용. Badge soft와 동일 토큰 체계.
- `variant="default"`는 라벨 바(색 배경 + title), `variant="dot"`은 라벨 없이 색점 하나(초미니멀). dot variant는 월간 overview·사이드 미니 캘린더처럼 "그 날에 뭔가 있다"만 알리면 되는 자리에 쓴다 — title은 aria-label로 들어가 접근성 유지.
- 폭은 부모 flex column에 맞춰 자동. `min-width: 0`을 부모에 걸어주면 ellipsis가 자연히 동작한다.
- outside 월(전/다음 달)이나 과거 등 "눈에 띄지 않아야 할" 자리는 `faded`로 흐리게. 캘린더가 자동으로 넘겨준다.
- 라운드는 Shape 축에 반응하는 `--radius-xs` (default variant). dot variant는 원.

### Don't
- title 외 보조 라벨(코드·사건번호·주최자) 넣기 금지 — 셀 안은 밀도가 승부처라 한 줄만. 그게 필요하면 셀 클릭 → 상세 패널.
- 클릭 가능한 "안쪽 버튼" 금지 — EventChip 자체는 presentational. 상호작용은 부모 셀이 책임진다. 안에 또 버튼이 들어가면 캘린더 클릭 타겟이 미궁에 빠진다.
- pill radius(완전 둥근) 쓰지 않는다 — Shape 축이 radius를 쥐고 있는데 pill로 고정하면 Soft/Standard/Crisp 신호가 셀 안에서 깨진다.
- "눈에 띄게" 하려고 전부 `danger` 톤으로 깔기 금지 — 색이 의미 신호를 잃는다.
- 아이콘·아바타 삽입 금지 — 이 자리는 "하루 셀 안 한 줄"이지 ListItem이 아니다.

### Fallback
`tone` 애매하면 `default`. `faded`는 캘린더 외 자리에서는 생략해도 됨.

### 관련
- [[components/calendar]] — 1차 소비자. 셀 안에서 EventChip을 세로로 쌓고(default) 또는 가로 wrap(dot), 넘치면 muted "+N" 텍스트로 접는다.
- [[components/badge]] — 톤 토큰 체계 공유 (soft variant).
- [[components/chip]] — 혼동 금지. Chip은 필터 선택 토큰("X 제거 가능"), EventChip은 캘린더 일정 토큰.
- [[axes/shape]] — radius가 Shape 축에 반응.
- [[tokens/color]] — `--bg-muted`(default) · `--secondary-bg`(neutral) · `--primary-subtle`(accent) · `*-subtle`(상태) · `--fg`/`--fg-muted`(글자).

### Props 시그니처

```tsx
<EventChip
  title={string}                                  // required
  tone="default | neutral | accent | success | warning | danger | info"
  variant={"default" | "dot"}                     // default: "default" (라벨 바). dot=색점만
  faded={boolean}                                 // outside 월·과거 등 흐리게
/>
```

### Tone 매트릭스

| tone | 배경 | 글자 | 쓰임새 |
|---|---|---|---|
| `default` | `--bg-muted` | `--fg` | 미분류 · 중립 일정 (기본값) |
| `neutral` | `--secondary-bg` | `--secondary-fg` | 사내 공지 · 루틴 |
| `accent` | `--primary-subtle` | `--secondary-fg` | 주요 미팅 · 내 일정 |
| `success` | `--success-subtle` | `--success` | 확정 · 완료 |
| `warning` | `--warning-subtle` | `--warning` | 임박 · 주의 |
| `danger` | `--destructive-subtle` | `--destructive` | 마감 · 긴급 |
| `info` | `--info-subtle` | `--info` | 참고 · 외부 캘린더 |

### 조합 예시

```tsx
// 캘린더 셀 안쪽 — Calendar가 내부에서 쓰는 방식.
// 부모가 min-width: 0 걸어주면 title ellipsis가 자동.
<div className="cellEvents">
  {events.map((e) => (
    <EventChip key={e.id} title={e.title} tone={e.tone} faded={outside} />
  ))}
</div>

// 캘린더 외부 — 선택된 날짜의 상세 리스트에서 재사용.
// Calendar와 짝 이루는 사이드 패널에서도 톤 체계가 통일되게 유지된다.
<aside>
  {dayEvents.map((e) => (
    <div key={e.id} className="dayRow">
      <EventChip title={e.title} tone={e.tone} />
      <time>{e.time}</time>
    </div>
  ))}
</aside>
```
