# Attachment Thumb

### 원칙
Chat Input·Message의 **이미지 첨부 썸네일**. 정사각 radius ~22%(size × 0.22) 고정, 세 가지 상태 — `src` 있음(이미지)/없음(블루톤 image glyph)/`loading`(pulse). 전부 inner hairline으로 edge definition. hover 시 코너에 X 삭제 버튼 노출(`onRemove` 지정 시).

### Do
- 이미지 첨부(png/jpg/gif/webp)엔 썸네일, 그 외 포맷은 [[components/file-icon]] 또는 [[components/attachment-item]].
- 업로드 처리 중/디코딩 전엔 `loading` → pulse. 끝나면 `src` 세팅.
- 메타만 받고 썸네일 URL이 늦게 오면 `src` 비워두면 image glyph placeholder — 로딩이 길어 답답한 자리를 메움.
- 삭제 UI가 필요하면 `onRemove`를 넘김 — hover/focus-visible에서 코너 X 활성.

### Don't
- 썸네일 안에 캡션·메뉴 넣지 않는다 — 레퍼런스는 "순수한 미리보기".
- `object-fit: contain` 금지 — 비율은 crop(`cover`).
- radius를 Shape 축에 반응시키지 않는다 — 소형 치수라 [[components/file-icon]]과 같은 이유로 고정.
- placeholder 그라데이션 등 "꾸미기" 금지 — mp3 음악 노트와 같은 패턴, 단일 톤 glyph만.

### Fallback
size 애매하면 `md`(40). `src`·`loading` 둘 다 없으면 자동 placeholder.

### 관련
- [[components/attachment-item]] — 파일형 첨부
- [[components/file-icon]] — 브랜드 사각 뱃지
- [[components/chat-input]] — 상위 소비처

### Props 시그니처
```tsx
<AttachmentThumb
  src={string}                     // 이미지 URL. 없으면 image glyph placeholder
  alt={string}
  size="sm | md | lg"              // default: md (32 / 40 / 56)
  loading={boolean}                // true면 pulse (src 무시)
  onRemove={(e) => void}           // 지정 시 hover에서 X 노출
/>
```

### 비율 (고정 — FileIcon과 통일)
- `radius / size` = 0.25 → sm=8, md=10, lg=14
- `glyph / size` = 0.60
- Remove 버튼: `size × 0.42`, 코너에 `-12%` offset으로 overlap
- 가로세로 1:1 crop

### Placeholder 색 (Mode 축 자동 전환)
| 모드 | bg | fg |
|---|---|---|
| Light | `#D5E8FD` | `#2D7FD3` |
| Dark | `#1E3A5F` | `#C5DFF8` |

브랜드 자산 범주 — [[components/file-icon]]과 같은 하드코딩 예외. 토큰으로 추상화 X.
