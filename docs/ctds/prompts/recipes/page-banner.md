# Page Banner

### 원칙
페이지 폭에 걸치는 **안내 바**. 공유 상태·만료 안내·시스템 공지·권한 경고 등 "이 페이지 전체에 적용되는 메타 상태"를 알린다. Callout과 다름 — Callout은 사이드바·리스트 끝의 **국소** 블록, Banner는 페이지 **상단/하단**의 전면 바.

관찰: 유저 페이지에서 ①상단 "공유 열람 10.20 만료" ②중간 "`</>` 자동 처리 안내" ③하단 "열람 권한 접속" 셋 다 Banner 성격인데 서로 다른 스타일로 조립됐다 — 이 레시피가 그 셋을 하나의 리듬으로 묶는다.

### Anatomy
한 줄 row.

```
[leading icon] [text (1~2줄)] [...spacer...] [action/dismiss]
```

- leading icon: 20px, [[components/icon]]
- text: `flex: 1 1 auto`, 1~2줄, `line-height: 1.4`
- action: [[components/button]] `variant="ghost"` 또는 간단한 link. **banner에서 primary 금지** — primary 액션이 필요하면 banner가 아니라 modal/dialog
- dismiss: [[components/icon-button]] `ghost` + close 아이콘 (옵션)

**padding:**
- 단일라인 (title만, 또는 1줄 메시지): 상하 `space-2`, 좌우 `space-3`
- 멀티라인 (title + sub, 또는 메타 라인 포함): 상하 `space-3`, 좌우 `space-4`
- 하단 조용한 안내: `data-size="sm"`로 다운스케일 — 상하 `space-2`, 좌우 `space-3`

**radius:** `var(--radius-md)` (단, 페이지 full-bleed로 쓰면 radius 0).

**gap:**
- leading↔text: 단일라인 `space-2`, 멀티라인 `space-3`
- text↔action: `space-3`
- banner.text 내부 title↔sub: `space-1` (space-0.5는 너무 타이트 — 두 줄이 녹아보임)

**leading icon 수직 정렬:** 멀티라인일 때 `align-self: flex-start` + `margin-top: space-0.5` — 센터 정렬이면 title보다 아이콘이 내려가 보임.

### Tone 체계
Banner는 톤 3종만 지원 — Callout과 통일.

| Tone | 자리 | 색 조합 |
|---|---|---|
| `info` | 상태 공지 (만료, 공유 모드) | `background: var(--bg-subtle)` + border 없음 |
| `warning` | 주의 (권한 제한, 임시 상태) | `background: var(--bg-warning-subtle)` + border 없음 |
| `critical` | 위험 (만료 임박, 오류) | `background: var(--bg-critical-subtle)` + border 없음 |

### Do
- leading icon은 tone에 맞춤 — info=`info`/`share-network`, warning=`warning-circle`, critical=`warning`. **아이콘 이름은 `web/components/Icon/Icon.tsx` 레지스트리에서 확인**
- 텍스트는 **1문장 명제 + (옵션) 부가 1문장** — 길어지면 banner가 아니라 Callout이나 dedicated page
- 액션 라벨은 **동사**로 짧게 ("공유 열람 종료", "자세히")
- 상단 banner면 Page Header 위에 둠. 블록 아래 gap: `space-4`
- 하단 banner면 섹션들 다 끝난 뒤, `space-6` 간격

### Don't
- [HARD] **배경 + 테두리 동시 사용 금지** ([[PRINCIPLES]] §5b). Banner는 **배경 톤만**, border는 transparent
- [HARD] primary 버튼 금지 — banner는 "알림" 자리, 주 액션은 다른 곳
- [HARD] banner 안에 chip·Badge 섞지 않는다 — 톤이 겹쳐 시끄러워짐. 상태 분류가 필요하면 Banner tone을 바꾼다
- [HARD] 아이콘 인라인 `<svg>` 금지 — [[components/icon]] 경유
- [SOFT] banner 3개 이상 동시에 쌓지 않는다. 2개 이상이 쌓이면 "뭐가 중요한지" 판독 불가. 정보가 많으면 하나의 banner + "자세히" 액션으로

### Fallback
- action 없으면 그 자리 생략, text가 끝까지 참
- dismiss만 있고 action 없으면 dismiss는 trailing 우측 끝

### 조립 예시
```tsx
{/* info: 공유 열람 상태 */}
<aside className="page-banner" data-tone="info">
  <Icon name="share-network" size={20} className="leading" />
  <div className="text">
    <strong>Kailey Kim님 프로젝트 공유 열람</strong>
    <span className="sub">
      조회 전용
      <span className="sep" aria-hidden="true" />
      10월 20일 오후 9시 53분 만료
      <span className="sep" aria-hidden="true" />
      Kailey 프로젝트 전체 공유
    </span>
  </div>
  <Button variant="ghost" size="sm">공유 열람 종료</Button>
</aside>
```

```css
/* 테두리 선언 없이 배경만 — bg+stroke 조합 금지 ([[PRINCIPLES]] §5b) */
.page-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
}
.page-banner[data-size="sm"] {
  padding: var(--space-2) var(--space-3);
  gap: var(--space-2);
}
.page-banner[data-tone="info"]     { background: var(--bg-subtle); }
.page-banner[data-tone="warning"]  { background: var(--bg-warning-subtle); }
.page-banner[data-tone="critical"] { background: var(--bg-critical-subtle); }

.page-banner .leading {
  color: var(--fg-muted);
  flex: 0 0 auto;
  align-self: flex-start;
  margin-top: var(--space-0\.5);
}
.page-banner .text {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  line-height: 1.4;
}
.page-banner .text .sub {
  font-size: var(--text-sm);
  color: var(--fg-muted);
}
```

### 관련
- [[components/callout]] — 국소 안내 블록 (사이드바·리스트 끝). Banner와 자리가 다름
- [[components/button]] — ghost 액션
- [[components/icon-button]] — dismiss
- [[tokens/color]] — bg-subtle, bg-warning-subtle, bg-critical-subtle
- [[PRINCIPLES]] §5b — 배경 또는 테두리
