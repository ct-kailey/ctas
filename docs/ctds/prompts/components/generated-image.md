# Generated Image

### 원칙
AI가 생성한 이미지를 메시지 안에 **크게** 보여주는 블록. 작은 썸네일은 [[components/attachment-thumb]].

### Do
- 기본은 세로형 포스터(`aspect="portrait"` = 3:4).
- 생성 중엔 `loading`만 넘기고 src 생략 — 완료되면 src 세팅.
- 다운로드가 필요하면 `onDownload` 전달 — hover/focus-within에서만 우상단에 노출.

### Don't
- loading과 src 동시 지정 — loading이 우선이라 의미 없음.
- 다운로드 버튼 상시 노출.

### Fallback
aspect 애매하면 `portrait`. src 없으면 placeholder (bg 이미지 + spinner lottie-image-gen).

### 관련
- [[components/attachment-thumb]]
- [[components/ai-message]] — 상위 소비처

### Props 시그니처
```tsx
<GeneratedImage
  src={string}
  alt={string}
  aspect="portrait | square | landscape" // default: portrait
  loading={boolean}
  onDownload={(e) => void}
/>
```

### 레이아웃
- 외곽: `radius-md`, `max-width: input-w-lg × 1.1`, overflow hidden
- aspect-ratio로 비율 고정 (`3/4`·`1/1`·`4/3`)
- loading/placeholder bg: `/illustrations/image-gen-placeholder.png`
- 로딩 중 중앙: [[components/spinner]] `variant="lottie-image-gen"` `size="lg"`, color `--bg`
- Download 버튼: `space-8` 정사각, 우상단 inset `space-2`, hover 시 fade-in + scale
