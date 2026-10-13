# ListItem

### 원칙
피드·알림·인박스·활동 로그에 반복해서 등장하는 "누가 뭘 했다" 한 줄의 최소 단위. GitHub Timeline · Linear Activity · Jira Issue history · Slack Notification · Notion Updates가 모두 이 형태다. 시각 구조와 상태 신호(unread/urgent)만 담당하고, 그룹핑·필터·무한스크롤·mark-as-read 같은 흐름은 상위 컨테이너가 책임진다.

같은 anatomy 안에서 **variant로 자리의 성격만 바꾼다** — `activity`(과거 서술), `notification`(처리 필요), `mention`(인용), `system`(사람 아님). variant를 늘리기 전에 slot(`leading`/`trailing`/`hoverActions`)으로 조립이 되는지 먼저 본다.

컴포넌트 자신은 **단일 row**다. border/divider/카드 chrome을 자체적으로 지지 않는다 — 리스트로 묶는 건 부모 레이아웃이 결정한다. 운영 콘솔은 border로, pure 좌표는 hairline으로, 카드 안 리스트는 Callout이 담당. ([[components/metric-card]]의 `bare` variant와 같은 원리.)

**단, "chrome 없음"은 완전한 공간 없음을 뜻하지 않는다** — ListItem은 `padding-block: var(--space-3) + margin-block: -var(--space-3)`의 **self-contained 상쇄 공식**을 가진다. 부모가 세로 padding을 안 걸어도 row hover hit area가 보장되게 하려는 안전장치다. 하지만 flex item 레이아웃에서는 음의 margin이 레이아웃 박스를 축소하지 못해 **ListItem이 "상쇄된 자리"를 실제로 차지한다** — 부모 li가 padding을 또 걸면 두 번 공간이 쌓여 과하게 보인다. 자세한 공식·완화법은 아래 "조립 — 부모 wrapper 공식" 섹션.

### Do
- **anatomy는 네 자리로 고정**: `[leading] [who] [body / verb+target] [meta/trailing]`. 어떤 variant든 이 뼈대를 깨지 않는다.
- **layout은 두 형태**: `inline`(한 줄, 기본) · `stacked`(두 줄 — from이 1줄, body가 2줄). 서술 모드 둘 다에서 작동 — action 모드 stacked는 "from · verb · target" + body 2줄째, 서술 모드 stacked는 from + body 2줄째. 긴 서술/인용/멘션은 stacked.
- **서술은 두 모드 중 하나로**: 자유 서술은 `from` + `body`("회계팀 — 외주비 결재 요청"), 액션 서술은 `from` + `verb` + `target`("박지훈 · 댓글 남김 · ERP 2.0 사이드바"). 둘 다 넘기지 않는다.
- **unread는 텍스트 톤으로만 신호** (dot/badge 없음): `unread={true}`면 body/from이 가장 진하고 meta는 `--primary` 컬러로 "지금"을 강조. `unread={false}`면 전체 톤이 한두 단계 뒤로 물러나 "이미 처리됨"을 시사. `unread` 생략(undefined)이면 중립 — **리드/언리드 개념 자체가 없는 자리**(활동 로그·히스토리·타임라인)에서 자유롭게 사용.
- **surface는 작은 inline 토큰**: `surface="GitHub"` 같은 서비스명은 target 뒤 작게 inline. [[components/badge]] variant="soft"로 렌더되지만 text-only로 유지.
- **meta는 상대시간 한 토큰**: "방금", "12분", "어제". ISO 날짜는 Tooltip으로 보조.
- **hover-only 액션은 명시적으로**: `hoverActions={[<IconButton name="archive"/>, ...]}` — Linear Inbox의 archive/snooze/mark-read 패턴. 평상시 숨김, row hover/focus/focus-within에서 등장. [[components/menu-item]]의 hoverOnly와 같은 메커니즘.
- **row 전체 클릭은 `href`로**: 라우팅 아이템이면 asChild로 `<Link>`에 위임. target만 링크로 쓰고 row는 비활성인 자리도 OK.
- **leading 정책은 리스트 단위로 통일**: 일부엔 Avatar, 일부엔 Icon처럼 섞으면 "누구"의 자리가 어긋난다. system 메시지가 섞이는 리스트면 전부 Avatar fallback(이니셜) + system은 서비스 로고 Avatar.
- **leading 타입은 세 종류**: Avatar(사람·팀), Icon(단색 글리프), `ListItemLeadingIcon`(배경색 + 아이콘 마크). 세 번째는 "서비스/시스템이 상태를 색으로 신호"하는 자리 — tone 프리셋(`primary · success · warning · danger · info · neutral`)으로 bg/fg 쌍을 한 번에, 혹은 `--leading-icon-bg` · `--leading-icon-fg` 변수로 세밀 조절. Avatar와 같은 사이즈 트랙(xs/sm/md/lg)이라 섞여도 정렬 유지. 추가로 `size="auto"`는 `layout="stacked"`와 짝 — content 두 줄 전체 높이에 맞춰 정사각으로 stretch, 상태 마크를 크게 보여야 하는 알림/시스템 메시지 자리.
- **density는 컨테이너에 맡긴다**: ListItem 자체는 size prop 없이, 부모 리스트의 density(또는 Density 축) 토큰을 상속한다.

### Don't
- `verb` + `body` 동시 사용 금지 — 서술 중복. 액션 모드와 서술 모드는 배타.
- 채팅뷰처럼 긴 메시지 본문을 그대로 노출하지 않는다 — ListItem은 "누가 어디서 뭘 했다" 요약 라인이지, 메시지 내용의 복사본이 아니다. 멘션/댓글이어도 `verb` + `target`("어디/뭐에")로 축약하고 상세는 target 클릭 뒤 전체 뷰에서. 인용부호를 둘러친 긴 body도 금지.
- `leading`을 생략하고 unread dot만 두지 않는다 — dot 혼자 떠서 "누구"의 자리가 사라진다. system 메시지는 서비스 로고/아이콘 Avatar를 세운다.
- body를 두 줄 이상으로 늘리지 않는다 — 길면 `layout="stacked"`로 자동 승격해 target 라인과 서술 라인을 분리하거나, [[components/callout]] 영역으로 넘긴다.
- `trailing` + `hoverActions`를 둘 다 넘기지 않는다 — 메타 자리 하나뿐. 상시 메타(카운트·시간)와 hover 액션이 공존해야 하면 `trailing`에 배열로.
- unread/urgent를 색으로 중복 신호하지 않는다 — dot만. body 색을 fg-strong으로 올리거나 배경을 깔면 과잉.
- 자체적으로 padding·border·bg는 두지 않지만 **hover bg는 예외** — row 레벨 상호작용 피드백은 "가두는 chrome"이 아니라 "지금 이 줄" 신호이므로 default로 켜져 있다. pure 좌표에서 끄려면 색상 훅 `--list-item-hover-bg: transparent`.
- "댓글 남김" 같은 동사를 긴 서술로 늘이지 않는다. verb는 **동사 토큰** 하나. 긴 설명은 target 아래 2줄 body로 승격.

### Fallback
variant 애매하면 `activity`. layout 애매하면 `inline`. leading 애매하면 `from` 기반 Avatar(이니셜).

### 색상 훅 (컨테이너 단위 톤 조절)
MenuItem과 같은 패턴. 리스트 wrapper에 변수를 얹으면 안쪽 ListItem이 일괄 반응.

| 훅 | 대상 | 폴백 |
|---|---|---|
| `--list-item-fg` | 본문 서술 색 | `--fg` |
| `--list-item-from-fg` | from(누구) 색 | `--fg-strong` |
| `--list-item-meta-fg` | meta/상대시간 색 | `--fg-muted` |
| `--list-item-hover-bg` | row hover bg | `--hover` |

```css
/* 예: 조용한 활동 로그 — 메타·본문 전부 한 단계 뒤로 */
.quiet-activity {
  --list-item-fg: var(--fg-muted);
  --list-item-meta-fg: var(--fg-subtle);
}

/* 예: 긴급 알림 리스트 — unread dot을 warning 톤으로 */
.urgent-notifications {
  --list-item-unread: var(--warning);
}
```

### Props 시그니처
```tsx
<ListItem
  // 왼쪽
  leading={ReactNode}             // Avatar | Icon | 커스텀. 생략 가능 (system에서도 가능하면 Avatar fallback 권장)
  unread={boolean}                // 명시해야 톤 신호. undefined=중립, true=강조, false=뒤로

  // 본문 — 두 모드
  from={ReactNode}                // "회계팀" / "박지훈" / "ERP"
  body={ReactNode}                // 자유 서술 모드
  verb={ReactNode}                // "댓글 남김" — 액션 모드
  target={ReactNode}              // 대상. 링크 자리로 자주 쓰임
  surface={ReactNode}             // "Figma" · "GitHub" — target 뒤 작게 inline

  // 메타
  meta={ReactNode}                // "방금" · "12분". 오른쪽 끝 default
  trailing={ReactNode}            // meta 자리 커스텀 (ReactNode 또는 배열)
  hoverActions={ReactNode[]}      // row hover 시 등장. archive/snooze/⋯

  // 레이아웃·상호작용
  variant="activity | notification | mention | system"  // default: activity
  layout="inline | stacked"       // default: inline. stacked는 body 2줄.
  href={string}                   // row 전체 링크. asChild로 Link 위임.
  onClick={(e) => void}           // row 선택 핸들러
  asChild={boolean}               // <Link> 등에 위임
/>
```

### Variant 매트릭스
같은 anatomy, 다른 **기본 성격**. slot으로 못 바꾸는 자리만 variant로 바꾼다.
`unread`는 variant가 강제하지 않는다 — 명시해야 신호. 리드 개념이 없는 자리면 생략.

| variant | leading 기본 | hoverActions 전제 | 서술 모드 선호 | 쓰임 |
|---|---|---|---|---|
| `activity` | Avatar(from) | 없음 | verb+target | 최근 활동·히스토리 로그. GitHub/Linear timeline. 보통 unread 생략 |
| `notification` | Avatar(from) | archive/mark-read | from+body | 알림 센터·bell 드롭다운. unread 명시 권장 |
| `mention` | Avatar(from) | reply/resolve | from+body(인용) | 멘션·댓글 피드. body에 인용부호 자연스러움 |
| `system` | Icon(서비스 로고) | 없음 | from+body | ERP/CI/빌드 등 시스템 이벤트. 보통 unread 생략 |

### 금지 조합
- `verb` + `body` 동시 — 서술 중복
- `leading=null` + `unread=true` — dot이 혼자 떠서 "누구" 자리가 사라짐
- `trailing` + `hoverActions` — 메타 자리 충돌 (상시+hover면 trailing에 배열)
- `layout="inline"` + body 2줄 이상 — stacked로 승격
- `variant="system"` + Avatar(사람 이름) — system은 서비스 아이덴티티
- 한 리스트 안에 variant 혼용 — 리스트 톤은 하나로. 섞어야 하면 섹션으로 분리

### 조합 예시

```tsx
// 1) 최근 활동 피드 — verb+target 액션 서술
<ListItem
  leading={<Avatar name="박지훈" />}
  from="박지훈"
  verb="댓글 남김"
  target="ERP 2.0 사이드바 구조 확정"
  surface="Figma"
  meta="방금"
/>

// 2) 알림 센터 — unread + hoverActions
<ListItem
  variant="notification"
  leading={<Avatar name="회계팀" />}
  from="회계팀"
  body="외주비 세금계산서 결재 요청"
  meta="방금"
  unread
  hoverActions={[
    <IconButton name="archive" aria-label="보관" />,
    <IconButton name="check" aria-label="읽음 처리" />,
  ]}
/>

// 3) 멘션 — body에 인용 (stacked로 2줄)
<ListItem
  variant="mention"
  layout="stacked"
  leading={<Avatar name="장대표" />}
  from="장대표"
  body={<>&ldquo;@김희영 1:1 전에 자료 공유 부탁&rdquo;</>}
  meta="오전 9:12"
  unread
/>

// 4) 시스템 이벤트 — Icon leading, 사람 아님
<ListItem
  variant="system"
  leading={<Icon name="chart-line" />}
  from="ERP"
  body="주간 리포트 생성 완료"
  meta="3시간"
/>

// 4-b) 상태 색을 띤 아이콘 마크 leading — 성공/경고/실패 신호
<ListItem
  variant="system"
  leading={
    <ListItemLeadingIcon tone="success">
      <Icon name="seal-check" />
    </ListItemLeadingIcon>
  }
  from="CI"
  body="main 브랜치 배포 성공"
  meta="방금"
/>

// 5) pure 좌표 — 부모 리스트가 hairline으로 분리 (조립 공식 "패턴 C" 참고)
// li에 세로 padding + ListItem self-space 중화 둘 다 필요하다.
<ul className="pureFeed">
  {feed.map((f) => (
    <li key={f.id}>
      <ListItem
        leading={<Avatar name={f.from} />}
        from={f.from}
        body={f.body}
        meta={f.ago}
        unread={f.unread}
      />
    </li>
  ))}
</ul>
```

### 조립 — 부모 wrapper 공식
ListItem은 **self-contained 상쇄 공식**(`padding-block: --space-3` + `margin-block: -(--space-3)`)을 들고 있다. 부모가 공간을 안 걸어도 보장되는 안전장치지만, 조립할 때 아래 세 패턴을 혼동하면 세로가 과하거나 콘텐츠가 선에 붙는다.

**패턴 A — 부모가 간격 아예 안 걸음 (단독 사용):**
그대로 둬도 ListItem이 자체 공간을 가진다. hover hit area는 보장되지만 **리스트처럼 세로로 쌓이면 아이템끼리 바로 붙는다** — 리스트 자리면 패턴 B/C로.

**패턴 B — 부모 li에 padding만 걸고 ListItem self-space는 그대로:**
flex item 레이아웃에서 ListItem의 음의 margin이 레이아웃 박스를 축소시키지 못해 **공간이 두 번 쌓인다** (li padding + ListItem self-padding). 겉보기엔 세로가 과하게 커진다 — hairline과 콘텐츠 사이 호흡은 보이지만 리스트가 전반적으로 숨 막혀 보이면 이 상태다.

**패턴 C — li padding + ListItem self-space 중화 (권장, pure 좌표):**
부모 wrapper가 세로 공식을 완전히 책임지는 자리에서는 자식 선택자로 ListItem self-padding·margin을 둘 다 0으로 눌러 공식을 **하나로 통일**한다. 이게 "콘텐츠가 hairline에 붙지 않으면서도 세로가 과하지 않은" 유일한 조립.

```css
/* pure 좌표 — hairline 리스트 */
.activityList {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  --list-item-hover-bg: transparent; /* 가두는 chrome 회피 */
}
.activityList > li {
  padding-block: var(--space-3);     /* 세로 호흡은 li가 전담 */
  border-top: 1px solid var(--border-subtle, var(--border));
}
.activityList > li:last-child {
  border-bottom: 1px solid var(--border-subtle, var(--border));
}
/* ListItem self-space 중화 — 자식 선택자로 */
.activityList > li > * {
  padding-block: 0;
  margin-block: 0;
}
```

**조립 체크리스트 — 리스트에 쓰기 전 아래를 순서대로:**
1. 리스트인가? (하나만이면 그대로 둬도 OK)
2. 부모 wrapper가 세로 padding을 책임질 것인가? (hairline 리스트면 반드시 YES)
3. YES면 자식 선택자로 ListItem self-padding·margin을 중화했는가?
4. 완성 후 콘텐츠가 hairline/테두리에 **padding 없이 붙어 있지 않은가** 눈으로 확인.

### 관련
- [[components/avatar]] — leading의 default 렌더. system variant에서는 서비스 로고 Avatar.
- [[components/menu-item]] — hoverOnly 패턴을 동일한 메커니즘으로 재사용.
- [[components/badge]] — surface가 inline soft Badge로 렌더되는 경우.
- [[components/callout]] — body가 2줄을 넘고 CTA가 필요하면 Callout 영역.
- [[components/metric-card]] — 자신이 chrome을 지지 않고 부모가 분리를 담당하는 원칙(`bare` variant)과 같은 설계 철학.
- [[axes/density]] — compact에선 수직 padding/gap이 줄어 timeline이 조밀해짐.
- [[tokens/color]] — `--primary`(unread meta) · `--fg` · `--fg-strong` · `--fg-muted` · `--fg-subtle`만 사용.
- [[feedback_no_uppercase]] — verb·surface·meta 어디에도 uppercase 금지.
