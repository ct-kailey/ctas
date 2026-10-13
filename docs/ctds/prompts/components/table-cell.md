# TableCell

### 원칙
[[components/table-row]]·[[components/table-row-edit]]의 셀 자리에 넣는 **의미별 서브 컴포넌트 세트**. 하나의 TableCell이 아니라 **9종** — Text·Number·Image·Tag·Badge·Icon·Avatar·Link·Meter. 셀 안 콘텐츠 종류마다 톤·정렬·간격이 다른데 그 결정을 셀 레벨에서 끊어내 Row는 레이아웃만 담당하게 한다.

### Do
- 콘텐츠 성격에 맞는 서브 컴포넌트를 고른다. 성격 혼재 금지.
- Number는 `tabular-nums`가 자동. 숫자 셀은 반드시 Number 사용.
- Avatar 셀은 `label` + `sublabel`(이메일·역할) 2행 구조. 이름만이면 label만.
- Tag는 **다중값**(기술 스택·태그 모음), Badge는 **단일 상태**.
- 색은 톤(`tone`) prop으로만. hex·custom color 금지.

### Don't
- 숫자를 Text로 렌더하지 않는다 — tabular 정렬 깨짐.
- 숫자 셀 **우측정렬 금지** ([[feedback_no_right_align_numbers]]). 좌측정렬 유지.
- 셀 안에 두 종류 섞지 않는다(Avatar + Badge 등). 그러려면 상위 Row 커스텀 셀로.
- Tag·Badge를 Icon 셀에 섞어 쓰지 않는다. 아이콘은 상태 시그널 전용.
- 셀 자체에 padding override 금지. Row의 셀 간격 토큰이 전담.

### Fallback
tone 애매하면 Text=`default`, Icon=`default`, Meter=`default`.

### 관련
- [[components/table-row]] · [[components/table-row-edit]] · [[components/table-row-select]] — 담는 Row
- [[components/table-header]] — 컬럼 정의
- [[components/avatar]] — Avatar 셀 안쪽
- [[components/badge]] · [[components/tag]] — 각 셀의 소스
- [[tokens/color]] — tone 매핑

### Props 시그니처
```tsx
// 공통: 모든 TableCell*은 <span>으로 렌더. HTML attributes 통과.
<TableCellText tone="default | strong | muted | subtle">{string | ReactNode}</TableCellText>
<TableCellNumber value={number} format?={Intl.NumberFormatOptions} />
<TableCellImage src={string} alt={string} size={number} shape="circle | rounded | square" />
<TableCellBadge status="success | warning | destructive | info" variant="soft | solid">
  {string}
</TableCellBadge>
<TableCellIcon icon={<Icon />} tone="default | success | warning | destructive | info" />
<TableCellAvatar
  src?={string} name?={string} initials?={string}
  shape="circle | rounded"                     // default: circle
  status?="online | offline | busy | away"
  label?={ReactNode}                           // 미지정 시 name 재사용
  sublabel?={ReactNode}                        // 이메일·역할
/>
<TableCellLink href={string} external?={boolean}>{ReactNode}</TableCellLink>
<TableCellMeter value={0..100} tone="default | success | warning | destructive" label?={string} />
```

### 서브 컴포넌트 선택 가이드
| 셀 콘텐츠 | 사용 |
|---|---|
| 일반 텍스트 | `TableCellText` (tone 조절) |
| 금액·개수·비율 | `TableCellNumber` (tabular-nums) |
| 썸네일·프로덕트 사진 | `TableCellImage` |
| 다중 메타 라벨 (기술·분류·속성) | `TableCellBadge` 여러 개를 `inline-flex` + `space-1` gap으로 나열 |
| 단일 상태 라벨 | `TableCellBadge` |
| 상태 아이콘만 | `TableCellIcon` |
| 사람·팀 식별 | `TableCellAvatar` |
| 외부 링크·상세 라우팅 | `TableCellLink` |
| 진행률·사용량 바 | `TableCellMeter` |

### 조합 예시
```tsx
// 사용자 리스트 — Avatar + 숫자 + Badge
<TableRow
  cells={[
    <TableCellAvatar src={u.avatar} name={u.name} sublabel={u.email} />,
    <TableCellText tone="muted">{u.role}</TableCellText>,
    <TableCellNumber value={u.projects} />,
    <TableCellBadge status={u.active ? "success" : "warning"}>
      {u.active ? "활성" : "휴면"}
    </TableCellBadge>,
  ]}
/>

// 분석 테이블 — 숫자 + Meter + Link
<TableRow
  cells={[
    <TableCellText tone="strong">{row.name}</TableCellText>,
    <TableCellNumber value={row.visits} />,
    <TableCellMeter value={row.conversion} tone="success" label={`${row.conversion}%`} />,
    <TableCellLink href={`/reports/${row.id}`}>자세히</TableCellLink>,
  ]}
/>
```
