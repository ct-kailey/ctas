# Badge

### 원칙
카운트·상태 라벨을 담는 최소 컴포넌트. 메뉴 아이템 옆 언리드 수, 사이드바 nav 옆 "new", 버튼 위 알림 카운트, 리스트 행의 상태 태그가 모두 이 컴포넌트를 공유한다. 콘텐츠(숫자/짧은 문자열)를 감싸는 얇은 껍데기 역할이라 아이콘·모션·인터랙션은 안 담는다 — 아이콘이 필요하면 [[components/chip]] 또는 [[components/tag]]를 검토.

크기는 폰트/컨트롤 위계에 종속되어 [[axes/density]]에 반응. **variant 규칙**: `solid`는 알림/언리드 강조 전용이라 `--primary`만, `inverse`는 어두운 표면(선택된 FilterButton 등) 위 라벨 전용이라 `--bg`+`--fg`만 — 둘 다 status와 조합 금지. `soft`는 기본 `--primary` 기반이며 `status` prop으로 `--success` · `--warning` · `--destructive` · `--info`에 매핑. 라운드는 `shape` prop — 기본 `square`는 sm/md 공통 `--radius-xs`(Shape 축이 커도 md가 pill로 보이지 않도록 sm에 고정), 완전 pill이 필요하면 `shape="pill"`로 `--radius-full`.

### Do
- **수치는 우측 슬롯**: `MenuItem`, 리스트 행, 카드 헤더의 trailing 위치에 넣는다. 언리드 수·미확인 수·중요 태그 위계.
- **콘텐츠 폭 그대로 흐르는 사각 라벨**: 정원·pill 아님. `--radius-xs`로 조여진 사각 캡슐(sm/md 공통). 1글자든 여러 글자든 텍스트 크기에 붙어 자연스럽게 늘어남.
- **뜻이 명확한 문자열만**: `new`, `beta`, `12` 처럼 짧고 자명한 콘텐츠. 3~4글자를 넘기지 않는다.
- **size는 붙는 컴포넌트에 맞춘다**: `MenuItem` `md` 옆이면 `sm`, `MenuItem` `lg`나 큰 카드 옆이면 `md`. 라벨 폰트 위계보다 커지지 않게.
- **variant는 강조 위계로 선택**: 지금 반드시 봐야 하는 알림·언리드는 `solid`(primary만), 그 외 모든 라벨(온화한 강조·상태·카운트)은 `soft`.
- **status는 soft 전용**: 성공/경고/삭제/정보 뜻이 정확할 때만 `soft`에 status를 얹는다. 브랜드 톤을 "예쁘게" 쓰려고 status를 남용하지 않는다.

### Don't
- 문장이나 아이콘을 넣지 않는다 — 그건 [[components/chip]] · [[components/tag]] · [[components/callout]]의 몫.
- 상호작용(클릭·hover 툴팁 등)을 붙이지 않는다. Badge는 순수 시각 요소.
- **`solid` + `status` 조합 금지**: solid는 primary만 사용. 상태색을 채운 solid 라벨이 필요하면 [[components/chip]]/[[components/tag]] 검토. (런타임에서 status를 무시하고 dev warning.)
- 색을 hex/tailwind 클래스로 직접 지정하지 않는다. 성공·경고·삭제·정보 외의 색상 슬롯이 필요하면 임의로 만들지 말고 [[components/chip]] · [[components/tag]] 검토.
- `--primary-fg` 같은 존재하지 않는 토큰을 쓰지 않는다. solid 위 텍스트는 `--bg` (Button primary와 동일 규칙).

### Fallback
size 애매하면 `sm`, variant 애매하면 `soft`. `solid`는 "지금 봐야 하는 알림"임이 확실할 때만.

### 관련
- [[components/menu-item]] · [[components/sidebar]] — 가장 흔한 사용처. trailing 슬롯 배지 카운트.
- [[components/button]] — solid 위 텍스트 색을 `--bg`로 두는 규칙 공유.
- [[components/chip]] · [[components/tag]] — 아이콘·상태 색·인터랙션이 필요하면 여기로.
- [[tokens/color]] — `--primary` · `--bg` · `--secondary-fg`
- [[axes/density]] — 폰트·min-height가 축에 반응

### Props 시그니처
```tsx
<Badge
  size="sm | md"                                       // default: sm
  variant="solid | soft | inverse"                     // default: solid
  status="success | warning | destructive | info"      // optional — 상태 뜻이 정확할 때만
  shape="square | pill"                                // default: square
>
  {children}                                           // 짧은 문자열/숫자
</Badge>
```

### 상태 매트릭스
`solid`는 primary만. `soft`는 status에 따라 상태 토큰으로 스왑된다.

| variant | 배경 | 텍스트 | 용도 |
|---|---|---|---|
| `solid` | `--primary` | `--bg` (Mode 반전) | 지금 봐야 하는 강조: 언리드, 알림 카운트 (**status 조합 불가**) |
| `soft`  | `--primary` 8% 알파 | `--secondary-fg` (Palette=mono면 무채색) | 온화한 상태 라벨: "new", "beta" |
| `soft` + `success` / `warning` / `destructive` / `info` | 각 상태 토큰 8% 알파 | 각 상태 토큰 | 뜻이 명확한 상태 라벨 |
| `inverse` | `--bg` | `--fg` | **어두운 표면 위에서만 사용** — 선택된 FilterButton 안 카운트 등 (**status 조합 불가**) |

### Size 가이드
크기는 텍스트 line-height + padding으로 자연히 결정된다. `shape="square"`(기본)는 size별 radius로 조여진 사각 라벨, `shape="pill"`은 좌우 반원 캡. 1글자든 여러 글자든 콘텐츠 폭 그대로 흐른다.

| size | padding (v · h) | font-size | radius (square) | 언제 |
|---|---|---|---|---|
| `sm` | 2 · 4 | `--text-xs` | `--radius-xs` | MenuItem sm/md 옆, 리스트 · 사이드바 |
| `md` | 4 · 6 | `--label-sm-size` | `--radius-xs` | MenuItem lg 옆, 카드 헤더, 페이지 타이틀 |

`shape="pill"`이면 size와 무관하게 `--radius-full`. 라벨 성격이 &ldquo;메타/카테고리&rdquo;가 아니라 &ldquo;알림 카운트/도트&rdquo;에 가까울 때만 pill.

### Solid vs Soft — 언제 뭘 쓰나
Badge의 위계는 **두 갈래**로 나뉜다. 헷갈리면 이 표를 먼저 본다.

| variant | 뜻 | 언제 쓰나 | 예시 라벨 |
|---|---|---|---|
| `solid` | **"지금 반드시 봐야 함"** — 시각적 알림 | 언리드 메시지 수, 미확인 알림, 처리 대기 카운트. 사용자가 방치하면 안 되는 것. | `3`, `12`, `99+` |
| `soft`  | **"이 아이템의 속성/상태"** — 조용한 라벨 | 카테고리 태그, "new"·"beta" 배지, API 상태(성공/경고/삭제/정보). 정보성 표기. | `new`, `beta`, `draft`, `API` |

한 화면에 `solid`가 너무 많이 보이면 안 된다 — "알림"이라는 뜻이 희석된다. Sidebar 100개 항목 중 언리드가 있는 3~4개만 `solid`, 나머지는 아예 배지 없음이 정상.

### 조합 예시
```tsx
// SOLID — 언리드 카운트 (알림)
<MenuItem
  leadingActions={[<Icon name="chat" />]}
  trailingActions={[<Badge variant="solid">3</Badge>]}
>#general</MenuItem>

<MenuItem
  leadingActions={[<Icon name="bell" />]}
  trailingActions={[<Badge variant="solid">12</Badge>]}
>알림</MenuItem>

// SOFT — 조용한 상태/카테고리 라벨
<MenuItem asChild active leadingActions={[<Icon name="star" />]}
  trailingActions={[<Badge variant="soft">new</Badge>]}
>
  <Link href="/whats-new">What&apos;s new</Link>
</MenuItem>

<div className="card-header">
  <h3>Beta features <Badge size="md" variant="soft">beta</Badge></h3>
</div>

// SOFT + STATUS — 뜻이 명확한 상태 라벨
<Badge variant="soft" status="success">API</Badge>
<Badge variant="soft" status="info">draft</Badge>
<Badge variant="soft" status="warning">deprecated</Badge>
<Badge variant="soft" status="destructive">3</Badge>
```
