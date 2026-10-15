# Kanban

### 원칙
워크플로우를 **상태(컬럼)와 아이템(카드)의 2차원 격자**로 보여주는 자리. 가로축은 진행 단계(todo·in-progress·review·done 등), 세로축은 각 단계 안의 큐. 3-레벨 compound로 분리되어 보드 폭·컬럼 뼈대·카드 내용이 각자 축을 가진다.

- **Kanban (board)** — 가로 트랙. 컬럼 width·간격·스크롤 여부만 담당.
- **Kanban.Column** — 한 상태의 세로 스택. chrome(배경 vs 테두리) × layout(한 블록 vs 두 블록) × accent(상태색 위치) × tone(6종)으로 조립.
- **Kanban.Card** — 아이템 1장. slot(Cover/Header/Title/Description/Meta/Footer) 조합으로 자유롭게.

DnD는 **이 컴포넌트가 품지 않는다** — dnd-kit은 호출부가 바깥에서 감싸는 opt-in 패턴. 시각이 먼저, 상호작용은 선택.

### Do
- 컬럼은 **같은 chrome · 같은 layout으로 통일**한다. 한 보드 안에 line·filled·plain, wrap·stack을 섞지 않는다 — depth 혼란.
- 상태 색은 `tone` + `accent="dot"`(헤더 title 앞 점) 또는 `chrome="filled"`(bg·fg가 tone 색계열로 동시 변함)로 공급. 컬럼 전체를 진한 bg로 칠하지 않는다 ([[feedback_bg_or_stroke_only]]).
- `layout="wrap"`(기본)은 header와 카드 스택이 **한 쉘 안에** — 컬럼 하나가 하나의 "그릇". 가장 흔한 칸반 모습.
- `layout="stack"`은 **header만 chrome**을 가지고 그 아래 카드 스택은 chrome 없이 떨어져 쌓이는 "얹어진" 레이아웃. 카드가 그릇에 갇히지 않고 자유롭게 숨 쉬는 느낌. header에 action이 많거나 카드 영역을 더 넓게 쓰고 싶을 때.
- 카드는 Column 안에 **자유 조합**: 가장 작은 카드는 `Title`만, 가장 큰 카드는 `Cover` + `Header` + `Title` + `Description` + `Meta` + `Footer` 전부.
- 보드가 뷰포트보다 넓으면 `scroll` 기본 — 세로 wrap하지 않는다.
- Column의 count·action은 **헤더 우측**에 자동 배치됨. `action`은 ReactNode라 IconButton 여러 개(`+` · 설정 등)를 Fragment로 넘겨도 됨.
- `layout="stack"`에선 **컬럼별로 chrome을 섞어 쓰기** 자연스러움 — 특정 컬럼만 filled로 강조하고 나머지는 line으로 조용히 두는 식. `layout="wrap"`에선 chrome 통일.

### Don't
- [HARD] 카드 안에 다시 Card chrome(추가 border/shadow) 쌓지 않는다 — "컬럼 안 카드 안 카드"는 depth 깨짐.
- [HARD] 컬럼에 "안 연한 배경 + 테두리" 조합 금지 — chrome은 `line`(테두리만) · `filled`(배경만) · `plain`(둘 다 없음) 중 하나.
- [HARD] 컬럼 title을 UPPERCASE로 강제하지 않는다 — [[feedback_no_uppercase]].
- [HARD] 상태 색을 **진한 bg로 칠하지 않는다** — tone 색은 chrome=filled일 때 subtle bg(약 8% opacity) + 같은 색 fg 조합으로만. 신호가 더 조용해야 하면 chrome=line/plain + accent="dot".
- `layout="stack"`에서 body(카드 스택)에 chrome(배경·테두리)을 추가하지 않는다 — stack의 핵심은 "카드가 그릇에서 풀려남". chrome 축은 header에만 영향.
- 보드 전체를 `<section>`으로 감싸지 않는다 — [[feedback_no_semantic_tags_in_components]].

### Fallback
- 애매하면 `chrome="line"` + `layout="wrap"` + `accent="none"`. 가장 조용한 조합.
- 상태 신호를 강하게 주고 싶으면 `chrome="filled"` + `tone=…` (bg·fg 둘 다 그 색계열로).
- header에 action(검색·필터·추가 버튼 등)이 많아져 복잡해지면 `layout="stack"`로 분리.

### 관련
- [[components/list-item]] — 세로 1열 리스트. 칸반 카드는 리스트 아이템을 그리드로 재구성한 것.
- [[components/metric-card]] — 카드 chrome 규칙(그림자 금지, line 기본) 공유.
- [[components/badge]] — 카드 Header의 상태·우선순위 라벨.
- [[components/avatar]] — 카드 Footer의 담당자.
- [[components/icon-button]] — 컬럼 action, 카드 메뉴.
- [[tokens/color]] — `--bg` · `--bg-muted` · `--border` · `--primary` · `--success` · `--warning` · `--destructive` · `--info`.
- [[feedback_bg_or_stroke_only]] — 컬럼 chrome 설계의 핵심.
- [[feedback_no_hardcoded_values]] — columnWidth도 토큰/계산값 권장.

### Props 시그니처
```tsx
<Kanban
  columnWidth={string}      // CSS 길이. 기본 var(--space-80) = 320px
  gap={string}              // 컬럼 사이 간격. 기본 var(--space-3)
  scroll={boolean}          // 가로 스크롤 on/off. 기본 true
>
  <Kanban.Column
    title={ReactNode}
    count={number | string}
    action={ReactNode}
    footer={ReactNode}
    chrome="line | filled | plain"       // 기본 line
    layout="wrap | stack"                // 기본 wrap
    accent="none | dot"                  // 기본 none
    tone="neutral | primary | success | warning | danger | info"
  >
    <Kanban.Card href={string}>
      <Kanban.Card.Cover>…</Kanban.Card.Cover>
      <Kanban.Card.Header>…</Kanban.Card.Header>
      <Kanban.Card.Title>…</Kanban.Card.Title>
      <Kanban.Card.Description>…</Kanban.Card.Description>
      <Kanban.Card.Meta>…</Kanban.Card.Meta>
      <Kanban.Card.Footer>…</Kanban.Card.Footer>
    </Kanban.Card>
  </Kanban.Column>
</Kanban>
```

### chrome 매트릭스
| chrome | 배경 | 테두리 | 쓰임 |
|---|---|---|---|
| `line` (기본) | 투명 | 1px border | 조용한 보드. 카드가 주연. |
| `filled` | tone-subtle(없으면 bg-muted) | 없음 | 컬럼 자체가 "그릇"임을 강조. tone 하나가 bg·header fg 둘 다 결정(같은 색을 opacity로만 조절). |
| `plain` | 투명 | 없음 | chrome 없이 scroll만. 미니 보드·임베드. |

### layout 매트릭스
| layout | 모양 | 쓰임 |
|---|---|---|
| `wrap` (기본) | header와 카드 스택이 한 쉘 안에. 컬럼 하나 = 한 그릇. | 일반 칸반. 가장 흔함. |
| `stack` | header만 chrome. 그 아래 카드 스택은 chrome 없이 떨어져 쌓임. | 카드가 그릇에서 풀려 숨쉬는 느낌. header 중심 보드. |

### accent 매트릭스
| accent | 신호 위치 | 쓰임 |
|---|---|---|
| `none` | 없음 | 상태 색 신호 불필요 |
| `dot` | 헤더 title 앞 | 조용한 색 신호. 다수 컬럼 구분. |

### 조합 예시

**가장 작은 카드 — 제목만**
```tsx
<Kanban>
  <Kanban.Column title="To Do" count={3}>
    <Kanban.Card>
      <Kanban.Card.Title>디자인 토큰 정리</Kanban.Card.Title>
    </Kanban.Card>
  </Kanban.Column>
</Kanban>
```

**표준 — 제목 + 메타 + 담당자**
```tsx
<Kanban.Card href={`/tasks/${t.id}`}>
  <Kanban.Card.Header>
    <Badge variant="soft" status="warning">검토 필요</Badge>
  </Kanban.Card.Header>
  <Kanban.Card.Title>사이드바 리팩터 PR 리뷰</Kanban.Card.Title>
  <Kanban.Card.Meta>
    <Icon name="clock" size={14} /> 금요일 마감
  </Kanban.Card.Meta>
  <Kanban.Card.Footer>
    <AvatarGroup size="xs"><Avatar name="박지훈"/><Avatar name="이수민"/></AvatarGroup>
    <span>3 댓글</span>
  </Kanban.Card.Footer>
</Kanban.Card>
```

**얹어진 header — layout=stack + chrome=filled**
```tsx
<Kanban>
  <Kanban.Column
    title="진행 중"
    count={5}
    action={<IconButton variant="ghost" size="md" icon={<Icon name="plus" />} aria-label="추가" />}
    chrome="filled"
    layout="stack"
    tone="info"
  >
    {cards.map((c) => (…))}
  </Kanban.Column>
</Kanban>
```

**색 신호 — chrome=filled + tone 하나로**
```tsx
<Kanban>
  <Kanban.Column title="To Do"       chrome="filled" tone="neutral" count={5} />
  <Kanban.Column title="In Progress" chrome="filled" tone="info"    count={3} />
  <Kanban.Column title="Review"      chrome="filled" tone="warning" count={2} />
  <Kanban.Column title="Done"        chrome="filled" tone="success" count={12} />
</Kanban>
```

**DnD opt-in — dnd-kit로 바깥 감싸기**
```tsx
import { DndContext } from "@dnd-kit/core";
import { SortableContext, useSortable } from "@dnd-kit/sortable";

function SortableCard({ id, children }) {
  const { attributes, listeners, setNodeRef, transform } = useSortable({ id });
  return (
    <Kanban.Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform) }}
      {...attributes}
      {...listeners}
    >
      {children}
    </Kanban.Card>
  );
}
```
