# Accordion

### 원칙
여러 섹션을 **접었다 폈다** 하는 구조 컴포넌트. 긴 콘텐츠를 압축해 "지금 중요한 것"만 보여주고, 사용자가 원할 때 세부를 펼친다. 설정 그룹·FAQ·상세 사양·단계별 체크리스트가 전형적인 자리. Radix `@radix-ui/react-accordion`을 감싼 compound 어댑터 — 열림 상태·높이 측정·키보드 네비·ARIA는 Radix가 처리하고, CTDS는 Trigger 레이아웃·caret·divider·card variant만 담당. [[components/collapsible]]과 비슷하지만 **여러 아이템**인 점이 다르다. 하나짜리면 Collapsible로.

### Do
- **"지금 보이는 것 vs 숨긴 것"의 비율이 1:3 이상일 때 쓴다.** 전부 다 중요하면 그냥 나열하는 게 낫다. Accordion은 "요약은 다 보이고, 세부가 선택적"인 리스트용.
- **섹션 라벨은 명사 하나로 짧게.** "일반" "알림" "결제" — 긴 문장형은 Accordion 자리가 아님. 사용자는 라벨만 보고 "펼칠지 말지" 판단.
- **`type="single" collapsible` 기본값.** 한 번에 한 섹션만 열림 + 열린 걸 다시 닫을 수 있음. 설정 UI의 표준 동작.
- **여러 섹션 동시 열기는 `type="multiple"`**. 체크리스트·비교·FAQ(사용자가 여러 질문 동시 열람)에만.
- **variant 선택**: 설명 블록 사이에 투명하게 녹여야 하면 `bare`(선·좌우 여백 전부 없음). 설정 그룹·FAQ 리스트는 `plain`(기본). 각 아이템이 독립 블록으로 보여야 하면 `card`.
- **leading 아이콘은 섹션 성격 명시용**. 설정 그룹의 "⚙ 일반 / 🔔 알림 / 💳 결제"처럼 **섹션끼리 아이콘 세트가 균질할 때만** 쓴다. 하나만 아이콘 있고 나머지 없으면 혼란.
- **trailing은 메타 정보**. "3개 변경됨" 배지, "4/8 완료" 숫자 등 사용자가 라벨만 보고 "열어볼 가치"를 판단하도록.
- **첫 섹션 defaultOpen**: 사용자가 가장 자주 보는 섹션이 명확하면 `defaultValue`로 열어둔다. 모르면 전부 닫힌 상태 OK.

### Don't
- **중첩 금지.** Accordion 안에 또 Accordion 금지. 깊이가 필요하면 섹션을 쪼개서 **별도 페이지**로 보내거나 좌측 Nav로 분리.
- **본문에 또 다른 Primary CTA 넣지 말 것.** 사용자가 섹션을 "펼쳐야만" 중요한 액션을 볼 수 있는 구조는 발견 실패를 유발. 핵심 CTA는 Accordion 밖 상단에.
- **길이가 들쭉날쭉한 본문 금지.** 어떤 섹션은 1줄, 어떤 섹션은 20줄이면 레이아웃이 요동친다. 긴 섹션은 아예 별도 페이지로.
- **Accordion과 Tabs 혼용 금지.** 둘 다 "숨기기 + 보이기"이지만: **Accordion은 세로 리스트, Tabs는 가로 전환**. 섹션 수가 3개 이하 + 서로 배타적이면 Tabs가 맞음. 섹션 수가 많거나 동시 열람 가능하면 Accordion.
- **애니메이션 커스터마이즈 금지.** Radix의 `--radix-accordion-content-height` 변수에 맞춰 CTDS 모션 토큰(`--duration-base` + `--ease-out`)으로 이미 처리. duration·ease 하드코딩은 [[feedback_no_hardcoded_values]] 위반.
- **라벨에 아이콘만 넣고 텍스트 빼는 것 금지.** 접근성·스캐닝 모두 깨짐.

### Fallback
type 애매하면 `single + collapsible`. variant 애매하면 `plain`. size 애매하면 `sm` ([[feedback_default_size_sm]]). defaultValue 애매하면 비워두기(전부 닫힘).

### 관련
- [[components/collapsible]] — Accordion의 1-아이템 버전. "더 보기" 토글 하나짜리.
- [[components/tabs]] — 섹션 수 ≤ 3 + 가로 전환이 자연스러우면 Tabs. Accordion은 세로 리스트.
- [[components/menu-item]] — Section variant는 사이드바 섹션 접힘에 사용. 메뉴 트리의 접힘은 Accordion이 아님.
- [[tokens/motion]] — `--duration-base` · `--ease-out`이 slide 애니메이션을 만든다.
- [[tokens/color]] — `--fg` · `--fg-strong` · `--hover` · `--border` · `--border` hairline.

### Props 시그니처
```tsx
<Accordion
  type="single | multiple"              // Radix 통과. 기본은 소비자가 결정 (단일/다중)
  collapsible={boolean}                 // single에서 열린 걸 다시 닫을 수 있는지. 기본 undefined → false
  value={string | string[]}             // controlled
  defaultValue={string | string[]}      // uncontrolled 초기값
  onValueChange={(v) => void}
  size="sm | md"                        // default: sm — Trigger 높이 · 폰트 크기
  variant="bare | plain | card"         // default: plain
>
  <Accordion.Item value="unique-id" disabled={boolean}>
    <Accordion.Trigger
      leadingIcon="gear"                // IconName — 간결 사용
      leadingActions={AccordionAction[]}// leadingIcon보다 우선
      trailingActions={AccordionAction[]}
    >
      섹션 라벨
    </Accordion.Trigger>
    <Accordion.Content>
      {/* 자유 콘텐츠 */}
    </Accordion.Content>
  </Accordion.Item>
</Accordion>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| closed | 라벨 `--fg`, caret 아래, 본문 숨김 |
| open | 라벨 `--fg-strong`, caret 180도 회전, 본문 slide-down |
| hover (closed) | Trigger 배경 `--hover` + 라벨 `--fg-strong` |
| hover (open) | 배경 변화 없음 — 상태 signal 유지 ([[feedback_hover_over_active]]) |
| focus-visible | `--focus-ring` outline |
| disabled | `--fg-disabled`, cursor not-allowed, 클릭·키보드 모두 꺼짐 |

### Size 가이드
| size | 언제 |
|---|---|
| `sm` | **기본.** 설정 패널·FAQ·관리 UI 밀도 높은 자리 |
| `md` | 콘텐츠 사이트의 섹션 리스트·랜딩 FAQ — 라벨이 조금 더 커야 할 때 |

### 조합 예시
```tsx
// 설정 패널 — plain + leading 아이콘 세트
<Accordion type="single" collapsible defaultValue="general">
  <Accordion.Item value="general">
    <Accordion.Trigger leadingIcon="gear">일반</Accordion.Trigger>
    <Accordion.Content>
      <Input label="프로필 이름" />
      <Switch label="자동 저장" />
    </Accordion.Content>
  </Accordion.Item>

  <Accordion.Item value="notifications">
    <Accordion.Trigger
      leadingIcon="bell"
      trailingActions={[<Badge key="c" size="sm">3</Badge>]}
    >
      알림
    </Accordion.Trigger>
    <Accordion.Content>...</Accordion.Content>
  </Accordion.Item>

  <Accordion.Item value="billing" disabled>
    <Accordion.Trigger leadingIcon="info">결제 (준비 중)</Accordion.Trigger>
    <Accordion.Content>...</Accordion.Content>
  </Accordion.Item>
</Accordion>

// FAQ — multiple + card variant (여러 질문 동시 열람 OK)
<Accordion type="multiple" variant="card">
  <Accordion.Item value="q1">
    <Accordion.Trigger>CTDS는 어떻게 설치하나요?</Accordion.Trigger>
    <Accordion.Content>npm으로 설치 후 ctds init 실행...</Accordion.Content>
  </Accordion.Item>
  <Accordion.Item value="q2">
    <Accordion.Trigger>테마는 어떻게 바꾸나요?</Accordion.Trigger>
    <Accordion.Content>...</Accordion.Content>
  </Accordion.Item>
</Accordion>

// Controlled — 외부 상태에 묶기
const [open, setOpen] = useState<string>("step-1");
<Accordion type="single" value={open} onValueChange={setOpen}>
  <Accordion.Item value="step-1">
    <Accordion.Trigger trailingActions={[<span key="s">1/4</span>]}>
      기본 정보
    </Accordion.Trigger>
    <Accordion.Content>...</Accordion.Content>
  </Accordion.Item>
</Accordion>
```
