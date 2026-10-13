# Modal

### 원칙
흐름을 끊고 한 가지 결정·입력·확인에 집중시키는 중앙 다이얼로그. 결과가 아니라 **다음 행동**을 요구할 때 쓴다. 결과 알림은 [[components/toast]], 상주 안내는 [[components/callout]].

### Do
- **한 번에 하나의 결정**만. 두 가지 질문이면 Stepper 또는 두 모달로 분리.
- `title` 필수. 명사형 짧게(채널 생성 · 삭제 확인). 질문형("정말 삭제하시겠습니까?")은 `description`으로.
- **설명 문구는 `description` prop에 넣는다.** 헤더 영역 안에서 title 바로 아래 바짝 붙어, 하나의 "소개" 묶음으로 읽힘. `children`(body)에 `<p>`로 설명 넣지 않는다 — children은 **진짜 자유 콘텐츠(Input/Image/List/Form 등)** 전용 영역이고 title에서 떨어져 자리함.
- 설명이 2~3줄을 넘어가면 모달 자리가 아님 — 페이지 또는 Drawer로.
- children은 **자유 ReactNode** — Input/Image/List/Form 등. description과 분리된 아래 영역.
- `footer`는 액션 Button들을 넘김. **우측 정렬 · 최대 2~3개**. 순서는 **좌: outline(취소/이전), 우: primary(확정/다음)**.
- primary variant는 Button `md`가 기본 — 모달 안 Input도 `md`로 맞춰 수직 리듬 유지.
- 파괴적 확인은 `destructive` variant Button을 primary 자리에. "진짜 삭제하시겠습니까?"의 최종 확인 자리.
- dismiss는 **헤더 우측 X · ESC 키** 두 가지. 둘 다 기본 on.
- 저장·업로드 중처럼 중단 시 데이터 유실이 큰 경우 `disableEscape`로 ESC 차단 + `dismissible={false}`로 X도 제거 → 사용자는 footer 액션으로만 진행/취소.

### Don't
- **오버레이(바깥) 클릭으로 닫히지 않는다** — 실수 유발 방지. prop으로도 열지 않음. 가볍게 닫히는 UI가 필요하면 [[components/popover]].
- 모달 안에 모달 금지. 흐름이 꼬이고 ESC가 어느 쪽을 닫는지 모호.
- footer에 primary 2개 금지 — 무엇이 "다음"인지 모호해짐.
- 모달 안에 전체 페이지 분량 콘텐츠 금지. 스크롤이 5번 이상 필요하면 모달이 아니라 페이지 또는 Drawer 자리.
- 비동기 로딩 전용으로 모달 띄우지 않는다 — 인라인 Spinner 또는 Progress 사용. 모달은 입력·결정 전용.
- title을 CSS `text-transform: uppercase`로 꾸미지 않는다.

### Fallback
질문이 애매하면 "결과 알림이면 Toast, 흐름을 끊고 입력·확정이 필요하면 Modal, 가볍게 미리보기면 Popover". 사이즈·오버레이 클릭 등 정책 변경이 필요해 보이면 사용자에게 확인.

### 관련
- [[components/toast]] — 휘발성 결과 알림. Modal은 액션 요청.
- [[components/callout]] — 상주 안내.
- [[components/button]] — footer의 액션. 파괴적 확인은 `destructive` variant.
- [[primitives/fade]] · [[primitives/scale]] — overlay fade + content scale 조합.
- [[axes/motion]] — content scale 시작값(0.94/0.96/0.98) 스왑.
- [[tokens/z-index]] — overlay는 `z-overlay`, content는 `z-modal`.

### Props 시그니처
```tsx
<Modal
  open={boolean}
  onOpenChange={(open: boolean) => void}
  title={ReactNode}                 // required
  description={ReactNode}           // 헤더 영역 안, title 바로 아래 한두 줄 설명
  titleSrOnly={boolean}             // 시각적 숨김 (일러스트 중심 모달 등)
  footer={ReactNode}                // Button들을 넘김. 없으면 footer 자체 미렌더
  dismissible={boolean}             // default: true (헤더 X 버튼)
  dismissLabel={string}             // X 버튼 스크린리더 라벨 (i18n은 호출부)
  disableEscape={boolean}           // ESC 닫힘 차단 (중요 작업 중)
>
  {children}                        // 자유 ReactNode — Input / Image / Form / List 등. description과 분리된 아래 영역
</Modal>
```

### Variant 매트릭스
Modal은 **단일 시각**이다. 사이즈·테마·톤 variant 없음 — 콘텐츠 자유도로 다양성을 담당.

| prop | 값 | 결과 |
|---|---|---|
| `dismissible` | `true`(기본) / `false` | 헤더 X 노출/제거 |
| `disableEscape` | `false`(기본) / `true` | ESC 키 닫힘 활성/차단 |
| `titleSrOnly` | `false`(기본) / `true` | 헤더 title 시각적 숨김 (스크린리더엔 유지) |

**금지 조합**
- `dismissible=false` + `disableEscape=true` + `footer` 없음 — 사용자가 모달을 닫을 방법이 전혀 없음.
- `titleSrOnly=true` + 헤더에 title 역할을 하는 다른 요소 없음 — 시각적 맥락 상실.

### 조합 예시
```tsx
// 간단한 확인 — description만, children 없음
<Modal
  open={open}
  onOpenChange={setOpen}
  title="채널 생성"
  description="생성할 채널 이름을 입력해 주세요."
  footer={
    <>
      <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
      <Button variant="primary" onClick={next}>다음</Button>
    </>
  }
/>

// Input이 들어가는 폼 모달 — description은 title 짝, Input은 children(line variant)
<Modal
  open={open}
  onOpenChange={setOpen}
  title="새 폴더"
  description="새 폴더가 생성될 이름을 입력해 주세요."
  footer={
    <>
      <Button variant="outline" onClick={cancel}>취소</Button>
      <Button variant="primary" onClick={create}>생성</Button>
    </>
  }
>
  <Input
    label="폴더 이름"
    variant="line"
    placeholder="예: 2026 Q1 리서치"
    value={name}
    onChange={e => setName(e.target.value)}
    width="fill"
  />
</Modal>

// 파괴적 확인 (destructive primary)
<Modal
  open={open}
  onOpenChange={setOpen}
  title="프로젝트 삭제"
  description="이 작업은 되돌릴 수 없습니다. 모든 데이터가 영구 삭제됩니다."
  footer={
    <>
      <Button variant="outline" onClick={cancel}>취소</Button>
      <Button variant="destructive" onClick={remove}>삭제</Button>
    </>
  }
/>

// 저장 중 사용자가 실수로 닫지 못하게 (children에는 ProgressBar)
<Modal
  open={saving}
  onOpenChange={() => {}}
  title="저장 중"
  description="파일을 서버로 전송하는 중입니다."
  dismissible={false}
  disableEscape
>
  <ProgressBar value={progress} />
</Modal>
```
