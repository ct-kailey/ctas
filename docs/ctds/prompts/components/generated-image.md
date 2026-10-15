# GeneratedImage

### 원칙
AI가 생성한 **이미지 결과물의 큰 표시 자리**. 세 상태(loading / placeholder / image)가 같은 프레임 안에서 바뀐다. `aspect` 축으로 비율만 바꾸고 폭은 상위 그리드가 담당 — 자체적으로 크기를 들고 다니지 않는다. loading 상태는 image-gen 전용 lottie(sparkle breathe)로 "생성 중"을 전달하고, 플레이스홀더 배경이 이미 들어가 있어 깜빡임 없이 전환된다.

### Do
- 폭은 상위 그리드/부모가 결정. GeneratedImage는 `aspect`로 비율만 선언.
- 생성 중이면 `loading` prop, 결과가 없을 뿐이면 `loading` 생략(= placeholder만 노출).
- 다운로드 버튼이 필요하면 `onDownload`를 넘긴다. hover·focus-visible일 때만 노출되고, loading·placeholder 상태에서는 자동으로 숨겨진다.
- 결과물 레퍼런스는 세로 비율이 많아 기본값 `portrait`(3/4) 그대로 쓰기를 권장.

### Don't
- 폭을 CSS로 override 금지. 비율은 `aspect`가, 폭은 부모 레이아웃이 책임.
- `loading=true`일 때 `src`에 결과물을 미리 넣어두는 식의 선행 로딩 금지 — 상태가 꼬인다.
- 자체 border·bg 덮어쓰기 금지. `--bg-subtle`/`--bg-muted` 토큰이 상태를 신호한다.
- 다운로드 버튼 자리에 다른 액션(공유·삭제 등) 추가 금지. 이 자리는 "저장" 전용. 액션이 더 필요하면 외부 Toolbar/MessageActions로 뺀다.
- 결과물 위에 라벨·캡션 overlay 올리지 않는다. 캡션은 바깥 블록으로 분리.

### Fallback
비율 애매하면 `portrait`, 상태 애매하면 `loading` 생략(= placeholder). onDownload는 "저장이 UX의 핵심일 때만" 공급.

### 관련
- [[components/spinner]] — loading 상태에서 `variant="lottie-image-gen"` size `lg`로 내장.
- [[components/tooltip]] — 다운로드 버튼의 "다운로드" 레이블.
- [[components/ai-message]] — 어시스턴트 메시지 안 결과물 자리에서 자주 쌍으로 조립.
- [[components/attachment-thumb]] — 사용자가 올린 참조 이미지 썸네일(작은 자리). 생성 결과 큰 자리는 GeneratedImage.
- [[components/gallery-item]] — 여러 결과를 그리드로 늘어놓을 때 셀 안쪽 미디어 자리.

### Props 시그니처
```tsx
<GeneratedImage
  src={string}                                   // 결과 이미지 URL (없거나 loading이면 placeholder)
  alt={string}                                   // 접근성 대체 텍스트
  aspect="square | portrait | landscape"         // default: portrait (3/4)
  loading={boolean}                              // 생성 중 — placeholder + sparkle breathe
  onDownload={(e) => void}                       // 지정 시만 우상단 다운로드 버튼 노출
/>
```

### Aspect 가이드
| aspect | 비율 | 쓰임 |
|---|---|---|
| `portrait` | 3/4 | **기본**. 레퍼런스/캐릭터/인물 중심 결과물. |
| `square` | 1/1 | 아이콘·썸네일·SNS 포맷 결과물. |
| `landscape` | 4/3 | 배경·풍경·와이드 포스터 결과물. |

### 상태 전환
1. 초기: `src` 없음, `loading` 없음 → **placeholder** (배경 이미지 + 조용히 대기)
2. 생성 시작: `loading=true` → **loading** (같은 배경 + image-gen lottie 중앙 중첩)
3. 결과 수신: `loading=false`, `src=<url>` → **image** (cover로 가득 채움)
4. 다운로드: `onDownload` 공급 시, image 상태에서만 우상단 버튼 hover 노출

전환 사이에 레이아웃 shift가 없다 — 세 상태 모두 동일한 `aspect-ratio` 프레임 안에서 바뀌므로 상위 그리드가 흔들리지 않는다.

### 조합 예시
```tsx
// 기본 — AI 메시지 안 결과물
<GeneratedImage
  src={result.url}
  alt={result.prompt}
  onDownload={() => downloadImage(result.url)}
/>

// 생성 중
<GeneratedImage loading alt="생성 중" />

// 와이드 포맷 결과
<GeneratedImage
  src={banner.url}
  alt={banner.prompt}
  aspect="landscape"
  onDownload={() => downloadImage(banner.url)}
/>

// AIMessage 안쪽에서 쌍으로
<AIMessage>
  <AIMessage.Body>원하신 레퍼런스예요.</AIMessage.Body>
  <GeneratedImage src={url} alt={prompt} onDownload={handleSave} />
</AIMessage>
```
