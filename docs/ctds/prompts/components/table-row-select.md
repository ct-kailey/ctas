# TableRowSelect

### 원칙
"선택 모드" 데이터 행. [[components/table-row]]의 **navigate 모드**가 "클릭 = 라우팅/상세 열기"였다면, select 모드는 **"클릭 = 선택 토글"** 하나로 묶인다. 체크박스 UI는 **쓰지 않음** — 선택된 행 자체가 primary 톤의 옅은 배경으로 명확히 구분된다. 행의 어느 지점을 눌러도, 키보드 Space를 눌러도 전부 동일한 토글.

레이아웃·사이즈·variant·fade mask·폭 공식은 [[components/table-row]]와 **완전히 공유** — 같은 `TableRowColumn<T>[]`를 받고, 같은 2단계(cellSlot→cell→cellInner) 구조로 렌더된다. 차이는 "선택 상태 시각"과 "클릭 핸들러의 의미"뿐.

### Do
- **columns는 TableRow와 동일 스펙**: 같은 `TableRowColumn<T>[]`를 Header와 Row 모두에 전달. 폭·정렬·render가 자동 동기화.
- **체크박스 UI 없음**: 행 자체가 토글 영역 — 선택된 상태는 배경 톤으로만 표현. 헤더에도 `selectable=false` (기본).
- **선택 상태 배경 = hover 톤**: `--hover`(중성 알파). TableRow(navigate)의 active와 같은 토큰 체계 — "지금 포커스된/선택된 행" 신호가 컴포넌트 간 일관되게 유지됨.
- **hover가 selected를 덮지 않도록**: selected 위에서 hover해도 배경 톤 유지. [[feedback/hover-over-active]] 원칙과 정합.
- **키보드 Space로 토글**: Enter는 안 받음 — Finder·Explorer도 선택은 Space. 접근성 트리는 `role="row"` + `aria-selected`.
- **전체 선택/해제는 외부 UI로**: Row 자체엔 "select all" 개념이 없음. 상위 툴바에 버튼으로 두거나 헤더의 `selectable`을 켜고 TableRow(navigate)와 섞어 쓰는 패턴은 지양.

### Don't
- select 모드 안에 navigate(`href`/`onClick 라우팅`)를 섞지 않는다. "클릭의 의미가 하나"라는 규칙이 이 컴포넌트의 핵심. 두 가지가 필요하면 [[components/table-row]]를 쓰고 체크박스는 selectable로 켠다.
- 체크박스 UI를 추가하지 않는다 — 이 컴포넌트의 정체성이 "체크박스 없이 행 자체로 선택". 체크박스가 필요하면 [[components/table-row]]의 `selectable` + `onSelectedChange`로.
- `active` prop 없음. "지금 보고 있는 상세 행"의 개념은 navigate 전용 — select 모드엔 "선택됨"만 있다.
- 행 한 줄 안에 여러 선택 가능한 영역을 두지 않는다. 선택 단위는 "행 하나" 고정.

### Fallback
- 사이즈 애매하면 `md`. 파일 리스트 표준.
- variant 애매하면 `line`. 파일 매니저 톤.
- selected 초기값 애매하면 `false`.

### 관련
- [[components/table-row]] — navigate 모드. columns 스펙·레이아웃·fade mask 전부 공유. 체크박스가 필요하면 이쪽의 `selectable` 사용
- [[components/table-header]] — 헤더는 selectable 끄고 사용 (이 컴포넌트는 체크박스 없음)
- [[tokens/color]] — `--hover`(선택 + hover 공통 중성 톤), `--fg-disabled`(disabled)

### Props 시그니처
```tsx
<TableRowSelect<T>
  variant="line | plate"                        // default: line
  size="sm | md | lg"                           // default: md
  columns={TableRowColumn<T>[]}                 // TableRow와 동일 스펙
  order={string[]}                              // Header와 공유
  widths={Record<string, number>}               // Header와 공유
  data={T}

  selected={boolean}
  onSelectedChange={(next: boolean) => void}    // 행 클릭 / Space 공통 콜백

  disabled={boolean}                            // pointer-events + 키보드 차단
/>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| default | variant 기본 배경 |
| hover | `--hover` 중성 톤 |
| selected | `--hover` 배경 (TableRow active와 동일 토큰) |
| selected + hover | selected 톤 유지(hover 덮어쓰기 금지) |
| focus-visible (keyboard) | 외곽 ring(`--ring-shadow`) |
| disabled | `--fg-disabled` 톤, pointer-events 없음, Space 무시 |

### 조합 예시
```tsx
const [selected, setSelected] = useState<Set<string>>(new Set());

const toggle = (id: string, next: boolean) => {
  setSelected((prev) => {
    const n = new Set(prev);
    if (next) n.add(id); else n.delete(id);
    return n;
  });
};

<TableHeader variant="line" columns={HEADER_COLUMNS} />
{rows.map((row) => (
  <TableRowSelect
    key={row.id}
    variant="line"
    columns={ROW_COLUMNS}
    data={row}
    selected={selected.has(row.id)}
    onSelectedChange={(next) => toggle(row.id, next)}
  />
))}
```
