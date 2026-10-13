# Drawer

### 원칙
화면 좌/우 가장자리에서 밀고 들어오는 세로 full-height 패널. **흐름을 끊지 않고** 본문과 연관된 보조 작업을 띄울 때. 결정 하나에 집중시키는 중앙 자리는 [[components/modal]], 가벼운 미리보기는 [[components/popover]].

### Do
- **본문과 연결된 보조 작업**에 쓴다. Modal처럼 흐름을 끊는 자리와 구분.
- `title` 필수. 명사형 짧게. 질문형은 `description`으로.
- 설명 문구는 `description` prop — 헤더 안에서 title 바로 아래 바짝 붙어 하나의 "소개" 묶음으로 읽힘. `children`에 `<p>`로 설명 넣지 않는다.
- **`children`은 완전 자유** — 호출부가 원하는 어떤 ReactNode든. Drawer는 자리와 축만 담당하고 콘텐츠 타입에 간섭하지 않는다. 세로 스크롤은 body가 담당.
- `footer`는 액션 Button. **우측 정렬 · 최대 2~3개**. 순서는 **좌: outline(취소/닫기), 우: primary(저장/적용)**.
- 방향(`side`)은 한 제품/맥락 안에서 **하나로 통일**. right가 기본, 특별한 이유 있을 때만 left.
- `backdrop="scrim"`(기본)은 모달형 — 뒤 영역 비활성 + 바깥 클릭 닫힘. `locked`은 저장·업로드 중 실수 방지. `none`은 상주형(뒤 영역 계속 조작) non-modal.
- dismiss는 **헤더 우측 X · ESC 키** 두 가지. 둘 다 기본 on.

### Don't
- Modal 자리에 Drawer 금지 — 결정 하나에 집중시키는 자리는 Modal.
- Drawer 안에 Drawer 금지.
- 짧은 알림에 Drawer 금지 — [[components/toast]] 자리.
- footer에 primary 2개 금지.
- 사이즈 조절한다고 `width` 인라인 override 금지. `size` prop만 사용. 더 넓게 필요하면 그건 페이지 자리.
- title을 `text-transform: uppercase`로 꾸미지 않는다.
- 같은 페이지에서 right/left Drawer 혼용 — 방향 통일.
- children 안의 "콘텐츠 타입"을 Drawer가 미리 제한하지 않는다 (알림 전용·폼 전용 variant 같은 거 만들지 말 것).

### Fallback
- 결정이 끝나야 다음 흐름이 가능하면 → [[components/modal]].
- 짧은 알림이면 → [[components/toast]].
- 가볍게 미리보기면 → [[components/popover]].
- 애매하면 `side="right"`, `size="md"`, `backdrop="scrim"`.

### 관련
- [[components/modal]] — 흐름 중단·결정 집중.
- [[components/toast]] — 휘발성 알림.
- [[components/button]] — footer 액션. 파괴적 확인은 `destructive` variant.
- [[primitives/slide]] — 가장자리 등장 애니. `--motion-distance-scale`로 축 스왑.
- [[primitives/fade]] — overlay fade 조합.
- [[axes/motion]] — slide 거리·duration 스왑.
- [[tokens/z-index]] — overlay는 `z-overlay`, content는 `z-modal`.

### Props 시그니처
```tsx
<Drawer
  open={boolean}
  onOpenChange={(open: boolean) => void}
  title={ReactNode}                 // required
  description={ReactNode}           // 헤더 안, title 바로 아래 한두 줄
  titleSrOnly={boolean}             // 시각적 숨김
  footer={ReactNode}                // Button들을 넘김. 없으면 footer 미렌더
  dismissible={boolean}             // default: true (헤더 X 버튼)
  dismissLabel={string}             // X 버튼 스크린리더 라벨
  disableEscape={boolean}           // ESC 닫힘 차단
  side="right" | "left"             // default: right
  size="sm" | "md" | "lg"           // default: md
  backdrop="scrim" | "locked" | "none"  // default: scrim
>
  {children}                        // 자유 ReactNode — 콘텐츠 타입 제한 없음
</Drawer>
```

### Variant 매트릭스

| prop | 값 | 결과 |
|---|---|---|
| `side` | `right`(기본) | 우측에서 밀고 들어옴. 기본 자리. |
|  | `left` | 좌측에서. 특별한 이유 있을 때만. |
| `size` | 아래 **Size 가이드** 참조 | 뷰포트 폭 기준 비율. |
| `backdrop` | `scrim`(기본) | dim O · 바깥 클릭 닫힘. 일반 보조 작업. |
|  | `locked` | dim O · 바깥 클릭 무시. 저장·업로드 중 실수 방지. ESC도 막고 싶으면 `disableEscape`. |
|  | `none` | dim 없음 · 뒤 영역 계속 조작 가능 (non-modal). |
| `dismissible` | `true`(기본) / `false` | 헤더 X 노출/제거. |
| `disableEscape` | `false`(기본) / `true` | ESC 닫힘 활성/차단. |
| `titleSrOnly` | `false`(기본) / `true` | 헤더 title 시각적 숨김. |

### Size 가이드
| size | width | 언제 |
|---|---|---|
| `sm` | 33vw | 좁은 보조 패널. 데이터·관리 도구. |
| `md` | 50vw | **기본.** 뷰포트의 절반. 대부분의 경우. |
| `lg` | 67vw | 복잡한 편집·탭 포함 보조 뷰. 이보다 넓어야 하면 페이지 자리. |

> 좁은 화면에선 `min-width`(space-2 × 40)와 `max-width`(100vw − space-8)가 자동 보정 — 좌/우 가장자리 여백 유지.

**금지 조합**
- `backdrop="none"` + `size="lg"` — 뒤 영역을 거의 가려놓고 non-modal 흉내. `locked` 또는 `scrim`으로.
- `dismissible=false` + `disableEscape=true` + `footer` 없음 — 사용자가 Drawer를 닫을 방법이 전혀 없음.
- 같은 페이지에서 서로 다른 `side` 혼용.

### 조합 예시
```tsx
// 기본 — 우측 보조 패널
<Drawer
  open={open}
  onOpenChange={setOpen}
  title="상세 보기"
  dismissLabel="닫기"
  footer={
    <>
      <Button variant="outline" onClick={() => setOpen(false)}>닫기</Button>
      <Button variant="primary" onClick={save}>저장</Button>
    </>
  }
>
  {/* children 자유 — 리스트·탭·폼·이미지 어떤 것이든 */}
</Drawer>

// 상주형 사이드 패널 (non-modal)
<Drawer
  open={open}
  onOpenChange={setOpen}
  side="right"
  size="sm"
  backdrop="none"
  title="사이드 패널"
  dismissLabel="닫기"
>
  {/* 뒤 영역 계속 조작 가능 */}
</Drawer>

// 저장 중 실수 방지
<Drawer
  open={saving}
  onOpenChange={() => {}}
  title="진행 중"
  description="창을 닫으면 작업이 중단될 수 있어요."
  backdrop="locked"
  dismissible={false}
  disableEscape
>
  {/* ProgressBar 등 */}
</Drawer>
```
