# User Message

### 원칙
사용자가 보낸 채팅 메시지. [[components/bubble]] + [[components/message-actions]] 조합. **오른쪽 정렬** 고정. 액션은 기본 호버 시만 노출 — 메시지 리스트가 액션 아이콘으로 어수선해지지 않게.

### Do
- 기본 구성: `shape=circular-drop, fill=translucent, tail=end` — 레퍼런스 톤.
- 액션은 `[copy, edit]` 기본. `actionsVisibility="show" | "hover"`로 상시/호버.
- 첨부 있으면 `before` slot에 [[components/attachment-thumb]] / [[components/attachment-item]] 자유 조합. 상위에서 레이아웃 책임.
- 매우 긴 글은 bubble이 max-width 안에서 wrap, 그보다 넘으면 자연스레 아래로. 상한은 토큰 `--user-message-max`(= content-max × 0.72). AI 응답은 트랙 폭 전체를 쓰는 반면 user bubble은 상한을 둬서 "오른쪽 정렬 말풍선" 리듬을 유지(iMessage/ChatGPT/Claude 표준).

### Don't
- 왼쪽 정렬하지 않는다 — user는 **항상 오른쪽**. 왼쪽은 AI/시스템.
- 액션 라벨을 아이콘 옆에 노출하지 않는다 — title/aria-label만 (MessageActions 규약).
- bubble 안에 복잡한 레이아웃(table·code block) 넣지 않는다 — 그건 AIMessage 영역.
- 아바타·이름 넣지 않는다 — user 메시지는 암묵적으로 "나".

### Fallback
shape 애매하면 `circular-drop`, fill 애매하면 `translucent`, visibility 애매하면 `hover`.

### 관련
- [[components/bubble]] — 담는 그릇
- [[components/message-actions]] — 액션 바
- [[components/ai-message]] — 짝 컴포넌트
- [[components/attachment-thumb]] / [[components/attachment-item]] — before slot 조합

### Props 시그니처
```tsx
<UserMessage
  shape="rounded | circular-drop | circular | square"  // default: circular-drop
  fill="none | solid | translucent | outline"          // default: translucent
  size="md | lg"                                        // default: md
  actionsVisibility="show | hover"                     // default: hover
  actions={[{ kind: "copy" }, { kind: "edit" }]}       // 비우려면 []
  before={ReactNode}                                   // 첨부·인용 등 bubble 위
>
  메시지 본문
</UserMessage>
```

### 레이아웃
- root: `flex-direction: column; align-items: flex-end; gap: space-1; width: 100%`
- 메시지 리스트 안에서 각 UserMessage가 오른쪽에 자동 정렬됨.
- Bubble `tail="end"` 고정 — 오른쪽 상단 각짐.
- MessageActions `align="end"`.
