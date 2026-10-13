# File Icon

### 원칙
파일 확장자별 **색·라벨·아이콘**을 담은 둥근 사각 뱃지. [[components/chat-input]] 첨부·[[components/message-bubble]] 파일 인용에서 공용. 포맷 식별이 핵심이라 **브랜드 자산(Adobe/Office)은 상용 색을 그대로** — 토큰으로 추상화하면 포맷을 못 알아봄. CTDS 하드코딩 금지의 명시적 예외 ([[feedback/no-hardcoded-values]]).

### Do
- 확장자만 넘기면 끝. `ext="psd"` / `ext=".psd"` / `ext="report.psd"` 전부 OK.
- Mode 축은 자동 반응 — `others`·`zip`·`mp3` 세 그룹만 L/D pair, 브랜드 파일은 모드 무관 고정.
- 사이즈는 접점 크기에 맞춤: 리스트/칩 `sm`(16), 기본 `md`(24), 그리드/히어로 `lg`(32).
- 모르는 확장자는 자동으로 `others` 폴백 — 애플리케이션에서 매핑 추가할 필요 없음.
- 이미지(png/jpg/gif/webp) 첨부는 [[components/attachment-thumb]]로 썸네일 렌더 — FileIcon을 쓰지 않음.

### Don't
- `label` prop을 자동 생성(`ext.toUpperCase().slice(0,2)`)으로 만들지 않는다 — 레퍼런스는 수동 라벨(`Ai`/`Ps`/`X`/`P`/`W`/`Pd`).
- 브랜드 색을 CTDS 토큰(`--bg-brand` 등)으로 치환하지 않는다 — 포맷 식별 정보가 날아감.
- 아이콘(file/file-zip/music-note)을 Icon 컴포넌트 경유로 바꾸지 않는다 — Icon 축(family) 전환에 영향받으면 자산 일관성이 깨짐.
- 포커스 가능하게 만들지 않는다 — 장식 요소. 상호작용은 감싸는 chip/button이 책임.

### Fallback
size 애매하면 `md`, radius 애매하면 `auto`(Shape 축 따라감). 확장자 모르면 `txt`도 OK — 어차피 `others` 폴백.

### 관련
- [[components/attachment-item]] — FileIcon + 파일명 + X. 가장 흔한 소비처
- [[components/attachment-thumb]] — 이미지 첨부(FileIcon 대신)
- [[components/chat-input]] / [[components/message-bubble]] — 상위 소비처
- [[axes/shape]] — radius=auto일 때 Shape 축 따라감
- [[axes/mode]] — 제너릭(others/zip/mp3) 색이 Mode 축 반응

### Props 시그니처
```tsx
<FileIcon
  ext="psd | ai | pdf | xls | ppt | doc | zip | mp3 | ..."  // 필수
  size="sm | md | lg"              // default: md (16 / 24 / 32)
/>
```

### 비율 (Shape 축 반응 + soft 캡)
- radius: sm/md=`--radius-checkbox` / lg=`--radius-xs` — 한 단계씩 내려 soft 과도 방지
- `label font-size / size` = 0.53, weight=semibold
- `glyph / size` = 0.60

> **왜 한 단계 내림**: Shape soft에서 `--radius-xs=10px`를 24px 박스에 쓰면 42%로 너무 둥글어 "뱃지"가 아니라 "알약"으로 보임. [[project-radius-checkbox]] 캡 패턴을 md까지 확장 — Shape 축 반응은 유지하되 soft의 과도만 눌러줌.

### 색 매트릭스
| 그룹 | 모드 | bg | fg | 콘텐츠 |
|---|---|---|---|---|
| **ai** (Illustrator) | 고정 | `#2E0402` | `#F09E38` | 라벨 `Ai` |
| **psd** (Photoshop) | 고정 | `#081D34` | `#57A5F8` | 라벨 `Ps` |
| **xls, xlsx** (Excel) | 고정 | `#3B804C` | `#FFFFFF` | 라벨 `X` |
| **ppt, pptx** (PowerPoint) | 고정 | `#B84C2C` | `#FFFFFF` | 라벨 `P` |
| **doc, docx** (Word) | 고정 | `#3044C7` | `#FFFFFF` | 라벨 `W` |
| **pdf** | 고정 | `#EA336C` | `#FFFFFF` | 라벨 `Pd` |
| **others** (fallback) | Light | `#EDEAB0` | `#B2AA54` | 아이콘 `file` |
|  | Dark | `#363229` | `#A19B5A` |  |
| **zip** · rar · 7z · tar · gz | Light | `#EDEAB0` | `#B2AA54` | 아이콘 `file-zip` |
|  | Dark | `#363229` | `#A19B59` |  |
| **mp3** · wav · flac · m4a · aac · ogg | Light | `#BEFDA8` | `#4B9C2D` | 아이콘 `music-note` |
|  | Dark | `#254924` | `#BDFCA8` |  |

### 조합 예시
```tsx
// 가장 흔한 — AttachmentItem 안
<AttachmentItem filename="report.pdf" />  // 내부에서 <FileIcon ext="pdf" size="md" />

// 리스트 셀 (sm)
<FileIcon ext=".psd" size="sm" />

// 그리드 (lg)
<FileIcon ext="song.mp3" size="lg" />

// 모르는 확장자 — 자동 others
<FileIcon ext="unknown" />
```
