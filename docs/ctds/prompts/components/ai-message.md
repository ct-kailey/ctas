# AI Message

### 원칙
AI가 보낸 응답 메시지. **왼쪽 정렬**, bubble 없이 본문 그대로 노출 — [[components/user-message]]의 bubble과 대비. 상단에 선택적 라벨, 본문(markdown 또는 콘텐츠 블록), 하단에 [[components/message-actions]].

### Do
- `label`로 메타 제목(예: &ldquo;LongText&rdquo;, &ldquo;Code Block&rdquo;)을 짧게 노출. 생략 가능.
- `children`에 markdown HTML을 직접 넣거나, 콘텐츠 블록 컴포넌트(CodeBlock·Quote·Sources·Table)를 조합.
- 기본 액션 `[copy, regenerate]`, `actionsVisibility`로 상시/호버 전환.
- 생성 중엔 `isGenerating`로 액션 숨김. 로딩 UI는 [[components/message-state]] 조합.

### Don't
- bubble로 감싸지 않는다 — AI는 "본문"이 메시지 자체. bubble은 UserMessage 전용.
- 아바타·모델명 넣지 않는다 — 상위 shell(ChatThread)에서 책임.
- 오른쪽 정렬하지 않는다 — 왼쪽 고정.
- edit 액션 넣지 않는다 — AI 응답은 수정 대상 아님 (regenerate가 대신).

### Fallback
visibility 애매하면 `hover`, actions 애매하면 기본 `[copy, regenerate]`.

### 관련
- [[components/user-message]] — 짝 컴포넌트
- [[components/message-actions]] — 하단 액션 바
- [[components/message-state]] — 로딩/상태 라인 (F5)
- 콘텐츠 블록: `CodeBlock` / `Quote` / `Sources` / `Table` (F4)

### Props 시그니처
```tsx
<AIMessage
  label={ReactNode}                           // 상단 메타 라벨
  actionsVisibility="show | hover"            // default: hover
  actions={[{ kind: "copy" }, { kind: "regenerate" }]}  // 비우려면 []
  sources={[{ id, label, href?, icon? }]}     // 액션바 옆 inline chip
  onSourcesClick={() => void}                 // chip 클릭 (popover 열기 등)
  isGenerating={boolean}                      // true면 액션/sources 숨김
>
  본문 — markdown 또는 블록 조합
</AIMessage>
```

### 레이아웃
- root: `flex-direction: column; align-items: flex-start; gap: space-2`. body line-height 2 하단 half-leading에 space-2(8px)을 더해 액션바와 자연 호흡.
- label: `text-xs`, `fg-muted`, `margin-bottom: space-1` (gap 0 보완).
- body: `text-base`, `line-height: 2` (평소의 ~2배, 가독성), 색 `--fg` (다크 그레이), markdown 기본 톤.
- 인라인 code(`<code>`, 형광펜 강조):
  - 폰트·사이즈·세로 padding·radius는 **글로벌 reset.css의 `code { ... }`** 가 담당. AIMessage에서는 bg(`--bg-subtle`)·`box-decoration-break: clone` 만 override.
  - 세로 padding 금지(reset이 좌우만 깔아둠), font-size 0.9em로 메트릭 축소.
- actions: `align=start`. 음수 margin으로 당기지 않는다 — half-leading과 아이콘 버튼 사이 자연스러운 호흡이 필요.
