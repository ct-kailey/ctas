# TableRowEdit

### 원칙
Notion·Excel 톤의 **edit 모드** 행. [[components/table-row]]가 "읽는 행"(행 전체 클릭)이라면 이 컴포넌트는 "편집 가능한 셀 그리드" — 상호작용 단위가 **행이 아니라 셀**이다. 세로 구분선이 **강제**되는 유일한 Row 타입으로, 사용자가 edit 모드임을 즉시 인지할 수 있게 한다.

**외곽은 line, 높이는 md로 고정** — 사이즈·variant 축이 없다. 밀도(sm/lg)나 pill(plate) 조합은 edit의 정체성(스프레드시트 톤, 세로선 그리드)과 어긋나 지원하지 않는다. 레이아웃·fade mask는 [[components/table-row]]의 CSS를 상속 — 헤더와의 폭·정렬 동기화 규칙은 동일. 셀 안쪽 콘텐츠는 [[components/table-cell]] 포맷터 또는 Input/Select/DatePicker 같은 편집 컨트롤을 호출 측에서 `columns[].render(data)`로 꽂아 쓴다.

### Do
- **columns는 헤더와 1:1로 공유**: [[components/table-row]]와 동일한 `TableRowColumn<T>[]`. 폭·정렬·flex 동기화는 그대로 작동. 헤더는 반드시 `variant="line"`과 짝.
- **세로 구분선은 자동**: 첫 데이터 셀 왼쪽엔 선 없음, 그 뒤로 `--border` hairline이 자동으로 들어감. `selectable`이 있으면 체크박스 셀과 첫 데이터 셀 사이에도 선이 들어가 "선택 영역 ↔ 편집 영역" 구분.
- **`activeCellKey`로 '지금 편집 중인 셀' 단일화**: 호출 측에서 하나의 셀 key만 넘김. 포커스·클릭 시 `onCellActivate(key)`가 호출되므로 상위에서 그 값을 state로 받아 다시 돌려주는 패턴. 활성 셀은 `--primary-subtle` 배경 + 1px inset ring.
- **셀 콘텐츠는 `TableCell*` + 편집 컨트롤**: 표시 전엔 [[components/table-cell]] 포맷터, 활성 상태로 바뀌면 [[components/input]]·[[components/select]]·[[components/date-picker]] 등으로 교체하는 패턴. Row는 레이아웃만 관장.
- **selectable은 bulk 액션용**: 체크박스로 여러 행을 모아 복사/삭제. [[components/table-row-select]]와 선택 톤(`--primary-subtle`)이 동일 — 멀티셀렉션 신호 일관성.
- **읽기 전용 셀은 `columns[].editable: false`로 명시**: SKU·식별자·계산 파생값처럼 "값을 보여주지만 바꿀 수 없는" 셀. 커서는 default, hover/active 톤 없음, 포커스 불가, 세로 구분선 대상에서도 제외됨. 첫 "편집 가능" 셀 왼쪽엔 자동으로 선이 없음.
- **편집 컨트롤은 호출 측 책임**: Input은 `Enter` 커밋 / `Esc` 취소 / `Tab` 다음 셀로 쓰는 게 Notion/Excel 표준. Select는 `defaultOpen`으로 셀 활성화와 동시에 open해 한 번의 클릭으로 선택까지 끝나게. `autoFocus` 대신 `focus({ preventScroll: true })` + `select()`를 쓸 것 — autoFocus는 scrollIntoView로 페이지가 튐.

### Don't
- 행 전체에 `onClick`/`href`를 걸지 않는다. edit 모드는 **셀**이 상호작용 단위 — 행 전체 핸들러가 있으면 셀 활성화와 충돌해 포커스/편집이 꼬인다. 행 라우팅이 필요하면 [[components/table-row]]를 쓸 것.
- 세로 구분선을 끄지 않는다. edit 모드의 **정체성** — 끄면 navigate 모드와 시각 구분이 사라져 사용자가 편집 가능 여부를 인지하지 못함.
- 셀 안에 또 다른 anchor/button을 중첩하지 않는다. 셀 자체가 포커스 타겟(`tabIndex=0`) — nested interactive는 접근성·키보드 탐색 파괴.
- `activeCellKey`를 여러 개로 동시에 유지하지 않는다. "지금 편집 중"은 한 번에 하나. 멀티셀 선택이 필요하면 별도 selection state로 분리(미래 기능).
- hover가 selected/active 셀을 덮지 않는다 — 컴포넌트 CSS가 보장([[feedback/hover-over-active]]).
- `background`를 직접 지정하지 않는다. selected/active는 축 토큰(`--primary-subtle`)으로 자동.
- 사이즈·variant를 쓰려 하지 않는다 — 애초에 prop이 없다. 밀도 다른 테이블이 필요하면 edit 대신 [[components/table-row]]의 size로 해결.

### Fallback
- 셀 콘텐츠 애매하면 [[components/table-cell]] 중 `TableCellText`. 편집 시만 [[components/input]]으로 교체.
- `activeCellKey` 미지정 → 아무 셀도 활성 아님(모두 포커스 가능 상태만 유지).

### 관련
- [[components/table-row]] — navigate 모드(행 전체 클릭). edit과 스펙 공유.
- [[components/table-row-select]] — select 모드(체크박스 bulk 선택). selected 톤 일관.
- [[components/table-header]] — columns·order·widths·selectable 세트 (variant=line과 짝)
- [[components/table-cell]] — 각 셀 콘텐츠 포맷터
- [[components/input]], [[components/select]], [[components/date-picker]] — 활성 셀의 편집 컨트롤로 꽂음
- [[axes/density]] — space-* 토큰을 통해 자동 반영 (명시적 size 축 없음)
- [[tokens/color]] — `--primary-subtle`/`--primary`(active cell), `--border`(세로 구분선), `--hover`(셀 hover), `--fg-disabled`
- [[feedback/hover-over-active]] — selected/active 위 hover가 상태 톤을 덮지 않음

### Props 시그니처
```tsx
type TableRowColumn<T> = TableHeaderColumn & {
  render?: (data: T) => ReactNode;              // 미지정 시 data[key]
  editable?: boolean;                           // 기본 true. false면 read-only
  resizable?: boolean;                          // 폭 drag 조절 opt-in (widths로 state 커밋)
  movable?: boolean;                            // 순서 drag 변경 opt-in (order로 state 커밋)
  removable?: boolean;                          // 헤더 액션으로 삭제 opt-in
  pinned?: "left" | "right";                    // 가로스크롤 시 좌/우 sticky
};

<TableRowEdit<T>
  size="sm | md"                                // default: md (sm=36, md=40)
  columns={TableRowColumn<T>[]}                 // 헤더와 동일 스펙 + render + editable + …
  order={string[]}                              // 헤더와 공유
  widths={Record<string, number>}               // 헤더와 공유
  data={T}

  selectable={boolean}                          // 맨 앞 체크박스
  selected={boolean}
  onSelectedChange={(next: boolean) => void}

  activeCellKey={string}                        // 지금 편집 중인 셀 key
  onCellActivate={(key: string) => void}        // 편집 가능 셀 클릭/Enter/Space 시

  disabled={boolean}
/>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | 세로 구분선 + 행 하단 hairline |
| cell hover | 해당 셀만 `--hover` 배경 |
| cell active | `--primary-subtle` 배경 + 1px inset ring (`--primary`) |
| cell focus-visible (keyboard, not active) | `--ring-shadow` 외곽 ring |
| selected (행) | 행 전체 `--primary-subtle` 배경 |
| disabled | `--fg-disabled` 톤, 셀 포커스 불가 |

### 조합 예시
```tsx
// 가장 단순 — 셀 하나씩 활성화되는 스프레드시트 톤
const [activeCell, setActiveCell] = useState<string | undefined>();

<TableHeader variant="line" columns={headerCols} />
{rows.map((row) => (
  <TableRowEdit
    key={row.id}
    columns={rowCols}
    data={row}
    activeCellKey={activeCell}
    onCellActivate={setActiveCell}
  />
))}

// 활성 셀만 Input으로 교체하는 패턴
const makeEditColumn = <T,>(col: TableHeaderColumn, field: keyof T): TableRowColumn<T> => ({
  ...col,
  render: (d) =>
    activeCell === col.key && focusedRowId === (d as { id: string }).id ? (
      <Input defaultValue={String(d[field])} autoFocus onBlur={commit} />
    ) : (
      <TableCellText>{String(d[field])}</TableCellText>
    ),
});

// 체크박스 selection + 셀 편집 동시 사용
<TableHeader
  variant="line"
  columns={headerCols}
  selectable
  selectAllChecked={allSelected}
  onSelectAllChange={setAllSelected}
/>
{rows.map((row) => (
  <TableRowEdit
    key={row.id}
    columns={rowCols}
    data={row}
    selectable
    selected={selected.has(row.id)}
    onSelectedChange={(next) => toggleOne(row.id, next)}
    activeCellKey={focusedRowId === row.id ? activeCell : undefined}
    onCellActivate={(key) => {
      setFocusedRowId(row.id);
      setActiveCell(key);
    }}
  />
))}
```
