# MetricCard

### 원칙
대시보드 상단에 조밀하게 늘어서는 KPI/Stat 카드. 라벨 → 큰 숫자 → delta Badge 로 "지금 숫자 하나" 를 전달한다. 숫자 뒤에 추세 신호를 색으로 겹치지만, 숫자 자체는 중립 톤으로 유지해 여러 장이 나란히 서도 색이 튀지 않는다. 긴 설명이 필요하거나 액션이 있으면 [[components/callout]] 영역이고, 리스트/표의 반복 레코드는 [[components/table-row]] 영역이다.

### Do
- 한 카드엔 숫자 하나. `value`는 **짧게** — "72%", "4건", "₩1.2M" 처럼 단위 포함 한 토큰.
- 추세는 `trend`로 넘기고 숫자는 `deltaLabel`에만. Badge는 자동으로 생성(상승=success+▲ / 하락=destructive+▼ / 유지=info+–).
- 그리드로 늘어세울 때는 4~5열, 모든 카드 `variant` 동일. 섞으면 집중도가 깨진다.
- 숨은 drill-down 링크로 쓰고 싶으면 `href` 넘긴다 — hover 배경 + focus ring이 자동 활성.
- `description`은 "vs 지난주" 같은 비교 축만. 두 줄 이상이면 Callout 영역.

### Don't
- `value`에 두 줄 텍스트, 긴 서술, 통화·단위를 라벨로 분리해 큰 숫자만 외롭게 두지 않는다.
- `trend`와 `delta`를 둘 다 넘기지 않는다 — `delta`를 넘기면 자동 매핑이 무시된다.
- `trend="down"`인데 숫자상 "좋은" 하락(예: 미결 결재 ↓)일 때도 색을 success로 뒤집지 않는다. 추세 색은 **방향**만 신호한다. 좋음/나쁨 해석은 `description`이나 라벨에서 한다.
- 그림자로 depth 쌓지 않는다. Shape 축이 shadow를 쥐었다면 간접 반영만.
- 아이콘을 숫자 옆에 두지 않는다. 아이콘은 라벨 왼쪽 보조 신호.

### Fallback
`variant` 애매하면 `line`. `trend` 애매하면 생략(delta Badge 숨김). `href`/`onClick` 없이도 완결된다.

`bare`는 "부모가 분리를 담당하는" 자리에서만 — 혼자 쓰면 안 됨. pure 좌표에서 상단 hairline + 수직 hairline으로 strip을 만든 자리, 또는 섹션 안 한 줄 수평 나열에서 사용.

### 관련
- [[components/callout]] — 긴 설명·CTA가 있는 공지. MetricCard는 단일 수치, Callout은 서술.
- [[components/badge]] — Badge pill로는 delta를 쓰지 않지만, 수동 `delta` slot에 Badge를 넣을 수 있음.
- [[components/table-row]] — 숫자 반복 레코드. 4개 이상이고 비교·정렬이 필요하면 테이블.
- [[axes/shape]] — radius 성향을 흡수. 자체 리터럴 없음.
- [[axes/density]] — compact에선 그리드 열 수 ↑, comfortable에선 ↓.
- [[tokens/color]] — `--bg` · `--bg-subtle` · `--border` · `--fg` · `--fg-muted` 만 사용.

### Props 시그니처
```tsx
<MetricCard
  label={ReactNode}                              // required — 캡션
  value={ReactNode}                              // required — 큰 숫자
  icon={IconName}                                // 선택 — 라벨 왼쪽
  trend="up | down | flat"                       // 추세 방향. 색 자동 매핑
  deltaLabel={ReactNode}                         // trend와 짝. "+8%p"
  delta={ReactNode}                              // 수동 override. trend/deltaLabel 무시
  description={ReactNode}                        // 선택 — value 아래 보조 설명
  variant="line | soft | bare"                   // default: line
  href={string}                                  // 있으면 <a>로 렌더. hover/focus 활성
/>
```

### Variant 매트릭스

| variant | 표면 | 경계 | padding | 용도 |
|---|---|---|---|---|
| `line` | `--bg` | `1px solid --border` | 있음 | 운영 콘솔·조밀 그리드. hairline만. 기본값 |
| `soft` | `--bg-subtle` | 투명 | 있음 | 서술형 대시보드·분위기 있는 레이아웃. 경계 대신 표면 톤으로 depth |
| `bare` | 투명 | 없음 | 없음 | pure 좌표 전용. 부모가 hairline/톤으로 분리를 담당하는 strip 안에서만. 혼자 쓰지 않는다 |

**trend × 색 매핑 (자동)**

delta는 Badge pill이 아니라 **inline 텍스트 + 아이콘** 조합. 색은 토큰 그대로 입힌다 — 배경 없음.

| trend | Color | Icon |
|---|---|---|
| `up` | `--success` | `trend-up` |
| `down` | `--destructive` | `trend-down` |
| `flat` | `--fg-muted` | `minus` |

**금지 조합**
- `variant=soft` + 그림자 추가 — 표면 톤이 depth를 쥐고 있는데 그림자까지 쌓이면 Shape 축 신호가 깨진다.
- `trend` 매핑을 "좋음=green/나쁨=red" 가치판단으로 뒤집기 — 색은 **방향**만. 의미 반전은 라벨/설명에서.
- 한 그리드 안에 `line` + `soft` + `bare` 혼용 — depth 레일이 깨진다. 그리드 단위로 variant 통일.
- `value`에 Badge나 Chip 삽입 — 숫자 토큰은 하나여야 한다.
- `bare`를 분리 장치 없는 자리에 혼자 사용 — 부모 strip(상단 hairline + 수직 hairline, 또는 bg 톤 교대)이 없으면 카드가 서로 뭉쳐 "덜 가둠"이 아니라 "덜 담음"으로 보인다.
- `bare` + 부모 셀에 padding 생략 — bare는 자체 padding을 비웠으므로 **부모 셀(strip 안의 각 cell)이 좌우 padding을 반드시 책임져야** 숫자가 hairline에 붙지 않는다. [[components/list-item]] "조립 — 부모 wrapper 공식"과 같은 원리로, chrome 없는 variant는 부모가 공간 공식을 전담.

### 조합 예시

```tsx
// 운영 콘솔 — 조밀한 KPI 4카드
<section className="grid grid-cols-4 gap-3">
  {metrics.map((m) => (
    <MetricCard
      key={m.id}
      variant="line"
      label={m.label}
      value={m.value}
      trend={m.trend}
      deltaLabel={m.delta}
    />
  ))}
</section>

// 아이콘 + 설명이 붙은 "분위기" 대시보드
<MetricCard
  variant="soft"
  icon="chart-line"
  label="이번 주 완료율"
  value="72%"
  trend="up"
  deltaLabel="+8%p"
  description="vs 지난주 평균"
/>

// 수동 delta (Badge 자체를 커스텀) — trend 자동 매핑 off
<MetricCard
  label="대기 중 결재"
  value="4건"
  delta={<Badge variant="soft" status="warning">주의</Badge>}
/>

// drill-down 링크 카드
<MetricCard
  href="/approvals"
  label="대기 중 결재"
  value="4건"
  trend="down"
  deltaLabel="-2건"
/>

// pure 좌표 — bare variant를 hairline strip 안에서.
// 부모가 상단 border-top + 자식 간 수직 border-right으로 분리를 담당.
<section className="metricsStrip">  {/* border-top: 1px solid border-subtle */}
  {metrics.map((m) => (
    <MetricCard
      key={m.id}
      variant="bare"
      label={m.label}
      value={m.value}
      trend={m.trend}
      deltaLabel={m.delta}
    />
  ))}
</section>
```
