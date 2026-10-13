# EmptyState

### 원칙
리스트·테이블·대시보드 영역이 비었을 때 그 영역을 통째로 채우는 자리채움. 세로 중앙정렬된 아이콘/일러스트 + 타이틀 + 설명 + 액션 조합. 사용자가 "로드가 실패했나?"를 묻기 전에 **"비어있다 + 다음 행동"**을 즉시 보여준다. 소형 안내 카드(사이드바 등 공간 일부에 상주)인 [[components/callout]]과 달리, EmptyState는 **빈 컨테이너 전체**를 차지해 다른 UI 없이 혼자 선다.

### Do
- 리스트/테이블/카드 그리드 **첫 데이터 없음**, **검색/필터 결과 0개**, **권한 없음·접근 불가**에 쓴다.
- 반드시 **다음 행동**을 제시한다 — Button 1개(새로 만들기·필터 초기화 등). action 없는 EmptyState는 "막다른 골목"이므로 지양한다.
- `size`로 영역 크기에 맞춘다. 작은 패널·사이드 리스트는 `sm`(기본), 메인 콘텐츠 영역은 `md`. 페이지 전체 자리채움도 `md`를 쓴다 — 과한 비율 금지.
- 시각 요소는 `illustration` slot(ReactNode)이 우선. 없으면 `icon`(IconName). 둘 다 생략하면 텍스트만 — 전환 상태(검색 중, 로딩 직후)에서만 허용.
- 액션은 [[components/button]] slot. **Button 1개**, `variant="outline"` + `size="sm"` 조합이 디폴트. 자리채움 공간이라 primary로 강조할 필요 없음 — outline이 조용하고 어떤 톤의 EmptyState에서도 어긋나지 않는다.

### Don't
- 카드/패널 **옆자리**에 작게 끼워넣지 않는다 — [[components/callout]] 영역. EmptyState는 컨테이너 전체를 차지하는 자리채움.
- 임시 피드백(요청 완료, 저장 성공)에 쓰지 않는다 — Toast.
- 타이틀을 "No data"처럼 상태만 서술하지 않는다. **원인 또는 해결** 중 하나를 담는다 (예: "아직 추가된 멤버가 없어요", "검색 결과가 없어요 — 필터를 바꿔보세요").
- `illustration` slot에 큰 외부 이미지(200px+)를 넣지 않는다 — 자체 크기를 size에 맞게 조절해서 넘긴다 (`sm`≈48~64px, `md`≈72~96px 안팎).
- 액션에 destructive variant 금지 — 빈 상태의 primary CTA는 생성/탐색이지 삭제가 아님.
- 액션 Button `size`에 `md`/`lg` 금지. EmptyState 내부 Button은 전부 `sm`.

### Fallback
`size` 애매하면 `sm`. 시각 요소 애매하면 `icon`만. 액션은 primary 1개로 시작.

### 관련
- [[components/callout]] — 소형 안내 카드. 공간 일부에 상주하는 "곁다리". EmptyState는 전체 자리채움.
- [[components/button]] — actions 슬롯의 실제 요소. size `sm`/`md`만 허용.
- [[axes/icon]] — icon slot은 Icon 컴포넌트 경유 강제.
- [[axes/density]] — size가 영역 비례지만 외곽 padding은 `--space-scale`로 함께 스왑.

### Props 시그니처
```tsx
<EmptyState
  size="sm | md"                      // default: sm
  illustration={ReactNode}            // 시각 요소 우선순위 1
  icon={IconName}                     // 시각 요소 우선순위 2 (illustration 없을 때만)
  title={ReactNode}                   // required
  description={ReactNode}
  actions={ReactNode}
/>
```

### Variant 매트릭스
단일 축 — `size`만. 색/강조는 변하지 않는다 (빈 상태는 신호가 아니라 자리채움).

| size | 용도 | 시각 요소 권장 크기 |
|---|---|---|
| `sm` | 패널·사이드 리스트·좁은 카드 안 | icon ≈24px 또는 48~64px 일러스트 |
| `md` | 메인 콘텐츠 영역·페이지 자리채움 | icon ≈32px 또는 72~96px 일러스트 |

**금지 조합**
- 액션 Button `variant="destructive"` — 빈 상태 CTA는 삭제가 아님.
- 액션 Button `size="md"`/`"lg"` — EmptyState 내부는 전부 `sm`.
- 액션 Button 2개 이상 — EmptyState는 Button 1개만. 복수 액션이 필요하면 Toolbar/Callout 영역.
- `illustration`과 `icon` 동시 지정 — illustration이 있으면 icon은 무시(병치 금지). 사용자 혼란 방지.

### 조합 예시
```tsx
<EmptyState
  size="md"
  icon="envelope"
  title="아직 받은 메시지가 없어요"
  description="팀원을 초대하거나 첫 메시지를 보내보세요."
  actions={
    <Button variant="outline" size="sm" leftIcon={<Icon name="plus" />}>
      새 메시지
    </Button>
  }
/>
```
