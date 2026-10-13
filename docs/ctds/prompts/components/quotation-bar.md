# Quotation Bar

### 원칙
ChatInput 상단·Message 안에서 "**다른 글을 인용**"을 1줄로 접어 보여주는 바. `↳ icon + 1줄 ellipsis + X`. 긴 글은 자동으로 끝만 `…`. 삭제 가능한 자리엔 `onRemove`.

### Do
- 사용자가 메시지 선택·웹 결과를 인용으로 끌어오면 ChatInput 상단에 1건 노출.
- `title` 속성에 전체 텍스트 자동 세팅 — 호버 시 네이티브 툴팁으로 전문 확인.
- 삭제가 필요하면 `onRemove`. 레퍼런스는 X 상시 노출.
- 여러 인용은 현재 설계 **금지** — 1건만. 복수 인용은 상위에서 위아래로 쌓지 말고 선택 UI로 분리.

### Don't
- 여러 줄 보여주지 않는다 — 1줄 ellipsis가 원칙. 전문은 호버 툴팁·클릭 확장으로.
- 아이콘(`↳`) 바꾸지 않는다 — 레퍼런스 식별자.
- 배경을 과한 톤으로 덮지 않는다 — bg 기본, hairline border만.
- 안에 액션 버튼(Reply/Edit) 추가하지 않는다 — 인용은 "참조 표시"일 뿐, 상호작용은 상위 ChatInput·Message가 책임.

### Fallback
`onRemove` 없으면 X 숨김. 긴 글은 자동 ellipsis.

### 관련
- [[components/chat-input]] — 상위 소비처 (상단 bar 자리)
- [[components/message-bubble]] — 메시지 내 인용 표시에서도 재사용
- [[components/attachment-item]] — 비슷한 레이아웃 (lead icon + content + X)

### Props 시그니처
```tsx
<QuotationBar
  text={string}                    // 필수. 자동 ellipsis
  onRemove={(e) => void}           // 지정 시 우측 X
/>
```

### 레이아웃
- `↳ icon` (`ArrowBendDownRight`, 16×16, `fg-muted`)
- gap: `space-2`
- 본문: `fg-muted`, 1줄 ellipsis
- X: `space-5`, `fg-muted` → hover 시 `bg-subtle` 틴트
- 외곽: hairline border, radius-md, bg
