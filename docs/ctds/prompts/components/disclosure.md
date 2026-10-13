# Disclosure

### 원칙
토글로 열고 닫는 섹션. caret·triggerLabel·body의 3단, 애니메이션은 `grid-template-rows: 0fr → 1fr` 트릭으로 자연 높이 측정 없이 CSS만으로. FAQ·설정 섹션·"적용 방법"처럼 기본은 접혀 있고 필요한 때만 펴는 자리.

### Do
- compound(`.Trigger` + `.Body`) 조합을 쓴다. flat API 없음 — 명시적으로 Trigger·Body 2단 조립.
- `defaultOpen`으로 초기 상태만 지정하고 uncontrolled로 두는 게 가장 흔함. 외부에서 열림 추적이 필요할 때만 `open` + `onOpenChange`.
- 하나의 섹션 안에 **여러 Disclosure**를 쌓을 때 각각 독립 — accordion처럼 "한 번에 하나만 열림"이 필요하면 상위에서 상태로 조율.
- `aria-expanded`·`aria-controls`가 자동 세팅됨. 소비자가 수동 추가할 필요 없음.

### Don't
- Modal·Drawer 안의 "숨겨진 설정" 자리에 Disclosure를 과용하지 않는다 — 모달 안 모달 느낌. 그 자리엔 섹션 구분(hairline + heading)이 먼저.
- Trigger 안에 `<button>`·`<a>` 중첩하지 않는다 — Trigger 자체가 button.
- Body의 콘텐츠 높이가 매번 뒤바뀌는 경우(실시간 스트림) grid-rows 애니메이션이 뚝뚝 끊김. 그 경우엔 `open` 토글 애니메이션을 쓰지 말거나 Disclosure 밖으로.

### Props 시그니처
```tsx
<Disclosure defaultOpen?={boolean} open?={boolean} onOpenChange?={(open: boolean) => void}>
  <Disclosure.Trigger>…라벨…</Disclosure.Trigger>
  <Disclosure.Body>…접히는 콘텐츠…</Disclosure.Body>
</Disclosure>
```

### 조합 예시
```tsx
<Disclosure defaultOpen>
  <Disclosure.Trigger>적용 방법</Disclosure.Trigger>
  <Disclosure.Body>
    1) ctds.config.json 커밋
    2) layout.tsx에 ThemeController 추가
    3) /ctds 라우트에서 축 설정
  </Disclosure.Body>
</Disclosure>

// 섹션 리스트 — 각자 독립 open
{faqs.map((f) => (
  <Disclosure key={f.id}>
    <Disclosure.Trigger>{f.q}</Disclosure.Trigger>
    <Disclosure.Body>{f.a}</Disclosure.Body>
  </Disclosure>
))}
```

### 관련
- [[components/sidebar]] — 섹션 접기 UI는 Sidebar.Section의 collapsible 사용
- [[axes/motion]] — Disclosure 애니메이션은 `--duration-base` × Motion 축에 반응
