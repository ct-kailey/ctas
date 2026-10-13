# Message State

### 원칙
AI 응답 중간에 쌓이는 **"뭘 하고 있는지"** 라인. Lottie-ish Spinner 또는 kind별 아이콘 + 통통거리는 라벨. `done=true`면 ✓ 체크 + 라벨 정적. [[components/ai-message]] 안에서 children으로 여러 개 쌓아 "작업 플로우" 전달.

### Do
- `kind`로 상태 분류: generating / searching / memory / image / video / file / custom.
- 완료되면 **동일 state를 done=true로 유지** — 사라지면 흐름이 안 보임.
- 라벨 override는 `message` prop. kind는 아이콘만 쓰고 커스텀 라벨 가능.
- AIMessage 안의 children에 여러 MessageState를 쌓고, 끝나면 아래에 실제 응답 본문.

### Don't
- MessageState를 bubble로 감싸지 않는다 — 플랫 라인.
- Spinner와 kind 아이콘을 동시에 띄우지 않는다 — 하나만 (generating=spinner, 그 외=kind icon).
- done 상태에서 라벨 통통거리면 안 됨 — 애니 정지.
- 메시지 완료 후에도 MessageState 계속 노출하지 말고 **접거나 하나로 요약** (예: &ldquo;3 steps completed ✓&rdquo;).

### Fallback
kind 애매하면 `generating`, message 애매하면 kind별 기본.

### 관련
- [[components/ai-message]] — 상위 소비처 (`isGenerating`은 전체 메시지가 생성 중일 때, MessageState는 **메시지 안의 세부 작업**)
- [[components/spinner]] — lottie-dots variant 재사용

### Props 시그니처
```tsx
<MessageState
  kind="generating | searching | memory | image | video | file | custom"
  message={ReactNode}                 // 활성 라벨 override (기본 "…ing…")
  doneMessage={ReactNode}             // 완료 라벨 override (기본 "…ed")
  done={boolean}                      // true → ✓ + 애니 정지 + doneMessage로 전환
  icon={ReactNode}                    // kind="custom" 또는 override
/>
```

### Kind 매트릭스 (active / done 라벨 pair)
| kind | 아이콘 | active | done |
|---|---|---|---|
| generating | Spinner (lottie-dots) | 응답 생성 중… | 응답 완료 |
| searching | MagnifyingGlass | Searching the web… | Searched the web |
| memory | PencilSimple | Updating memory… | Updated saved memory |
| image | Image | Looking at the image… | Looked at the image |
| video | VideoCamera | Reviewing the video… | Reviewed the video |
| file | File | Processing file… | Processed file |
| custom | `icon` prop | `message` prop | `doneMessage` prop |

사용처가 커스텀 pair를 넘기면 (예: `message="Reading 'report.pdf'…" doneMessage="Read 'report.pdf'"`) 활성·완료 모두 자연스러운 영문 과거형으로.

### 애니메이션
- 라벨 각 글자 wave bounce — `duration-slower × 5` 주기, `duration-base` 간격으로 index 지연
- done=true → `animation: none; opacity: 1; transform: none` 로 정지
- 리더 아이콘: active primary 색, done success 색

### 레이아웃
- `inline-flex`, gap `space-2`, `text-sm`, line-height 1.4
- 리더 `space-4` 정사각 (아이콘·spinner 둘 다)
