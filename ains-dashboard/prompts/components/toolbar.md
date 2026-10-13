# Toolbar

### 원칙
IconButton 중심의 action 줄. 에디터·캔버스·갤러리 상단, 또는 "뜨 있는" 알약으로 콘텐츠 위에 떠서 액션을 모으는 자리. 단일 size — toolbar 안의 버튼은 전부 같은 사이즈여야 한다.

### Do
- `variant="floating"` 기본 — bg-elevated + shadow-md + radius-xl, 콘텐츠 위에 떠있는 알약. 캔버스·에디터·이미지 뷰어의 상단 중앙.
- `variant="attached"`는 콘텐츠에 붙은 bar — transparent + 하단 hairline. 페이지 상단에 "탭 아래 액션 바"로 쓸 때.
- 관련 액션은 `<Toolbar.Group>`으로 묶는다 — 내부는 좁은 gap, 그룹 간은 `<Toolbar.Divider>`.
- 좌·우 정렬이 필요하면 `<Toolbar.Spacer>`로 공간 밀기 — flex:1.
- toolbar 안엔 IconButton size="sm"이 기본. floating variant는 size="md"까지도 OK.

### Don't
- toolbar 안에 label 긴 Button을 섞지 않는다 — IconButton + Tooltip이 toolbar 패턴. 긴 label이 필요하면 그 자리는 toolbar가 아니라 액션 영역.
- 두 Toolbar를 세로로 쌓지 않는다 — 하나의 toolbar에 Group·Divider로 구분. 쌓으면 밀도·시선 둘 다 깨짐.
- `attached` variant에 shadow·radius-xl를 수동으로 추가하지 않는다 — floating을 쓰면 됨.
- Group 안에 또 Group을 중첩하지 않는다 — flat 2단(Toolbar > Group > IconButton).

### Props 시그니처
```tsx
<Toolbar
  variant?="floating | attached"              // default: floating
  stretch?={boolean}                           // default: variant로 자동 (attached=true, floating=false)
  role?={string}                               // default: "toolbar"
>
  {children}
</Toolbar>
```

Compound sub:
- `<Toolbar.Group>` — 관련 액션 묶음 (role="group")
- `<Toolbar.Divider>` — 세로 hairline
- `<Toolbar.Spacer>` — flex:1 공간 밀기

### 조합 예시
```tsx
// 에디터 — floating 알약, 좌/중/우 섹션
<Toolbar variant="floating">
  <Toolbar.Group>
    <IconButton size="sm" variant="ghost" aria-label="실행 취소" icon={<Icon name="arrow-u-up-left" />} />
    <IconButton size="sm" variant="ghost" aria-label="다시 실행" icon={<Icon name="arrow-u-up-right" />} />
  </Toolbar.Group>
  <Toolbar.Divider />
  <Toolbar.Group>
    <IconButton size="sm" variant="ghost" aria-label="굵게" icon={<Icon name="text-b" />} />
    <IconButton size="sm" variant="ghost" aria-label="기울임" icon={<Icon name="text-italic" />} />
  </Toolbar.Group>
  <Toolbar.Spacer />
  <Toolbar.Group>
    <IconButton size="sm" variant="ghost" aria-label="공유" icon={<Icon name="share" />} />
  </Toolbar.Group>
</Toolbar>

// 페이지 상단 — attached, 콘텐츠에 붙음
<Toolbar variant="attached">
  <Toolbar.Group>
    <Button size="sm" variant="ghost" leftIcon={<Icon name="plus" />}>새로 만들기</Button>
    <Button size="sm" variant="ghost" leftIcon={<Icon name="funnel" />}>필터</Button>
  </Toolbar.Group>
  <Toolbar.Spacer />
  <IconButton size="sm" variant="ghost" aria-label="보기 전환" icon={<Icon name="list" />} />
</Toolbar>
```

### 관련
- [[components/icon-button]] — toolbar 안 주 버튼
- [[components/button]] — label 짧은 액션
- [[components/tooltip]] — IconButton엔 Tooltip 필수
- [[components/breadcrumb]] — 페이지 상단에선 Breadcrumb + Toolbar 조합이 흔함
