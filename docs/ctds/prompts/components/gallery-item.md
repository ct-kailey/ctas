# GalleryItem

### 원칙
갤러리뷰 그리드에서 썸네일을 전면에 세우고 그 아래 title·description·meta·actions를 서술하는 콘텐츠 카드. 미디어가 주인공이고 텍스트는 꼬리표. 선택 카드가 아니라 "보여주고 열어가는" 카드 — 선택 상태는 가지지 않는다. 반복 레코드를 비교·정렬해야 하면 [[components/table-row]], 숫자 하나만 전달하면 [[components/metric-card]], 옵션 중 하나를 고르는 자리면 [[components/choice-card]].

### Do
- **media 필수**: 썸네일이 없으면 이 컴포넌트가 아니다. 자산이 아직 없으면 placeholder라도 넣어 자리를 지킨다.
- **layout 선택 기준**: `vertical`은 썸네일을 전면에 세우는 **그리드 갤러리** 용(이미지 비중 ↑). `horizontal`은 썸네일 옆에 title·description·meta가 길게 서술되는 **세로 리스트** 용(텍스트 비중 ↑). 블로그 아카이브·검색 결과·세션 목록처럼 "읽는 콘텐츠"는 horizontal.
- **그리드로 배치(vertical)**: `display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--space-4)` 가 기본 리듬. 열 수는 Density 축에 따라 자동 조절되게 min 폭만 고정.
- **세로 스택(horizontal)**: `display: flex; flex-direction: column; gap: var(--space-6)` 로 쌓는다. 카드끼리 붙지 않도록 gap 최소 `space-6`.
- **aspect 통일**: 한 리스트/그리드 안의 카드는 전부 같은 `aspect`. 16/9 가로형이 기본, 세로 포스터형 콘텐츠(책/영상 커버)만 3/4.
- **actionPosition 선택 기준**: 호버 전 보여야 하는 상시 액션(공개·북마크 토글 등)이면 `overlay`, 카드 전체가 링크일 때 보조 액션(⋯ 메뉴)이면 `footer`. 둘 다 쓰면 overlay/footer 중 하나로만 통일.
- **meta는 muted 한 줄**: [[components/badge]](카테고리·상태 라벨) + inline 날짜/카운트 텍스트 조합. 두 줄이 되면 description으로 승격.
- **href 또는 onClick이 있을 때만 hover elevation 활성**: 정적 카드는 떠오르지 않는다. elevation은 썸네일에만 적용 — body에는 그림자/톤 변화 없음.

### Don't
- **meta에 [[components/chip]] 사용 금지**. Chip은 검색 필터·다중 선택 전용(사용자가 제거하는 값). 카드 카테고리·태그 라벨은 전부 Badge (`variant="soft"`).
- **meta 토큰 사이 가운뎃점(`·`·`•`·`|`) 금지**. 저자·날짜·좋아요·댓글 등을 나열할 때 구분자는 짧고 연한 세로 hairline. 가운뎃점은 글자처럼 읽혀 라인에 시각 노이즈를 더함. 전역 룰.
- 카드 전체에 테두리·배경 chrome 추가 금지. 썸네일 radius 외의 경계는 두지 않는다. 분위기 있는 그리드가 필요해도 카드 chrome이 아니라 **그리드 간격·행 구분**으로 해결.
- 선택 상태(selected·checked) 흉내 금지 — border accent나 ring 승격 금지. 선택이 필요하면 다른 카드.
- media 위에 title/description 글자 overlay 금지. 글자가 사진 위에 겹치는 레이아웃은 썸네일 가독성과 축 스왑을 둘 다 깬다. overlay 슬롯은 액션 전용.
- actions에 full-width Button 금지. IconButton 또는 Button(`size="sm"`, `variant="ghost|outline"`)만. actions가 primary CTA가 되는 순간 이건 카드가 아니라 다른 컴포넌트.
- aspect 값 바깥의 임의 `aspect-ratio` inline 금지. 네 값(`16/9`·`4/3`·`1/1`·`3/4`) 외가 필요하면 그리드 설계가 틀렸을 가능성.

### Fallback
- `layout` 미지정 시 `vertical`.
- `aspect` 미지정 시 `16/9`.
- `actionPosition` 미지정 시 `footer`.
- `href`/`onClick`이 둘 다 없으면 hover elevation 비활성 — 정적 카드.

### 관련
- [[components/choice-card]] — 선택이 화면 주 액션인 카드. GalleryItem은 선택 상태 없음.
- [[components/selectable-card]] — 폼 안 옵션 리스트형 선택 카드.
- [[components/metric-card]] — 숫자 하나 전달. 미디어 없음.
- [[components/table-row]] — 반복 레코드 비교·정렬이 필요하면 테이블.
- [[components/empty-state]] — 그리드가 비었을 때. GalleryItem 그리드 안이 아니라 영역 전체를 대체.
- [[tokens/radius]] — 썸네일에 `radius-md` 토큰.
- [[axes/density]] — 그리드 열 수가 density 따라 자동 변동.

### Props 시그니처
```tsx
<GalleryItem
  media={ReactNode}                                 // required — 썸네일 슬롯 (img/video/svg)
  layout="vertical | horizontal"                    // default: vertical
  aspect="16/9 | 4/3 | 1/1 | 3/4"                   // default: 16/9
  title={ReactNode}                                 // required
  description={ReactNode}
  meta={ReactNode}                                  // Badge·날짜 자유 조합. muted
  actions={ReactNode}                               // IconButton 또는 Button sm ghost/outline
  actionPosition="footer | overlay"                 // default: footer
  href={string}                                     // 있으면 <a>로 렌더. hover elevation 활성
  disabled={boolean}
/>
```

### Variant 매트릭스

**layout × 전형 용례**

| layout | 전형 | 썸네일 폭 | title 크기 |
|---|---|---|---|
| `vertical` | 그리드 갤러리, 포스터·블로그 커버 | 100% | `text-sm` |
| `horizontal` | 세로 리스트, 블로그 아카이브, 검색 결과 | 고정(~16rem) | `text-lg` |

**aspect × 콘텐츠 성격**

| aspect | 전형 콘텐츠 |
|---|---|
| `16/9` | 영상 썸네일, 블로그 커버, 와이드 스크린샷 (기본) |
| `4/3` | 제품 사진, 일반 이미지 |
| `1/1` | 아바타형·앨범 커버·프로덕트 그리드 |
| `3/4` | 책/영화 포스터, 세로 모바일 캡처 |

**금지 조합**
- `layout="horizontal"` + `aspect="3/4"` — 세로 포스터가 왼쪽에 길쭉하게 서면 리스트 높이가 들쭉날쭉해지고 title row 정렬이 깨짐. horizontal에서는 가로형(`16/9` · `4/3`)만.
- `layout="horizontal"` + 그리드 배치 — horizontal은 세로 스택 전용. 그리드로 쌓으면 각 셀 내부가 좁아져 media 고정 폭이 body를 밀어버림.
- `actionPosition="overlay"` + 반투명 overlay 배경 추가 — media 위에 글자 겹치는 레이아웃 유도. overlay는 액션 아이콘 자체만.
- `aspect="1/1"` + title 3줄 이상 — 정사각 카드에 긴 텍스트는 밸런스 깨짐. 1줄 title이면 1/1, 2줄까지면 4/3 이상.

### 조합 예시

```tsx
// 블로그/뉴스 — 와이드 썸네일 + 메타 + ⋯ 메뉴
<section
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))",
    gap: "var(--space-4)",
  }}
>
  {posts.map((p) => (
    <GalleryItem
      key={p.id}
      href={`/posts/${p.id}`}
      media={<img src={p.thumb} alt="" />}
      aspect="16/9"
      title={p.title}
      description={p.excerpt}
      meta={
        <>
          <Badge variant="soft">{p.category}</Badge>
          <span>{p.date}</span>
        </>
      }
      actions={
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Icon name="dots-three" />}
          aria-label="더보기"
          onClick={(e) => { e.preventDefault(); openMenu(p.id); }}
        />
      }
    />
  ))}
</section>

// 포스터 그리드 — 세로형 + overlay 저장 토글
<GalleryItem
  href={`/movies/${m.id}`}
  media={<img src={m.poster} alt="" />}
  aspect="3/4"
  title={m.title}
  meta={<Badge variant="soft" status="info">{m.year}</Badge>}
  actionPosition="overlay"
  actions={
    <IconButton
      size="sm"
      variant="ghost"
      icon={<Icon name="star" />}
      aria-label="저장"
    />
  }
/>

// 블로그 아카이브 — horizontal 리스트
<section style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
  {posts.map((p) => (
    <GalleryItem
      key={p.id}
      href={`/posts/${p.id}`}
      layout="horizontal"
      media={<img src={p.thumb} alt="" />}
      title={p.title}
      description={p.excerpt}
      meta={
        <>
          <span>{p.author}</span>
          <span className={styles.sep} aria-hidden />
          <span>{p.date}</span>
          <span className={styles.sep} aria-hidden />
          <span>♥ {p.likes}</span>
        </>
      }
    />
  ))}
</section>
```
