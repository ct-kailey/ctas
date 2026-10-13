# Chat Input

### 원칙
AI 채팅의 입력 영역. **첨부물 바 → 인용 바 → 입력 본문**(textarea 또는 input)의 세 층 구성. 모델 선택·전송·중지·파일첨부를 전부 담당. 하위 레이어 [[components/file-icon]]·[[components/attachment-thumb]]·[[components/attachment-item]]·[[components/quotation-bar]]를 **조립**하는 상위 블록 — 자체 primitive 추가 금지.

### Do
- Shape은 두 가지 — `multi`(기본, 긴 입력·오버레이 UI), `single`(토픽바·검색봉 느낌).
- 외곽 radius는 Shape 축 토큰이 직접 결정 — prop으로 받지 않음.
- `models` + `selectedModel` + `onSelectModel` 셋이 다 있을 때만 모델 selector 노출.
- 전송은 `Enter`로 — multi에선 `Shift+Enter`가 줄바꿈. 스트리밍 중엔 `Enter`나 send 클릭이 `onStop`을 호출.
- 첨부·인용은 전부 **외부 상태** — ChatInput은 표시·삭제 콜백만 중계. 업로드 로직·중복 체크는 소비처 책임.
- `onAttach`에 File[]이 들어옴. 소비처가 kind 판정(image/file)해서 attachments에 매핑.

### Don't
- 첨부·인용·메시지 상태를 ChatInput 안에서 관리하지 않는다 — controlled 전용.
- 모델 선택 메뉴를 내부에서 열지 않는다 — 현재는 라벨 클릭 시 다음 모델로 토글만. 실제 ContextMenu는 소비처에서 조립 (ChatInput의 책임 과잉 방지).
- SingleLine에서 모델 라벨을 끝까지 노출하지 않는다 — 10자 넘으면 자동 compact(아이콘만).
- Send 버튼 색을 변경하지 않는다 — 비활성=`bg-subtle` / 활성·스트리밍=`primary`로 고정.

### Fallback
shape 애매하면 `multi`. maxRows 애매하면 `8`.

### 관련
- [[components/file-icon]] / [[components/attachment-thumb]] / [[components/attachment-item]] / [[components/quotation-bar]] — 조립 요소
- [[components/message-bubble]] — 짝 컴포넌트 (후속)
- [[components/context-menu]] — 모델 선택 메뉴를 소비처에서 조립할 때
- [[primitives/scroll]] — "Textarea / 단일 콘텐츠 스크롤" 섹션. 긴 글 스크롤 시 글이 root border에서 clip되도록 wrapper padding-top + textarea padding-bottom 패턴 사용. 레이아웃 변경 시 반드시 그 규약 유지.

### Props 시그니처
```tsx
<ChatInput
  shape="multi | single"               // default: multi

  value={string}
  onChange={(v) => void}

  onSend={() => void}                  // canSend일 때만 호출
  onStop={() => void}                  // isStreaming일 때 send 자리에 stop
  isStreaming={boolean}

  attachments={ChatAttachment[]}       // image/file 섞어 전달
  onRemoveAttachment={(id) => void}
  onAttach={(files: File[]) => void}

  quotation={{ text, onRemove? }}

  models={{ id, label }[]}
  selectedModel={string}
  onSelectModel={(id) => void}

  placeholder="Ask me anything…"
  disabled={boolean}
  maxRows={number}                     // multi 전용, default 8
/>
```

### ChatAttachment 타입
```tsx
type ChatAttachment =
  | { id, kind: "image", src?, alt?, loading? }
  | { id, kind: "file",  filename }
```
- `kind: "image"`에 `src` 없거나 `loading: true`면 AttachmentThumb이 placeholder/pulse 자동.
- `kind: "file"`은 AttachmentItem이 filename 확장자로 FileIcon을 자동 결정.

### 레이아웃
- 외곽: hairline border, `var(--bg)`, radius=Shape 축 (`--radius-sm`)
- **스크롤 룰**: root `padding: 0; overflow: hidden`. textarea에 상·하·좌·우 padding 전부 → 긴 글 스크롤 시 글이 root border까지 흘러 자연스레 clip. (wrapper에 padding 두면 scroll 시 "빈 띠"가 남아 어색 — [[primitives/scroll]])
- focus-within에서 ring
- 내부 세로 gap: `--space-2`, padding: `--space-3`
- **MultiLine**: `attachments → quotation → [textarea / footer]` 세로
- **SingleLine**: `attachments → quotation → [attach · input · model · send]` 가로 한 줄
- Attach/Model/Send: footer 안에서 좌측(attach) 우측(model+send) 분리

### 상태 매트릭스
| 상태 | 트리거 | 시각 |
|---|---|---|
| Normal | 빈 입력 | placeholder, send=`bg-subtle` |
| Active | 포커스 | focus-within ring |
| ActiveSendBtn | `value.trim() || attachments` | send=`primary` |
| FileUpload | `attachments.length > 0` | attachments 바 노출 |
| Quotation | `quotation != null` | quotation bar 노출 |
| Streaming | `isStreaming && onStop` | send 자리에 stop (square icon) |
| Disabled | `disabled` | opacity 0.5, pointer-events none |
