# ListItem

### 원칙
리스트에 반복되는 **한 줄 단위**의 범용 anatomy. 피드·알림·활동 로그·작업 리스트·자원 목록이 전부 이 형태다. GitHub Timeline · Linear Inbox · Jira Issue history · Notion Updates · Figma Comments 모두 같은 뼈대 위에 서식과 톤만 바뀐다.

**3구역 뼈대**: `[leading] [content] [trailing]`. 가로축은 이 셋이 전부고 세 구역 전부 `ReactNode`라 **자유 조립**. content 안쪽은 자주 쓰는 조립을 위한 편의 서브컴포넌트(`Title · Description · Meta · MetaDivider`)가 세로 리듬을 자동 공급하지만 강제는 아님 — 아바타 그룹·프로그레스·커스텀 차트 등 아무거나 넣을 수 있다.

**일정·이벤트처럼 날짜가 leading 아이덴티티인 자리는 [[components/event-list-item]] 사용** — ListItem은 범용 한 줄, EventListItem은 시간축 중심 전용.

**chrome 없음** — bg·border·radius를 자체 공급하지 않는다. ListItem은 "리스트에 녹는 한 줄"이지, 블록이 아니다. 배경·테두리로 상태를 신호해야 하는 블록이 필요하면 [[components/callout]]로 승격한다.

변주 축은 두 개: `size`(md/sm)가 세로 여백감을, `align`(center/top)이 leading 세로 정렬을 담당. 기본은 `md`(작업·자원 리스트 밀도), `sm`은 활동 로그·추출 완료처럼 분리선 없이 조밀하게 쌓이는 스트림 자리. row hover bg는 전 리스트 기본, href/onClick이 있으면 cursor pointer + focus ring 추가.

---

## 결정 가이드 — 뭘 만들려는 거지?

### 1. 자원·문서 목록 (내가 열어볼 것들)
문서·프로젝트·설정 항목처럼 **"열람 가능한 것들"의 목록**. 액션보다 네비게이션이 주.

```tsx
<ListItem
  href="/docs/abc"
  leading={<ListItemLeadingIcon size="md"><Icon name="file-text" /></ListItemLeadingIcon>}
  trailing={<Icon name="caret-right" />}
>
  <ListItem.Title>채용 파이프라인 QBR</ListItem.Title>
  <ListItem.Meta><time>2029년 7월 8일 작성</time></ListItem.Meta>
</ListItem>
```

- **leading**: `ListItemLeadingIcon`(배경색 아이콘) → 자원의 "타입 아이덴티티"
- **content**: `Title` + `Meta`(생성/수정 날짜). Description은 생략 — 자원의 "본문 요약"이 필요한 자리면 그건 ListItem이 아니라 Card
- **trailing**: `caret-right` → "클릭하면 열림" 신호
- **size**: `md`, **align**: `center`

### 2. 작업·할 일 리스트 (내가 처리해야 할 것들)
요청·승인 대기·검토 필요처럼 **상태가 있는 작업 단위**.

```tsx
<ListItem
  align="top"
  leading={<Icon name="list-dashes" />}
  trailing={
    <>
      <Badge variant="soft" status="warning">검토 필요</Badge>
      <IconButton size="sm" variant="ghost" icon={<Icon name="caret-right" />} aria-label="열기" />
    </>
  }
>
  <ListItem.Title>개발 대상과 문서 범위 확인</ListItem.Title>
  <ListItem.Meta><time>22분 전 요청</time></ListItem.Meta>
</ListItem>
```

- **leading**: raw `<Icon>` → 체크리스트·태스크의 "종류"만 가볍게
- **content**: `Title` + `Meta`(요청 시각·요청자). Description은 선택 — 제목이 짧으면 추가
- **trailing**: 상태 `Badge` + chevron. Badge가 "지금 상태"를 shout, chevron이 "열어서 처리하라"
- **size**: `md`, **align**: `top`

### 3. 피드·활동 로그 (지나간 이벤트 스트림)
알림·활동 기록·이력처럼 **읽을 뿐 처리는 거의 없는 흐름**.

```tsx
<ListItem align="top" size="sm" leading={<Avatar size="sm" name="박지훈" />}>
  <ListItem.Title>박지훈 — ERP 2.0 사이드바 티켓에 코멘트</ListItem.Title>
  <ListItem.Meta><time>12분 전</time></ListItem.Meta>
</ListItem>
```

- **leading**: Avatar(사람 이벤트) 또는 raw `<Icon>`(시스템 이벤트)
- **content**: `Title`에 "누가/뭘 했다"를 한 줄로. 긴 설명은 target 클릭 뒤 상세 뷰로
- **trailing**: 보통 없음 (hover-only 액션은 archive/mark-read 패턴)
- **size**: `sm` (스트림은 조밀하게), **align**: `top`

### 4. 멘션·댓글 (내가 응답해야 할 메시지)
멘션·@·댓글 리스트. 피드와 비슷하지만 **"응답 가능"이 핵심**.

```tsx
<ListItem
  href="/thread/123"
  align="top"
  leading={<Avatar size="sm" name="장대표" />}
>
  <ListItem.Title>장대표</ListItem.Title>
  <ListItem.Description>@희영 1:1 전에 자료 공유 부탁</ListItem.Description>
  <ListItem.Meta><time>오전 9:12</time></ListItem.Meta>
</ListItem>
```

- **content**: `Title`에 이름, `Description`에 **인용 한 줄**(전체 메시지 복사 금지), `Meta`에 시각
- **href**: row 전체가 thread 열기
- **align**: `top`

### 5. 데이터 레코드 (내가 보고 비교할 숫자)
가격·수량·기간이 핵심인 리스트. 숫자가 Title보다 중요한 자리.

→ **ListItem이 아니라 [[components/table]]의 자리**. ListItem은 "자원·텍스트 중심 한 줄", 숫자 비교·정렬·집계는 Table.

### 6. 상태 공지·보류 블록 (지금 당장 봐야 하는 알림)
"작업 보류", "다운타임 예정", "결제 실패"처럼 **배경 톤으로 shouts** 해야 하는 블록.

→ **ListItem이 아니라 [[components/callout]]의 자리**. ListItem은 chrome 없이 흐름에 녹는 한 줄이지, 상태 블록이 아니다.

### 7. 선택 가능한 목록 (여러 개 체크·drag)
멀티 셀렉션·drag reorder·bulk 작업 리스트.

→ **ListItem leading에 `<Checkbox />`** 꽂아서 시작. drag handle은 leading 왼쪽에 추가 자리로. 복잡해지면 Table로 승격.

---

## 서브컴포넌트 역할

| 서브컴포넌트 | 뭘 담나 | 언제 쓰나 |
|---|---|---|
| `ListItem.Title` | 메인 제목·행위 요약 | 항상. Title 없는 ListItem은 거의 없음. Badge를 inline으로 Title 앞에 섞어도 OK |
| `ListItem.Description` | 제목으로 안 담기는 **인용·부제** | 멘션/댓글 본문, 설명이 1줄 더 필요한 자리. 생성일 같은 메타는 절대 Description 아님 |
| `ListItem.Meta` | **메타데이터** (시각·작성자·버전·상태 텍스트) | 작성일·수정일·요청자·"n개 참여" 같은 보조 수치 전부 여기 |
| `ListItem.MetaDivider` | Meta 안 토큰 사이 hairline 구분자 | `<span>작성 10일 전</span><Divider /><span>박지훈</span>` 같을 때 |

### Description vs Meta
가장 자주 실수하는 자리. 구분 공식:
- **Description** = "제목으로 안 들어간 **본문 성격의 한 줄**" (댓글 본문, 부제, 요약)
- **Meta** = "**누가/언제/몇 개** 같은 메타데이터" (날짜·사람·수치·상태 텍스트)

"2029년 7월 8일 작성"은 **Meta**. "@희영 1:1 전에 자료 공유 부탁"은 **Description**.

---

## Do
- **anatomy는 3구역 고정**: leading / children(content) / trailing.
- **세 구역은 전부 ReactNode — 완전 자유**: 전용 서브컴포넌트는 리듬 토큰을 자동 공급하는 **편의 레이어**지 강제가 아님.
- **leading 타입은 리스트 단위로 통일**: 자원 리스트는 전부 IconMark, 피드는 전부 Avatar 식.
- **2줄 이상 본문이면 `align="top"`**: leading이 Title 라인에 top-align.
- **스트림 자리는 `size="sm"`**: 활동 로그·알림 스트림은 조밀하게.
- **row 전체 클릭은 `href`/`onClick`**: cursor pointer + focus ring 자동.
- **Meta 안 토큰 사이는 MetaDivider**: 가운뎃점·bullet·파이프 금지. [[feedback_no_bullet_separator]].
- **날짜는 [[feedback_date_writing]] 규칙 준수**: "10월 13일" 또는 "12분 전", 숫자 패턴(10. 13) 금지.

## Don't
- **Description에 메타데이터 쓰기 금지**: "2029년 7월 8일 작성" 같은 날짜·사람·수치는 전부 `Meta`로.
- **Title에 전체 메시지/긴 서술 넣기 금지**: ListItem은 요약 라인, 메시지 뷰어가 아님.
- **content에 여러 Title 금지**: 메인 제목은 하나.
- **Description은 2줄 안쪽**: 3줄 이상이면 외부 Callout·Card로.
- **bg·border·radius 자체 공급 금지**: 블록 외형이 필요하면 [[components/callout]].
- **leading에 inline `<svg>` 금지**: 반드시 `<Icon />`/Badge/Avatar 경유. [[feedback_no_inline_svg]].
- **한 리스트 안 size 혼용 금지**: sm 리스트는 전부 sm.
- **자리마다 세로 간격 손 조정 금지**: 균형 안 맞으면 `size` 또는 리듬 토큰(`--li-gap-title`·`--li-gap-body`)으로.
- **[HARD] `border-bottom` 있는 li 에 세로 padding 생략 금지** ([[feedback_no_touching_edges]]) — 콘텐츠가 선에 붙으면 무조건 문제. 최소 `--space-3` 유지. border + padding 을 다른 레이어가 공급해도 결과적으로 접촉 금지는 소비처가 책임.

## Fallback
leading 애매하면 Icon. size 애매하면 md. align 애매하면 center(한 줄)·top(2줄 이상).

## 축 (CSS 변수)

| 훅 | 대상 | 폴백 |
|---|---|---|
| `--li-pad-y` | 세로 padding (hit area) | `var(--space-3)` |
| `--li-gap-x` | leading↔content↔trailing | `var(--space-3)` |
| `--li-gap-title` | Title↔Description·Meta ("제목+부제" 유닛감) | `var(--space-0_5)` |
| `--li-gap-body` | 큰 블록 간 간격 | `var(--space-2)` |
| `--li-gap-meta` | Meta 라인 아이템 간 가로 gap | `var(--space-2)` |

### MetaDivider 스펙

가운뎃점·bullet·파이프 대신 쓰는 짧고 연한 세로 hairline. 가운뎃점·`|`·`•` 전부 금지 ([[feedback_no_bullet_separator]]).

```css
.metaDivider {
  display: inline-block;
  width: 1px;
  height: calc(var(--text-xs) * 0.8);   /* Meta 텍스트 높이 대비 약간 짧게 */
  background: var(--fg);
  opacity: 0.2;                          /* hairline 톤 */
  margin-inline: var(--space-1);        /* 좌우 작게 — Meta 토큰 간격은 --li-gap-meta 가 담당 */
  vertical-align: baseline;
}
```

핵심 원칙:
- 색은 `--fg` × 낮은 알파 (fg 톤 유지, bg 와 섞이지 않음) — 다크/라이트 모드 전환 자동 반응.
- 높이는 Meta 폰트 크기(`--text-xs`) 기준 상대값 — Density 축 스왑에 자동 반응.
- 좌우 margin 은 `--space-1` 로 고정, Meta 토큰 간 가로 gap 은 상위 Meta wrapper 의 `gap` (`--li-gap-meta`)이 담당.

## Props 시그니처
```tsx
<ListItem
  leading={ReactNode}             // Icon | Avatar | Badge | ListItemLeadingIcon | 자유
  trailing={ReactNode}            // Badge | Button | IconButton | 조합 | 자유
  size="md | sm"                  // default: md (sm은 스트림 자리)
  align="center | top"            // default: center. 2줄 이상이면 top.
  href={string}                   // row 전체 링크 (클릭 가능)
  onClick={(e) => void}           // row 선택 핸들러 (클릭 가능)
>
  <ListItem.Title>...</ListItem.Title>
  <ListItem.Description>...</ListItem.Description>
  <ListItem.Meta>
    <time>...</time>
    <ListItem.MetaDivider />
    <span>...</span>
  </ListItem.Meta>
</ListItem>

```

## 조립 — 부모 wrapper
리스트로 묶을 때는 부모 ul에 hairline border만 공급.

```css
.feed {
  list-style: none;
  padding: 0;
  margin: 0;
}
.feed > li {
  border-bottom: var(--hairline) solid var(--border);
}
.feed > li:last-child { border-bottom: none; }
```

**interactive ListItem**(`href`/`onClick`)은 cursor pointer + focus ring 자동, hit area는 좌우 `space-2`만큼 자동 확장(negative margin으로 정렬 유지).

## 관련
- [[components/avatar]] — leading의 "사람" 자리.
- [[components/badge]] — Title 앞 inline 상태, leading 상태, trailing 상태 전부.
- [[components/button]] — trailing CTA.
- [[components/icon-button]] — trailing chevron/dots.
- [[components/callout]] — 배경·테두리로 상태 신호가 필요한 블록은 Callout.
- [[components/event-list-item]] — 날짜가 leading 아이덴티티인 일정·이벤트 리스트는 EventListItem.
- [[components/table]] — 숫자 비교·정렬이 핵심이면 Table.
- [[components/metric-card]] — chrome 없이 부모가 분리 담당하는 설계 철학 공유.
- [[axes/density]] — 전역 Density 축은 테마 레벨, ListItem의 size는 리스트 자리별 조절.
- [[feedback_no_bullet_separator]] — Meta 라인 구분자는 MetaDivider.
- [[feedback_no_inline_svg]] — leading 아이콘은 Icon 컴포넌트.
- [[feedback_date_writing]] — Meta 안 날짜는 "10월 13일" / "12분 전" 형식.
