# ~~Card Row~~ (폐기 — ListItem 벤더로 대체)

> ⚠ **이 레시피는 폐기됨.** 반복 리스트 자리는 **반드시 벤더 컴포넌트**를 쓴다 ([[PRINCIPLES]] §5a HARD). 레시피 조립 금지.

## 왜 폐기됐나

이 레시피는 "border + bg + radius 있는 카드형 row"를 벤더 variant로 커버 못한다는 전제로 작성됐지만, 실제로는 **설계 판단 자체가 틀렸음**:

1. [[components/list-item]]은 **chrome 없음이 설계 공식** — 블록 신호가 필요하면 Callout으로 승격이 정답
2. 수제 조립 레시피는 메모리 [[feedback-no-hand-rolled-components]]와 PRINCIPLES §5a를 직접 위반
3. "카드처럼 보이는 리스트"가 꼭 필요하면 → ListItem 벤더에 `surface="card"` 등 **새 variant를 신설** 후 사용

## 지금 쓸 자리는 어디?

반복 아이템 N개를 수직 나열하는 자리는 전부 아래 중 하나:

| 자리 성격 | 쓸 벤더 |
|---|---|
| **표 역할** (열 공통 축이 있는 격자) | [[components/table-row]] + [[components/table-header]] |
| **단건 반복** (알림·활동·작업·자원 목록) | [[components/list-item]] |
| **날짜 중심 이벤트** | [[components/event-list-item]] |
| **메뉴 아이템** (팝오버·사이드바) | [[components/menu-item]] / [[components/sidebar-item]] |

## ListItem 조립 예시 (card-row가 받으려던 자리)

작업 리스트 (상태 Badge + chevron):

```tsx
<ListItem
  href={item.href}
  align="top"
  leading={<Icon name="list-dashes" />}
  trailing={
    <>
      <Badge variant="soft" status={item.status.kind}>{item.status.label}</Badge>
      <IconButton size="sm" variant="ghost" icon={<Icon name="caret-right" />} aria-label="열기" />
    </>
  }
>
  <ListItem.Title>{item.title}</ListItem.Title>
  <ListItem.Meta>
    <time>요청 {item.requestedAt}</time>
    {item.note && <>
      <ListItem.MetaDivider />
      <span>{item.note}</span>
    </>}
  </ListItem.Meta>
</ListItem>
```

- `size`·`align`·`leading`·`trailing` 선택은 [[components/list-item]] "결정 가이드" 참고
- chrome(border/bg)이 필요하면 ListItem 설계 재검토 — 블록 신호면 Callout, "카드형 리스트"면 ListItem 벤더에 새 variant 신설

## 관련

- [[PRINCIPLES]] §5a — 리스트 자리 수제 조립 영구 금지 (HARD)
- [[components/list-item]] — 범용 한 줄 anatomy
- [[ASSEMBLY]] §1 — 1단계에서 리스트 자리는 반드시 벤더로 확정
