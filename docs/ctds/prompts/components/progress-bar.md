# ProgressBar

### 원칙
얇은 가로 **라인 로딩바**. 두 모드: `value` 있으면 **determinate**(그 %로 채움), 없으면 **indeterminate**(무한 왕복). 페이지 상단 네트워크·라우팅 로딩, 또는 인라인 업로드/다운로드 진행률에 사용. **본격적 Progress UI는 Stepper·Meter**([[components/table-cell]])가 담당 — ProgressBar는 "로딩" 신호 전용.

### Do
- 네트워크·라우팅 로딩: `position="fixed"` + indeterminate(value 미지정).
- 업로드·다운로드 진행률: `position="inline"` + determinate(value 0~100).
- `active=false`로 숨기면 자동 fade-out. 즉시 unmount 금지(깜빡임).
- role=`progressbar` + aria-valuenow 자동.

### Don't
- 긴 폼의 단계 표시엔 쓰지 않는다 — [[components/stepper]].
- 작업 비율·사용량 표시엔 쓰지 않는다 — TableCellMeter 또는 Chart.
- value가 100 넘지 않도록 상위에서 보장 (컴포넌트가 clamp하지만 로직 책임).
- 색을 variant로 바꾸지 않는다. 상태색(destructive 등)은 Meter 쪽에서.

### Fallback
position 애매하면 `fixed`, active 애매하면 `true`.

### 관련
- [[components/stepper]] — 단계 진행 표시 (ProgressBar와 역할 분리)
- [[components/table-cell]] — TableCellMeter가 비율 바
- [[axes/motion]] — indeterminate 애니메이션 duration이 Motion 축에 반응

### Props 시그니처
```tsx
<ProgressBar
  value={number}                               // 0~100. 미지정 시 indeterminate
  position="fixed | inline"                    // default: fixed
  active={boolean}                             // default: true. false면 fade-out
/>
```

### Mode 매트릭스
| 모드 | 조건 | 시각 | 쓰임 |
|---|---|---|---|
| determinate | `value` 숫자 | %만큼 채움 | 업로드·다운로드·설치 |
| indeterminate | `value` 미지정 | 무한 왕복 | 네트워크·라우팅 로딩 |

### Position 매트릭스
| position | 자리 | 쓰임 |
|---|---|---|
| `fixed` | 화면 최상단 fixed | **기본** — 라우팅 로딩바(Linear/Vercel 패턴) |
| `inline` | 부모 안 inline | 폼 안 업로드 진행 |

### 조합 예시
```tsx
// 라우팅 로딩 — 상단 fixed indeterminate
{isLoading && <ProgressBar />}

// 업로드 진행 — inline determinate
<div className="upload-row">
  <span>{file.name}</span>
  <ProgressBar position="inline" value={file.progress} />
  <span>{file.progress}%</span>
</div>

// active 토글 — fade-out
<ProgressBar active={isPending} />
```
