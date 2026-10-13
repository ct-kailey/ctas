# Message Table

### 원칙
[[components/ai-message]] 안의 markdown table 톤 wrapper. 소비처가 `<table><thead><tr><th>…` 생짜 그대로 전달하면 CTDS 톤(**TableHeader·TableRow line variant와 동일 — 외곽 border 없음, bg 없음, 하단 hairline만**)으로 자동 스타일. 가로 overflow 시 wrapper가 scroll.

### Do
- 생짜 `<table>` 전달 — markdown parser(remark 등)가 뱉은 걸 그대로 wrap.
- 숫자 셀도 **좌측 정렬 유지** ([[feedback-no-right-align-numbers]]). tabular-nums로 폭만 균일.
- 가로가 많으면 wrapper 안에서 scroll — 테이블 wrap 깨트리지 않음.

### Don't
- 테이블 안에 생짜 `<button>`·control 넣지 않는다. 그건 TableRow/TableRowEdit 영역.
- 숫자 셀 right-align 금지.

### Props 시그니처
```tsx
<MessageTable>
  <table>...</table>
</MessageTable>
```

### 레이아웃 (TableHeader/TableRow `line` variant와 짝)
- wrapper: 외곽 border 없음, overflow-x: auto
- thead: bg 없음, 하단 hairline
- tbody row: 하단 hairline (마지막 행 제외)
- th/td padding: `space-2 space-2`. 첫 셀 좌측 padding 0, 마지막 셀 우측 padding 0 (셀이 경계에서 떨어지지 않음)
- th: `fg-strong`, font-weight medium, `label-sm` 사이즈
- td: `text-sm`, line-height 1.5
- 숫자: `font-variant-numeric: tabular-nums`
- 숫자 셀도 **좌측 정렬 유지** ([[feedback-no-right-align-numbers]])
