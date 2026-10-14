# Attachment Item

### 원칙
파일 첨부 1건 — `[FileIcon] filename (meta) [actions]`. 폭은 size로 결정 (sm/md=220px, lg=400px). 레이아웃도 `size` 하나로 결정. 파일명에서 확장자를 뽑아 [[components/file-icon]] 색/라벨을 자동 결정. `state="loading"`이면 좌측 뱃지를 Spinner(lottie-dots)로 교체. trailing은 콜백 조합(`onRemove`/`onDownload`/`onMore`)으로 노출. 긴 파일명은 **중간 생략 + 끝 확장자 유지**. "Chip"이 아님에 주의 — [[components/chip]]은 필터 선택값 전용.

### Do
- 파일명 통째로 넘기면 끝 — `filename="report.pdf"` 하나로 아이콘·라벨·식별까지.
- size로 레이아웃 선택:
  - `sm` — ChatInput 밀도 자리 (1줄)
  - `md` — 일반 입력·목록 자리 (1줄, 기본값)
  - `lg` — 첨부 상세·메시지 본문 (2줄, 파일명 위 / meta 아래)
- 업로드 중은 `state="loading"` + `meta` 문구 — 좌측이 Spinner(lottie-dots)로 교체. 상태 문구는 소비처 책임.
- 즉시 액션(미리보기·업로드 재시도 등)은 `meta`에 Button `variant="ghost"` `size="xs"`로 넣는다 — 전역 Button 체계와 합치.
- trailing은 콜백을 지정한 만큼만 노출. 복수 지정 시 download → more → remove 순으로 배치.
- Thumb(이미지)·Item(파일) 섞여 흐를 자리는 `flex-wrap: wrap` + `gap: space-2`로 조립.

### Don't
- 폭을 임의로 override 하지 않는다 — size가 폭을 결정 (sm/md=220px, lg=`--input-w-lg` 400px). 소비처는 세로/wrap만 결정.
- 파일명·확장자를 **따로** 받는 props 추가하지 않는다 — 소비처가 자르면 FileIcon 매핑이 어긋남.
- trailing에 임의 ReactNode 슬롯을 뚫지 않는다 — 접근성·간격·톤 통일이 깨짐. 정의된 콜백 조합만.
- trailing을 수제 버튼으로 그리지 않는다 — 반드시 IconButton 재사용 (sm/md → IconButton sm 20, lg → IconButton md 24). IconButton에 없는 치수(28·36 등)는 금지.
- loading 좌측에 베이스 Spinner variant(pulse·dots-bounce 등)를 쓰지 않는다 — CTDS 로더 톤 통일 위해 `lottie-dots` 고정. [[components/spinner]].
- 배경을 과한 톤으로 덮지 않는다 — bg는 `var(--bg)`, 테두리는 hairline, drop shadow는 가장 연한 `--shadow-xs`만.
- meta 라인에 가운뎃점 "·"는 OK — 하지만 `··•·|` 같은 꾸밈 구분자는 금지. [[feedback-no-bullet-separator]].
- `AttachmentChip`으로 부르지 않는다 — [[components/chip]]은 필터 선택값(X 제거) 전용. 파일 첨부는 Item.

### Fallback
size 애매하면 `md`. 모르는 확장자는 FileIcon이 `others`로 폴백하니 그대로 넘겨도 됨.

### 관련
- [[components/file-icon]] — 좌측 뱃지
- [[components/spinner]] — loading 상태 좌측 (lottie-dots variant)
- [[components/icon-button]] — trailing 액션 버튼
- [[components/button]] — meta 안 즉시 액션 (ghost xs)
- [[components/attachment-thumb]] — 이미지 첨부 (사촌)
- [[components/list-item]] — data 그룹 이웃
- [[components/chat-input]] — 상위 소비처 (size=sm/md)
- [[components/user-message]] — 메시지 내 파일 인용 (size=lg)

### Props 시그니처
```tsx
<AttachmentItem
  filename={string}                       // 필수. 확장자 자동 추출
  size="sm | md | lg"                     // default: md. lg는 2줄 큰 카드
  state="idle | loading"                  // default: idle. loading이면 좌측이 Spinner
  meta={ReactNode}                        // 문자열(muted 라벨) 또는 Button ghost xs 등
  onRemove={(e) => void}                  // 지정 시 우측 X
  onDownload={(e) => void}                // 지정 시 우측 download
  onMore={(e) => void}                    // 지정 시 우측 더보기 (dots)
/>
```

### 비율·레이아웃
- 폭: sm/md=220px (`calc(var(--space-unit) * 55)`), lg=`--input-w-lg` (400px).
- 외곽: `--hairline` 1px border, `var(--border)` 색. drop shadow는 `--shadow-xs` (가장 연함).
- radius: sm/md=`--radius-md`, lg=`--radius-lg`.
- 내부 gap (leading ↔ text): sm=`--space-1_5`, md=`--space-2`, lg=`--space-2_5`. actions 간은 전부 `--space-1`.
- padding:
  - sm: `space-1` 상하, `space-1` 우, `space-2` 좌
  - md: `space-1_5` 상하, `space-1_5` 우, `space-2_5` 좌
  - lg: `space-2_5` 상하, `space-1_5` 우, `space-2_5` 좌 (세로 숨 쉬게 + 좌우는 아이콘 버튼 자리 고려해 타이트)
- leading FileIcon size: sm→sm(16) · md→md(24) · lg→lg(32).
- lg 안쪽 두 줄: label=`--text-sm`(14.5) · meta=`--text-xs`(13). 한 단계 차이. 무게/색은 label=medium/fg-strong, meta=regular/fg-subtle. (meta는 모든 size 공통 `--text-xs` + `--fg-subtle`.)
- leading loading slot: FileIcon과 동일 치수(sm=`space-4`, md=`space-6`, lg=`space-8`), 내부 Spinner는 100%.
- trailing IconButton: sm/md→IconButton `sm`(20), lg→IconButton `md`(24). variant는 전부 ghost.

### Middle ellipsis 규칙
`filename.length > max`이면 `name... + ext`로 치환. 확장자는 항상 끝에 보존.
- sm: max=24
- md: max=22
- lg: max=44
- 확장자 없거나(dot<=0) 비정상적으로 긴 확장자(>8자) / 확장자가 max를 거의 다 먹는 경우만 일반 `...` 꼬리로 폴백.
- 사용 문자는 ASCII `...` (유니코드 `…` 금지, [[feedback-no-em-dash]]).
- CSS `text-overflow: ellipsis`는 안전망으로 유지하되, 글자 수 cap을 size별 폭보다 보수적으로 잡아 CSS가 확장자를 다시 잘라내지 않게 한다.

### Loading 좌측 뱃지
`state="loading"`일 때 FileIcon 자리에 Spinner — `variant="lottie-dots"`. 색은 `--fg-subtle` currentColor 바인딩. 크기는 FileIcon의 각 size와 동일 치수를 가지는 정사각 슬롯이 감싸고 내부 Spinner는 100%.

### meta 폰트
meta는 size와 무관하게 항상 `--text-xs`(13) — 파일명보다 한 단계 작은 보조 톤 유지. label(파일명)만 size별로 변동(sm=`--text-xs`, md=`--text-sm`, lg=`--text-sm`).
