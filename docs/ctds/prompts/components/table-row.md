# TableRow

### 원칙
데이터 그리드의 한 행. [[components/table-header]]와 같은 `columns` 스펙을 공유해 폭·정렬·순서가 자동으로 맞도록 설계된다. 이번 버전은 **navigate 모드** — 행 전체가 클릭 요소가 되어 상세 라우팅·패널 오픈을 담당한다. select 모드(Google Drive 스타일 체크박스 토글), edit 모드(Notion·Excel 스타일 셀 편집)는 각각 [[components/table-row-select]], [[components/table-row-edit]]로 분리.

행 자체는 레이아웃만 통제한다 — 셀 안쪽 콘텐츠는 [[components/table-cell]] 세트(`TableCellText`/`TableCellNumber`/`TableCellBadge`/`TableCellImage`/`TableCellIcon`/`TableCellAvatar`/`TableCellLink`/`TableCellMeter`)로 꽂아 쓴다. 콘텐츠 포맷터와 행 레이아웃을 분리해 셀 타입이 늘어도 Row API는 흔들리지 않는다.

### Do
- **columns는 헤더와 1:1로 공유**: 같은 `TableHeaderColumn[]`에 `render(data)` 콜백을 얹은 `TableRowColumn<T>[]`로 전달. 폭·정렬·flex가 자동 동기화되어 "헤더-아이템은 항상 세트" 원칙이 유지됨.
- **`order` / `widths`도 헤더와 공유**: 헤더에서 drag reorder·resize한 결과를 그대로 Row에 넘기면 즉시 반영. uncontrolled면 columns 원본 순서·width 사용.
- **variant는 헤더와 짝 맞춤**: `line` 헤더 아래엔 `line` 행, `plate` 헤더 아래엔 `plate` 행. 섞으면 라운드/구분 규칙이 깨짐.
- **size로 밀도 조절**: `sm`(xs 폰트/control-h-sm) → 데이터 테이블·대시보드, `md`(sm 폰트/control-h-md) → 표준, `lg`(base 폰트/control-h-lg) → 콘텐츠 중심 리스트. padding은 세 사이즈 공유.
- **라우팅은 `href`, 액션은 `onClick`**: `href` 있으면 anchor로 렌더(네이티브 Cmd+click·prefetch 등 활용), 없으면 `role="button"` + Enter/Space 키보드 지원. 둘 다 없으면 단순 디스플레이 행.
- **`active`는 현재 보고 있는 상세의 반영**: 상세 패널이 열린 행에만 적용. hover가 active를 덮지 않도록 CSS가 보장.
- **체크박스 셀은 `selectable` prop**: 헤더 selectable과 짝. 체크박스 영역 클릭은 자동으로 행 클릭 전파 차단.
- **셀 안에 포맷터만**: `columns[].render` 안에는 `TableCell*` 포맷터 또는 1개의 레벨 안쪽 요소까지. 여러 인터랙션 요소(링크·버튼·메뉴)를 셀 안에 넣지 않는다 — 행 전체가 이미 클릭 요소.

### Don't
- 행 안에 또 다른 anchor/button을 중첩하지 않는다. nested interactive는 접근성 깨지고 pointer 이벤트도 꼬임. 셀별 액션이 필요하면 edit 모드(별도 컴포넌트)로. `TableCellLink`는 anchor를 포함하므로 `href`/`onClick` 있는 navigate 행에서 쓰지 말 것 — display-only 행이나 [[components/table-row-edit]]에서만 허용.
- `line` 행에 `background`를 직접 지정해 활성/hover 색을 커스텀하지 않는다. `active` prop + 축 토큰(hover) 조합으로 해결.
- `size`로 셀 padding을 바꾸지 않는다 — 사이즈는 세로 폭·폰트만. 셀 안 요소(badge·chip)의 리듬이 깨짐.
- 셀 사이 세로 구분선을 넣지 않는다. navigate 모드는 "읽는 행" — 세로 구분선은 [[components/table-row-edit]](엑셀/Notion 스타일 셀 편집) 전용 시각이다.
- disabled 행에 onClick 로직을 걸지 않는다. 컴포넌트가 pointer-events·tabIndex 모두 차단하므로 상위에서 가드 불필요.
- Row 안에 긴 설명문을 두 줄 이상으로 넣지 않는다. 셀은 1-line ellipsis가 기본 — 긴 콘텐츠는 상세 패널로.

### Fallback
- 사이즈 애매하면 `md`. 데이터 테이블 표준.
- variant 애매하면 `line`. 페이지 흐름에 자연스럽게 섞임.
- 셀 포맷터 애매하면 `TableCellText`. 톤만 default/strong/muted/subtle로 선택.
- 행 전체가 클릭 아닌 경우 — `href`/`onClick` 둘 다 생략하면 단순 디스플레이 행이 됨.

### 관련
- [[components/table-header]] — columns·order·widths·selectable 세트
- [[components/table-cell]] — 각 셀 콘텐츠 포맷터 (Text/Number/Image/Tag/Badge/Icon/Avatar/Link/Meter)
- [[components/checkbox]] — selectable 셀
- [[axes/density]] — 세 사이즈 모두 Density 축 scale에 반응
- [[axes/shape]] — plate variant의 radius가 Shape 축에 반응
- [[tokens/color]] — `--hover`(행 hover 배경), `--border`(line hairline), `--fg-disabled`(disabled 톤)

### Props 시그니처
```tsx
type TableRowColumn<T> = TableHeaderColumn & {
  render?: (data: T) => ReactNode;              // 미지정 시 data[key]
  editable?: boolean;                           // [[components/table-row-edit]] 전용. false면 read-only
  resizable?: boolean;                          // 헤더 drag로 column 폭 조절 opt-in. widths로 state 커밋
  movable?: boolean;                            // 헤더 drag로 column 순서 변경 opt-in. order로 state 커밋
  removable?: boolean;                          // 헤더 context menu / × 액션 노출 opt-in
  pinned?: "left" | "right";                    // 가로스크롤 시 좌/우에 sticky. reorder/remove 자동 제외
};

<TableRow<T>
  variant="line | plate"                        // default: line (헤더와 짝)
  size="sm | md | lg"                           // default: md
  columns={TableRowColumn<T>[]}                 // 헤더와 동일 스펙 + render
  order={string[]}                              // 헤더와 공유
  widths={Record<string, number>}               // 헤더와 공유
  data={T}                                      // 행 데이터 — columns[].render(data)로 사용

  selectable={boolean}                          // 맨 앞 체크박스
  selected={boolean}
  onSelectedChange={(next: boolean) => void}

  active={boolean}                              // 상세가 열린 행 — hover 톤
  disabled={boolean}                            // 톤 다운 + 상호작용 차단

  // Navigate — 둘 중 하나만 (anchor OR button role)
  href={string}                                 // 있으면 <a>로 렌더
  onClick={(e) => void}                         // 있으면 <div role="button">로 렌더
/>
```

### Variant × Size 매트릭스
| variant | size | 세로 폭 | 폰트 | 사용처 |
|---|---|---|---|---|
| `line` | `sm` | control-h-sm | text-xs | 데이터 테이블 · 로그 뷰 |
| `line` | `md` | control-h-md | text-sm | 표준 리스트 뷰 (기본) |
| `line` | `lg` | control-h-lg | text-base | 콘텐츠 중심 리스트 |
| `plate` | `sm` | control-h-sm | text-xs | 밀도 높은 카드 안 리스트 |
| `plate` | `md` | control-h-md | text-sm | 카드 안 표준 리스트 |
| `plate` | `lg` | control-h-lg | text-base | 큰 썸네일 아이템 리스트 |

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | variant 기본 색·배경 |
| hover (interactive) | 전체 행 배경 `--hover` |
| active | 전체 행 배경 `--hover` (hover가 덮지 않음) |
| focus-visible (keyboard) | `--ring-shadow` 외곽 ring |
| disabled | `--fg-disabled` 톤, pointer-events 없음 |

### 조합 예시
```tsx
// 가장 단순 — line / navigate / 체크박스 없음
<TableHeader variant="line" columns={headerCols} />
{rows.map((row) => (
  <TableRow
    key={row.id}
    variant="line"
    columns={rowCols}
    data={row}
    onClick={() => openDetail(row.id)}
    active={row.id === activeId}
  />
))}

// Google Drive 스타일 — 체크박스로 선택, 나머지 영역은 라우팅
<TableHeader
  variant="line"
  columns={headerCols}
  selectable
  selectAllChecked={allSelected}
  onSelectAllChange={setAllSelected}
/>
{rows.map((row) => (
  <TableRow
    key={row.id}
    variant="line"
    columns={rowCols}
    data={row}
    selectable
    selected={selected.has(row.id)}
    onSelectedChange={(next) => toggleOne(row.id, next)}
    href={`/trace/${row.id}`}
  />
))}

// 법무 관리 뷰 — plate + 큰 썸네일 + 태그 셀 + 통화 포맷터
<TableHeader variant="plate" columns={legalHeaderCols} />
{legalRows.map((row) => (
  <TableRow
    key={row.id}
    variant="plate"
    size="md"
    columns={legalRowCols}
    data={row}
    onClick={() => router.push(`/legal/${row.id}`)}
  />
))}

// columns에 render 콜백을 심는 방식
const rowCols: TableRowColumn<LegalRow>[] = [
  { ...headerCols[0], render: (d) => <TableCellBadge status={d.typeStatus}>{d.typeLabel}</TableCellBadge> },
  { ...headerCols[1], render: (d) => <TableCellText tone="muted">{d.ourRef}</TableCellText> },
  { ...headerCols[2], render: (d) => <TableCellText tone="strong">{d.title}</TableCellText> },
  { ...headerCols[3], render: (d) => (
      <span style={{ display: "inline-flex", gap: "var(--space-1)" }}>
        {d.tags.map((t) => <TableCellBadge key={t} status="info">{t}</TableCellBadge>)}
      </span>
    ),
  },
  { ...headerCols[4], render: (d) => (
      <TableCellNumber value={d.cost} format={{ style: "currency", currency: "KRW" }} locale="ko-KR" />
    ),
  },
];
```
