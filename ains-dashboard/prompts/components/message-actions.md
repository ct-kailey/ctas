# Message Actions

### 원칙
메시지 하단에 붙는 **아이콘 액션 바**. [[components/user-message]] · [[components/ai-message]] · MessageState에서 공용. copy / edit / regenerate 등 kind 열거로 아이콘 자동 매핑.

### Do
- UserMessage: `[copy, edit]` 조합이 기본 (오른쪽 정렬 `align=end`).
- AIMessage: `[copy, regenerate]` 조합이 기본 (왼쪽 정렬 `align=start`).
- 호버·focus-visible에서만 ring 노출, 평상시엔 투명 bg + fg-muted 아이콘.
- 커스텀 액션 필요하면 `icon`에 직접 ReactNode 전달.

### Don't
- 액션 라벨을 아이콘 옆에 노출하지 않는다 — `title`(툴팁)과 `aria-label`만.
- 액션 사이에 구분선 넣지 않는다 — gap으로 공간만 분리.
- 많은 액션(5개 이상) 나열 금지 — 메뉴 오버플로우로 숨김 고려.

### Fallback
align 애매하면 `start`. kind 없는 커스텀 액션은 `icon` 직접 전달.

### 관련
- [[components/user-message]] / [[components/ai-message]] — 메인 소비처
- [[components/icon-button]] — 단독 아이콘 버튼은 IconButton 사용

### Props 시그니처
```tsx
<MessageActions
  actions={[
    { kind: "copy", onClick },
    { kind: "regenerate", onClick },
  ]}
  align="start | end"               // default: start
/>
```

### Kind 매핑
| kind | icon | 기본 라벨 |
|---|---|---|
| copy | Copy | 복사 |
| edit | PencilSimple | 수정 |
| regenerate | ArrowClockwise | 다시 생성 |
| share | ShareNetwork | 공유 |
| delete | TrashSimple | 삭제 |
| like | ThumbsUp | 좋아요 |
| dislike | ThumbsDown | 싫어요 |

### 비율
- 버튼: `space-6` 정사각
- 아이콘: 버튼 65%
- gap: `space-1`
