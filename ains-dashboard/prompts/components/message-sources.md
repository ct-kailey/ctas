# Message Sources

### 원칙
AIMessage의 **하단 액션바 옆에 inline으로 붙는 chip**. 겹친 favicon stack + 라벨("Sources"). 블록이 아니라 액션 액세서리 — 실제론 [[components/ai-message]]의 `sources` prop으로 전달해 자동 배치. 전체 소스 리스트는 chip 클릭 시 popover로 (소비처가 조립).

### Do
- `<AIMessage sources={...}>` prop으로 전달. standalone으로 쓸 일은 거의 없음.
- `maxFavicons`로 겹쳐 보여줄 favicon 개수 조정 (기본 3). 넘어도 라벨은 그대로 — 숫자 노출 안 함(라벨만).
- 각 소스에 `icon` 넘겨 favicon을 명시, 없으면 중성 원형 placeholder.
- 클릭 시 소비처에서 popover(소스 전체 리스트) 열기 — 디자인 시스템 범위 밖.

### Don't
- 큰 chip 리스트로 늘려 메시지 하단에 깔지 않는다 (예전 디자인 — 폐기).
- Sources를 메시지 본문 중간에 두지 않는다 — 반드시 하단 액션바 라인.
- chip 안에 긴 설명·날짜 넣지 않는다 — 라벨 하나만.

### Props 시그니처
```tsx
<MessageSources
  sources={[{ id, label, href?, icon? }]}
  label="Sources"                     // default
  maxFavicons={3}                     // default
  onClick={() => void}                // 소스 전체 popover 열기 등
/>
```

### 레이아웃
- 외곽: ghost pill (transparent → hover bg-subtle)
- padding: `space-1_5 space-3 space-1_5 space-2` (hover 영역 넉넉)
- gap: `space-1_5`
- 폰트: `text-sm`, `fg-muted` → hover `fg-strong`
- favicon stack: 각 원 `space-4`(16px), 서로 `space-1` negative margin으로 겹침
- 각 favicon에 box-shadow로 bg 색 ring (cutout 효과) — [[feedback-bg-or-stroke-only]] 예외: cutout은 "연결 모양 분리"가 목적이라 bg+stroke 금지 룰과 다른 범주
- 숫자 노출 없음 — 라벨만 (전체 리스트는 popover로)
