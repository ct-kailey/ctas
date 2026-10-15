# Meta Line

### 원칙
한 줄 안에 **여러 메타 라벨**(요청 시각, 작성자, 상태 주석, 카테고리 등)을 가로로 나열하는 자리. 카드 서브텍스트, 리스트 row의 두번째 줄, 테이블 셀 아래 보조 라인에 반복 등장. 구분자가 틀리면 UI가 즉시 싸구려로 뜬다.

### Anatomy
```
[label1] [separator] [label2] [separator] [label3]
```

- label은 모두 같은 톤·크기 (한 줄 안에서 위계 X)
- separator는 **짧고 연한 세로 hairline** 1개만 — 구간 사이에 들어감 (처음/끝 바깥 X)
- label과 separator 사이: `space-2` (양쪽 균등)

### Do
- 각 label: `text-xs` 또는 `text-sm`, `color: var(--fg-muted)`
- separator는 `<span>` + `border-left: 1px solid var(--border)` + `align-self: stretch` — 텍스트 하이트에 자동 맞춤
- separator는 `aria-hidden="true"` — 스크린리더에서 읽히지 않게
- label 중 하나가 **값**(사람 이름·시각)이고 나머지가 **고정 라벨**이면, 값만 `color: var(--fg)` (살짝 올림) — 단 톤 차이는 1단계 이내
- 전체 wrapper: `display: flex; align-items: center; gap: var(--space-2);`
- 날짜·시간은 [[feedback-date-writing]] 전략 중 하나로 (상대어 "12분 전" / "10월 13일") — 숫자 패턴("10. 13") 금지

### Don't
- [HARD] **가운뎃점(`·` `•` `∙`)·점(`.`)·pipe(`|`)·슬래시(`/`)** 등 **문자 구분자 금지** — 메모리 [no-bullet-separator]. hairline으로만 분리
- [HARD] separator를 label 앞뒤에도 넣지 않는다. **"사이에만"**. 끝에 또는 처음에 두면 끊긴 느낌
- [HARD] label 하나하나를 Badge로 쓰지 않는다 — 메타 라인은 톤이 조용해야 한다. Badge는 상태·카테고리 **표시**가 필요할 때만, 메타 라인에 섞이지 않게 분리
- [SOFT] 3개 넘으면 메타 라인이 아니라 **별도 블록**이 맞는지 재검토. 4개 이상은 사용자가 다 못 읽음

### Fallback
항목이 1개뿐이면 separator 없음. 2개 이상부터 hairline 사용.

### 조립 예시
```tsx
<div className="meta-line">
  <span>요청 10월 13일 오후 10시 25분</span>
  <span className="sep" aria-hidden="true" />
  <span>근거 변경 확인 필요</span>
</div>
```

```css
.meta-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--fg-muted);
}
/* separator는 border-left로 — width/height 리터럴 금지 (check_tokens hook) */
.meta-line .sep {
  border-left: 1px solid var(--border);
  align-self: stretch;
  margin: var(--space-0\.5) 0;
  flex: 0 0 auto;
}
```

### 관련
- [[components/badge]] — 상태·카테고리 표시가 필요하면 (메타 라인 바깥에 분리)
- [[tokens/color]] — fg-muted, border
- [[tokens/typography]] — text-sm/text-xs
