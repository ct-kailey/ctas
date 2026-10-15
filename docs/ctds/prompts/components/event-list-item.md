# EventListItem

### 원칙
리스트에 쌓이는 **하나의 일정** 아이템. 좌측 날짜 블록(큰 숫자 + 요일) · 세로 hairline · 우측 제목 + status Badge + meta 라인의 고정 anatomy. 캘린더 셀 안 색 바는 [[components/event-chip]]의 몫이고, 이 컴포넌트는 "다가오는 일정 리스트" "결재/행사 리스트"처럼 시간을 축으로 수직 나열되는 자리의 1 레코드.

날짜 숫자는 2자리 기준으로 트랙이 고정되어 리스트가 세로로 쌓여도 제목 시작점이 흔들리지 않는다. status는 enum 4종(upcoming/pending/completed/cancelled)으로 받아 [[components/badge]] soft + 상태색으로 자동 매핑 — 호출부가 Badge를 직접 조립하지 않는다.

### Do
- 한 아이템엔 **한 일정**. `date` 하나 + `title` 하나 + 선택적 `status` + `meta[]`.
- status는 enum 4종으로 넘긴다 — 자유 색/텍스트 Badge 조립 금지. 라벨만 override 필요하면 `statusLabel`.
- 메타 라인 아이템 사이는 **짧은 세로 hairline**으로 분리 (bullet·중점·|·하이픈 금지). `showMetaDivider={false}`로 끌 수 있지만 기본은 유지.
- 행 전체를 라우팅으로 쓰려면 `href` — hover bg + focus ring 자동.
- 리스트로 쌓을 때 세로 gap은 `--space-2` ~ `--space-3`. 아이템 자체가 chrome(border+radius+padding)을 들고 있어 부모는 수직 flex만. 단, `variant="line"`은 하단 hairline으로 분리되므로 부모 gap 없이 바로 쌓는다.
- chrome 축은 `variant`로 바꾼다 — `card`(기본, 떠있는 카드) · `line`(radius 없이 하단 hairline만) · `fill`(기본은 중립 soft 회색, status 지정 시 색상 톤).

### Don't
- [HARD] 안에 다시 Card chrome(추가 border/shadow) 쌓지 않는다 — "리스트 안 카드 안 카드"가 되어 depth가 깨진다.
- [HARD] status를 자유 색으로 덮어쓰지 않는다. "좋음=green" 같은 가치판단 반전 금지. 색은 **상태 enum**이 결정.
- [HARD] 날짜 요일 라벨을 UPPERCASE로 강제하지 않는다 — 소문자 유지("fri", "sun"). [[feedback_no_uppercase]].
- [HARD] 메타 사이 bullet/중점/`|`/em-dash 삽입 금지. 짧은 세로 hairline만 (또는 `showMetaDivider={false}`로 완전 제거).
- 날짜 숫자 외의 자리에 큰 숫자(가격·카운트) 추가 금지 — 좌측 트랙은 "날짜" 자리 하나.
- 2줄 이상 서술/본문을 title에 넣지 않는다 — 1줄 ellipsis. 본문이 길면 상세 뷰로.
- 날짜 블록을 Avatar/Icon으로 대체하지 않는다 — 그러면 이건 [[components/list-item]].

### Fallback
`status` 애매하면 생략(Badge 안 뜸, fill variant면 중립 회색). `statusLabel`은 enum 기본 라벨(Upcoming/Pending/Completed/Cancelled) 사용. 라우팅 자리 아니면 `href` 생략.

### 관련
- [[components/event-chip]] — 혼동 금지. EventChip은 캘린더 셀 안 색 바, EventListItem은 리스트 아이템.
- [[components/list-item]] — 날짜 자리에 Avatar/Icon이 오는 "누가 뭘 했다" 피드는 ListItem.
- [[components/metric-card]] — 같은 Card chrome 규칙(그림자 금지, line 기본).
- [[components/badge]] — status 매핑은 Badge soft + status.
- [[components/icon]] — meta 아이콘.
- [[tokens/color]] — `--bg` · `--bg-subtle` · `--border` · `--fg-strong` · `--fg-muted` · `--hover` · `--info-subtle` · `--warning-subtle` · `--success-subtle` · `--destructive-subtle`.
- [[axes/density]] — compact에선 세로 padding 줄어 리스트가 조밀해짐.
- [[feedback_no_bullet_separator]] — meta 사이 분리 규칙.
- [[feedback_no_uppercase]] — 요일 소문자 유지.
- [[feedback_font_weight_cap]] — title은 sm이라 medium, day는 2xl이라 semibold.

### Props 시그니처
```tsx
<EventListItem
  date={Date}                                               // required — 날짜 블록으로 자동 포맷
  title={ReactNode}                                         // required — 1줄 ellipsis
  variant="card | line | fill"                              // 기본 "card". chrome 스타일 축
  size="md | sm"                                            // 기본 "md". padding/날짜/제목/meta가 한 단계씩
  status="upcoming | pending | completed | cancelled"       // Badge soft + 상태색 자동 (fill에선 전면 색)
  statusLabel={ReactNode}                                   // 기본 라벨 override (ex: 한국어 "예정")
  meta={{ icon?: IconName; label: ReactNode }[]}            // 메타 라인. 사이는 세로 hairline으로 자동 분리
  showDateDivider={boolean}                                 // 기본 true. 날짜 블록 오른쪽 세로 hairline
  showMetaDivider={boolean}                                 // 기본 true. meta 사이 세로 hairline
  href={string}                                             // 있으면 <a> + hover/focus ring 활성
/>
```

### Variant 매트릭스

| variant | chrome | 쓰임 |
|---|---|---|
| `card` (기본) | 1px border + radius-lg + bg | 단독 떠있는 아이템. 다른 섹션과 섞이는 리스트. |
| `line` | radius 없음, 하단 hairline만 | 리스트가 가로 폭 꽉 채워 흐르는 자리. 아이템이 쭉 쌓임. |
| `fill` | **기본 중립 soft 회색**. status 지정 시 info/warning/success/destructive 톤 | 상태가 아이템 전체의 시각 신호로 중요한 자리. |

size (variant와 독립 축, 기본 `md`)

| size | padding | day | weekday | title | meta | 쓰임 |
|---|---|---|---|---|---|---|
| `md` (기본) | space-4 / space-5 | text-2xl | text-2xs | text-sm | text-xs | 대시보드·상세 뷰 등 일반 자리 |
| `sm` | space-3 / space-4 | text-xl | text-3xs | text-xs | text-2xs | 사이드바·밀집 리스트 등 세로 공간 아끼는 자리 |

status enum (variant와 독립 축)

| status | Badge status | 기본 라벨 | 쓰임 |
|---|---|---|---|
| `upcoming` | `info` | Upcoming | 다가올 일정 (기본 info 톤) |
| `pending` | `warning` | Pending | 승인·확정 대기 |
| `completed` | `success` | Completed | 종료·완료 |
| `cancelled` | `destructive` | Cancelled | 취소·무산 |

조합 결과

- `card` / `line` + `status` → Badge soft 표기, chrome은 variant 그대로
- `fill` + `status` 없음 → 중립 `--bg-subtle` 회색 bg (디폴트)
- `fill` + `status` 지정 → 아이템 전체가 status soft 톤 bg. 중복 방지로 **Badge는 자동 숨김**(색이 이미 상태를 표현)

### 조합 예시
```tsx
<div>
  {events.map((e) => (
    <EventListItem
      key={e.id}
      href={`/events/${e.id}`}
      date={e.date}
      title={e.title}
      status={e.status}
      meta={[
        { icon: "calendar-dots", label: e.when },
        { icon: "compass", label: e.where },
      ]}
    />
  ))}
</div>
```
