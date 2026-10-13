# Avatar

### 원칙
사람·팀의 **식별 마커**. 이미지 → 이니셜 → 아이콘 순서로 자동 폴백. 10색 tint 팔레트에서 이름 해시 기반 안정 매핑 — 같은 사람은 항상 같은 색. shape으로 **사람/조직** 구분(circle/rounded), status로 **접속 상태** 뱃지. 축 영향 안 받는 고정 팔레트 (사용자 식별은 흔들리면 안 됨).

### Do
- 가능하면 `name` 전달 — 이니셜 폴백 + tint seed + aria 라벨 공용.
- `shape="circle"`은 사람·개인, `shape="rounded"`는 팀·조직·봇.
- `src` 로드 실패 시 자동으로 이니셜 폴백. `onError` 수동 처리 불필요.
- 접속 상태는 `status` prop. online/offline 두 값만.
- Sidebar.Profile·TableCell.Avatar에 쓰는 패스스루 패턴 활용.

### Don't
- hex·custom 색으로 tint 덮지 않는다. 10색 팔레트가 자동.
- status에 커스텀 값 금지 (busy/away 아직 미지원).
- aria-label 생략 금지 (`alt` 또는 `name` 중 하나는 필수).
- Avatar 안에 그라데이션·이모지·텍스트 2글자 넘김 금지 — 식별 신호 혼탁.
- 크기를 CSS로 override 금지. `size` prop만.

### Fallback
size 애매하면 `md`, shape 애매하면 `circle` (사람).

### 관련
- [[components/sidebar]] — Sidebar.Profile 안쪽
- [[components/table-cell]] — TableCellAvatar 안쪽
- [[components/badge]] — status 뱃지 시각 쌍
- [[components/avatar-upload]] — 업로드 가능한 Avatar wrapper (별도)
- [[tokens/color]] — `--avatar-tint-N-bg`·`--avatar-tint-N-fg` 10색

### Props 시그니처
```tsx
<Avatar
  size="xs | sm | md | lg | xl"               // default: md
  shape="circle | rounded"                    // default: circle
  src={string}                                // 이미지 URL (실패 시 자동 폴백)
  alt={string}                                // 접근성 대체 텍스트
  name={string}                               // 이니셜 추출 + tint seed + aria
  initials={string}                           // 이니셜 직접 지정 (name보다 우선)
  icon={ReactNode}                            // 이미지·이니셜 대신 아이콘
  status="online | offline"                   // 접속 뱃지 (미지정 시 뱃지 없음)
/>
```

### Size 가이드
| size | 쓰임 |
|---|---|
| `xs` | 10 — Chip leftIcon, 밀도 극한 리스트 |
| `sm` | 14 — TableCell.Avatar, 리스트 아이템 |
| `md` | 18 — **기본**, Sidebar.Profile |
| `lg` | 24 — 프로필 카드 |
| `xl` | 40 — 설정 페이지의 큰 아바타 |

### 폴백 체인
1. `src`가 있고 로드 성공 → 이미지
2. `initials` 또는 `name`에서 추출된 이니셜 → 색 배경 + 이니셜 2글자
3. `icon` → 아이콘 (`--fg-muted`)
4. 전부 없으면 → "?" 이니셜

**이니셜 추출 규칙**:
- 한글: 첫 글자 1개 (`"김희영"` → `"김"`)
- 영문: 첫 단어 앞 2글자 (`"Kim Heeyoung"` → `"Ki"`, `"AB"` → `"Ab"`)

**Tint 매핑**: `name` 또는 `initials` 해시 → 10색 중 하나. 같은 입력 = 같은 색 (사용자 식별 안정).

### 조합 예시
```tsx
// 가장 흔한 — 이름 + 이미지 + 상태
<Avatar size="md" name="희영" src="/avatars/hy.jpg" status="online" />

// 조직·팀 — rounded
<Avatar size="lg" name="디자인팀" shape="rounded" />

// 이미지 없고 이니셜만
<Avatar size="sm" name="Alex Johnson" />

// 커스텀 아이콘 (봇·시스템)
<Avatar size="md" shape="rounded" icon={<Icon name="robot" />} alt="시스템 봇" />

// TableCell.Avatar 안 — label·sublabel
<TableCellAvatar
  src={user.avatar}
  name={user.name}
  sublabel={user.email}
  status={user.online ? "online" : "offline"}
/>
```
