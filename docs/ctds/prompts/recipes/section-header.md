# Section Header

### 원칙
페이지 바디 안의 **섹션 경계**를 알리는 중간 블록. Page Header보다 작고 조용하다. 섹션이 반복될 때 **같은 리듬·같은 위계**로 등장해야 페이지가 흩어지지 않는다.

### Anatomy
한 줄 row + (옵션) 설명.

```
[h2 title] [count] [actions]   ← 필수: h2, 옵션: count badge / 우측 액션
[description]                   ← 옵션: 1줄 설명 (muted)
```

- title과 count: `space-2` (한 줄 안)
- title row와 description: `space-1`
- 섹션 header와 body(리스트/카드 등) 사이: `space-3`. **body 내부 아이템끼리 gap(space-1)보다 반드시 한 단계 더 넓어야** 위계 성립. 둘이 같으면 "타이틀과 아이템이 같은 레벨"로 뭉쳐 보임
- 섹션끼리는 **반복되는 작업 단위**면 `space-20`(80px), 섹션 내부 블록 묶음이면 `space-6` ([[ASSEMBLY]] §2a 갭 가이드)

### Do
- h2: **`text-lg` 기본**, 랜딩 리듬이면 `text-xl` 까지. **`font-medium`** ([[tokens/typography]] "섹션 h2/h3는 semibold 금지"). text-xl 이상은 "크고 얇은" 함정에 빠지기 쉬움 — 콘솔 리듬에서는 피함
- count badge: [[components/badge]] `soft` variant, title 바로 오른쪽
- actions는 title row 끝에 — `flex: 0 0 auto`
- actions 중 가장 흔한 "새로고침·더보기"는 [[components/icon-button]] `ghost` 또는 `outline`
- 액션이 2개 이상이면 서로 간 gap `space-1`

### Don't
- [HARD] `<section>` 태그를 쓰지 않는다 — AppShell의 `.content section`이 `padding-top: space-20`(80px)을 꽂아 "섹션 머리에 거대한 여백" 함정 발생. `<div>`로 짠다 ([[feedback-no-semantic-tags-in-components]])
- [HARD] h2를 `font-semibold`/`font-bold`로 쓰지 않는다 — [[tokens/typography]] font weight cap
- [HARD] h2 아래에 `border-bottom`을 깔지 않는다. 섹션 분리는 **gap**이 담당. 선 + 공간은 이중 분리
- [HARD] 섹션끼리 `space-6` 이상 gap으로 분리하지 않는다 — 각 섹션이 border/배경으로 분리돼 있으면 과한 공간은 "구조가 끊긴" 결과 ([[tokens/spacing]] Don't)
- [SOFT] title row에 액션이 **3개 이상**이면 Toolbar를 쓴다. 액션이 많으면 섹션이 아니라 toolbar가 맞음

### Fallback
설명이 애매하면 생략. actions도 없으면 h2 단독으로. count badge는 숫자가 **의미 있을 때만**(총 몇 개인지 알아야 하는 리스트 등) — 장식용 금지.

### 조립 예시
```tsx
<div>
  <header className="section-header">
    <div className="title-row">
      <h2>작업 계획</h2>
      <Badge variant="soft">4</Badge>
      <div className="actions">
        <IconButton icon={<Icon name="arrow-clockwise" />} variant="ghost" aria-label="새로고침" />
      </div>
    </div>
    <p className="description">
      요청한 계획을 검토하고 승인하세요.
    </p>
  </header>
  <div className="section-body">
    {/* 섹션 바디 */}
  </div>
</div>
```

```css
.section-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}
.section-header .title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.section-header h2 {
  font-size: var(--text-lg);
  font-weight: var(--font-weight-medium);
  line-height: var(--lh-tight);
}
.section-header .actions {
  display: flex;
  gap: var(--space-1);
  margin-left: auto;
}
.section-header .description {
  color: var(--fg-muted);
  font-size: var(--text-sm);
}
```

### 관련
- [[recipes/page-header]] — 상위 블록. 위계상 h1 → h2
- [[components/badge]] — count badge
- [[components/icon-button]] — 섹션 액션
- [[tokens/spacing]] — 섹션 간 gap
- [[tokens/typography]] — font weight cap
