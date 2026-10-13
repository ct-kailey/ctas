# TableHeader

### 원칙
데이터 그리드 상단의 columnheader 행. 시각 스타일(`line`/`plate`) × 두 기능(`resizable`/`reorderable`) 각각 on/off = 총 8조합을 하나의 컴포넌트로 담는다. 데이터 로딩·정렬 로직·행 렌더는 상위 Table이 책임지고, 이 컴포넌트는 columnheader 시각·상호작용만 담당한다.

`reorderable=on`이면 각 셀이 hover 배경 + `cursor: grab`으로 반응하고, `off`면 hover 반응이 사라진다. reorder는 @dnd-kit/sortable로 처리해 키보드/터치도 지원한다.

### Do
- **variant 선택 기준**: 페이지 표면과 자연스럽게 이어지는 얇은 헤더는 `line`, 카드 안에서 위치가 명확해야 하는 헤더는 `plate`. `line`은 sticky 하단 hairline으로 흐름을 만들고, `plate`는 라운드 컨테이너로 시선을 가둔다.
- **정렬은 셀별 opt-in**: 컬럼마다 `sortable: true`로 개별 활성화. 정렬 인디케이터는 2-state (`asc` ↔ `desc`) — 라벨 옆 caret이 방향 표시.
- **컨트롤드 3종은 세트로**: `order`/`widths`/`sort` 중 하나라도 controlled로 넘기면 대응 `on*Change`도 반드시 함께. uncontrolled 사용도 지원(각 상태 내부 보관).
- **width 최소 하한**: 사용자가 resize로 아무리 줄여도 48px 밑으로는 안 내려간다(컴포넌트가 강제). 컬럼 라벨이 잘리기 시작하는 지점의 안전선.
- **checkbox 셀은 `selectable` prop**: 셀 순서 재정렬 대상에서 자동 제외되어 항상 맨 앞 고정.
- **컬럼 매니저 버튼은 `columnManager` prop**: 우측 끝 고정 IconButton (`Icon name="columns"`). show/hide 다이얼로그 트리거용.
- **sortable + reorderable 공존**: 라벨 클릭(sort)과 드래그(reorder)는 8px pointer 이동 threshold로 자동 분기 — 짧게 누르면 sort, 끌면 reorder.

### Don't
- 이 컴포넌트 안에서 데이터를 정렬하지 않는다. `onSortChange`만 발화하고 정렬은 상위 Table의 책임.
- variant 시각을 `background`/`border` 직접 지정으로 커스터마이즈하지 않는다 — Palette·Mode 축 스왑이 깨진다. 색이 필요하면 축·프리셋에 정의.
- resize handle 폭을 CSS로 좁히지 않는다 — 8px 히트 영역이 접근성 최소치.
- 셀 안에 두 개 이상의 인터랙션 요소(라벨 정렬 + 아이콘 필터 등)를 넣지 않는다. 셀 = 하나의 columnheader.
- `reorderable=off`에서 hover 배경을 억지로 살리지 않는다 — "이동 불가한데 반응만 있으면" 의미 없는 시각 노이즈.
- 3-state sort(asc→desc→none)로 확장하지 않는다. 정렬 해제는 "다른 컬럼 클릭"으로 대체 — 클릭당 결과가 명확해야 함.

### Fallback
- variant 애매하면 `line`. 페이지에 자연스럽게 얹히는 기본 형태.
- resizable/reorderable 애매하면 둘 다 `off`. 나중에 필요하면 켜는 게 안전.
- sort 초기값 애매하면 `null` (미정렬) — 다만 이후엔 2-state로 고정.

### 관련
- [[components/checkbox]] — `selectable` 셀에서 사용
- [[components/icon-button]] — `columnManager` 버튼
- [[components/icon]] — sort caret / column manager icon
- [[axes/density]] — Density=`compact`일 때 헤더 높이와 셀 padding이 자동으로 좁아짐
- [[axes/shape]] — `plate` variant의 컨테이너 radius가 Shape 축에 반응
- [[tokens/color]] — `--hover`(reorderable hover) / `--border`(line tick / hairline) / `--fg-subtle`→`--fg-strong`(sort icon)

### Props 시그니처
```tsx
type TableHeaderColumn = {
  key: string;                                   // 안정적 id (reorder/width 상태 키)
  label: ReactNode;
  width?: number | string;                       // px number 또는 CSS 값
  minWidth?: number | string;
  flex?: boolean;                                // 남은 공간 차지
  sortable?: boolean;                            // 라벨 옆 sort caret
  align?: "start" | "center" | "end";
  resizable?: boolean;                           // false면 상위 resizable=true여도 이 column handle 숨김. 기본 true
  movable?: boolean;                             // false면 상위 reorderable=true여도 이 column drag 불가. 기본 true
  pinned?: "left" | "right";                     // 가로스크롤 시 좌/우 끝에 sticky. reorder 자동 제외
};

type TableHeaderSortState = { key: string; direction: "asc" | "desc" } | null;

<TableHeader
  variant="line | plate"                         // default: line
  columns={TableHeaderColumn[]}

  resizable={boolean}                            // 전 셀 resize handle
  reorderable={boolean}                          // 전 셀 drag reorder + hover

  selectable={boolean}                           // 맨 앞 체크박스 셀
  selectAllChecked={boolean}
  selectAllIndeterminate={boolean}
  onSelectAllChange={(next: boolean) => void}

  order={string[]}                               // controlled column 순서
  onOrderChange={(next: string[]) => void}
  widths={Record<string, number>}                // controlled column 폭
  onWidthsChange={(next: Record<string, number>) => void}
  sort={TableHeaderSortState}                    // controlled sort 상태
  onSortChange={(next: TableHeaderSortState) => void}

  columnManager={boolean}                        // 우측 끝 컬럼 관리 IconButton
  onColumnManagerClick={() => void}
/>
```

### Variant × Feature 매트릭스
| variant | resizable | reorderable | 시각 |
|---|---|---|---|
| `line` | off | off | 하단 hairline만 |
| `line` | on | off | 셀 좌측 세로 tick (눈금자) + resize handle |
| `line` | off | on | 하단 hairline + 셀 hover 배경, cursor-grab |
| `line` | on | on | 위 둘 조합 |
| `plate` | off | off | 라운드 컨테이너 (bg-muted) |
| `plate` | on | off | hover 시 셀 우측 세로선 (opacity 상승) |
| `plate` | off | on | 셀 hover 배경, cursor-grab |
| `plate` | on | on | 위 둘 조합 |

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | variant 기본 색·배경 |
| cell hover (reorderable=on) | `--hover` 배경, `cursor: grab` |
| cell dragging | `--bg-muted` 배경, `cursor: grabbing`, z 상승 |
| resize handle hover (plate) | 우측 세로선 opacity 0 → 0.5 |
| sort inactive | caret-up-down 아이콘, `--fg-subtle` |
| sort asc | caret-up 아이콘, `--fg-strong` |
| sort desc | caret-down 아이콘, `--fg-strong` |

### 조합 예시
```tsx
// 가장 단순 — 라인 + 정렬 없는 기본 헤더
<TableHeader
  columns={[
    { key: "name", label: "이름", width: 200 },
    { key: "email", label: "이메일", flex: true, minWidth: 240 },
    { key: "role", label: "역할", width: 120 },
  ]}
/>

// 리서치 트레이스 뷰 — line + resize + 체크박스, 일부 컬럼만 정렬 가능
<TableHeader
  variant="line"
  resizable
  selectable
  selectAllChecked={allSelected}
  onSelectAllChange={setAllSelected}
  columns={[
    { key: "timestamp", label: "Timestamp", width: 140, sortable: true },
    { key: "flow", label: "Flow", width: 260 },
    { key: "input", label: "Input", width: 220 },
    { key: "output", label: "Output", flex: true, minWidth: 240 },
    { key: "status", label: "Status", width: 92 },
    { key: "duration", label: "Duration", width: 84, sortable: true },
    { key: "cost", label: "Cost", width: 84, sortable: true },
  ]}
  sort={sort}
  onSortChange={setSort}
/>

// 법무 관리 뷰 — plate + 순서 변경 + 리사이즈 + 컬럼 매니저
<TableHeader
  variant="plate"
  resizable
  reorderable
  columnManager
  onColumnManagerClick={() => setColManagerOpen(true)}
  columns={[
    { key: "type", label: "권리", width: 80 },
    { key: "ourRef", label: "Our Ref", width: 150 },
    { key: "status", label: "상태", width: 200, minWidth: 200 },
    { key: "deadline", label: "법정 마감일", width: 170, minWidth: 170 },
    { key: "client", label: "의뢰인", width: 140 },
    { key: "applicant", label: "출원인", width: 140 },
    { key: "title", label: "출원명", flex: true, minWidth: 300 },
    { key: "history", label: "히스토리", width: 300 },
    { key: "appNo", label: "출원번호", width: 160 },
    { key: "owner", label: "담당자", width: 120 },
  ]}
  order={order}
  onOrderChange={setOrder}
  widths={widths}
  onWidthsChange={setWidths}
/>
```
