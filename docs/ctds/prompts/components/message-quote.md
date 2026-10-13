# Message Quote

### 원칙
[[components/ai-message]] 안의 인용 블록. `plain`(그냥 글)과 `blockquote`(왼쪽 vertical bar 리더) 두 variant. [[components/quotation-bar]]는 ChatInput의 "접힌 인용"이고 — Message Quote는 **메시지 본문 안에 펼친 인용**.

### Do
- `plain`은 다른 글과 톤이 거의 같음 — 가볍게 "참조 중" 암시.
- `blockquote`는 왼쪽에 bar — markdown `>` 와 동일 톤.
- 색은 blockquote=fg-muted, plain=fg (본문과 같은 톤).

### Don't
- Quote 안에 아이콘·메타 라벨 넣지 않는다 — 소스/저자 표시가 필요하면 [[components/message-sources]] 또는 상위에서.
- 중첩 blockquote는 지원하지 않음.

### 관련
- [[components/quotation-bar]] — ChatInput의 접힌 인용
- [[components/ai-message]] — 상위 소비처

### Props 시그니처
```tsx
<MessageQuote variant="plain | blockquote">본문</MessageQuote>
```

### 레이아웃
- plain: 외곽 장식 없음, 색 `--fg`
- blockquote: `padding-left: space-4`, 왼쪽 bar는 `::before` pseudo로 상·하 `space-1` inset — border-left 아님 (**짧고 radius-full로 캡슐**). 색 `--fg-muted`, bar는 `--border-strong`.
