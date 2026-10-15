# Page Header

### 원칙
페이지 바디 최상단에 쓰는 **"이 페이지가 뭘 하는 곳인가"** 블록. Topbar가 shell chrome(ID·전역 action)을 담는다면, Page Header는 **콘텐츠 레이어의 첫 블록**이다. [[components/topbar]]가 명시한 "큰 타이틀은 body 첫 블록 자리"를 받는 자리.

### Anatomy
3개 요소가 수직으로 쌓인다. (옵션 요소는 생략 가능)

```
[eyebrow]            ← 옵션: 상위 맥락 (breadcrumb·카테고리) — xs/muted
[h1 title] [actions] ← 필수: 큰 타이틀 + 우측 액션 (옵션)
[description]        ← 옵션: 1~2줄 서브텍스트, muted
```

- eyebrow와 title 사이: `space-1`
- title과 description 사이: `space-2`
- **블록 전체 아래 (다음 섹션까지)의 간격은 상위 wrapper 의 `gap` 이 담당**. `space-6` (앱 리듬) / `space-10` (랜딩 리듬). PageHeader 자체는 `margin-bottom` 을 걸지 않는다 ([[feedback_page_header_no_bottom_margin]]).
- actions는 title과 같은 row — `align-items: center`, `flex: 1 1 auto` title / `flex: 0 0 auto` actions

### Do
- h1: `text-4xl` (랜딩) / `text-3xl` (앱), **`font-medium` 또는 그 이하** ([[tokens/typography]] font weight cap)
- h1에 **반드시 `line-height: var(--lh-tight)`** 명시 ([[tokens/spacing]] "텍스트 gap·line-height")
- description: `text-base` / `color: var(--fg-muted)` / `max-width: 60ch`
- actions는 [[components/_variants]] 액션 매핑에 따름 — 중요=`primary`, 서브=`outline`
- 액션 2개 이상이면 서로 간 gap은 `space-1` 고정 ([[tokens/spacing]])

### Don't
- [HARD] h1 아래 `margin-bottom`을 자식(h1)이 걸고 **동시에** 부모 wrapper도 gap을 걸지 않는다 — 이중 여백 ([[tokens/spacing]] Don't)
- [HARD] h1을 `font-semibold`/`font-bold`로 쓰지 않는다 — [[tokens/typography]] font weight cap
- [HARD] uppercase + letter-spacing 조합 금지 — 메모리 [no-uppercase]
- [SOFT] eyebrow 없이 breadcrumb만 Topbar leading에 두는 패턴은 피한다 — 페이지 식별이 shell로 샌다. Topbar leading에는 workspace/section만, 페이지 이름은 body로

### Fallback
서브텍스트가 애매하면 생략. 설명이 1줄 미만이면 쓰지 않는다. actions도 없으면 h1 단독으로.

### 조립 예시

PageHeader → 다음 섹션 사이 간격은 **외부 wrapper 가 담당**. PageHeader 자체는 `margin-bottom` 을 걸지 않음.

```tsx
<div className="page-shell">
  <header className="page-header">
    {/* eyebrow 옵션 */}
    <div className="eyebrow">프로젝트</div>
    <div className="title-row">
      <h1>개발 계획·실행</h1>
      <div className="actions">
        <Button variant="outline" size="md">가져오기</Button>
        <Button variant="primary" size="md">새 계획</Button>
      </div>
    </div>
    <p className="description">
      확정본을 선택해 개발 계획을 요청하고, 계획과 작업 범위를 승인한 뒤 실행하세요.
    </p>
  </header>

  {/* 다음 섹션 — gap 이 PageHeader 와 섹션 사이 간격을 공급 */}
  <section>...</section>
</div>
```

```css
.page-shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);   /* 앱 리듬. 랜딩이면 --space-10 */
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1); /* eyebrow→title */
  /* margin-bottom 금지 — 상위 .page-shell 의 gap 이 담당 */
}
.page-header .title-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.page-header h1 {
  flex: 1 1 auto;
  font-size: var(--text-3xl);
  font-weight: var(--font-weight-medium);
  line-height: var(--lh-tight);
}
.page-header .actions {
  display: flex;
  gap: var(--space-1);
  flex: 0 0 auto;
}
.page-header .description {
  color: var(--fg-muted);
  margin-top: var(--space-1); /* title→description은 더 가깝게 */
  max-width: 60ch;
}
.page-header .eyebrow {
  font-size: var(--text-xs);
  color: var(--fg-muted);
}
```

### 관련
- [[recipes/section-header]] — 하위 섹션의 유사 패턴
- [[components/topbar]] — shell 쪽. "큰 타이틀은 body 첫 블록 자리" 지침의 수신처
- [[components/breadcrumb]] — eyebrow 자리에 쓸 수 있는 vendor
- [[tokens/spacing]] — 블록 아래 리듬 선택
- [[tokens/typography]] — font weight cap, lh-tight
