# Form Footer

### 원칙
폼·모달·drawer 하단의 **액션 묶음** 자리. 주 액션(primary)과 보조 액션(outline)이 **반드시 쌍으로** 등장하는 자리라 레시피로 못 박는다. 유저·AI가 자주 틀리는 지점: variant 선택, 좌/우 정렬, 액션 순서.

### Anatomy
한 줄 row, 액션은 **오른쪽 정렬**이 기본.

```
[.............................spacer............................] [secondary] [primary]
```

- spacer: `flex: 1 1 auto` (액션들을 오른쪽으로 밀어냄)
- secondary (취소·닫기): [[components/button]] `variant="outline"`
- primary (저장·제출·확인): [[components/button]] `variant="primary"`
- 액션 간 gap: `space-1` 고정 (버튼↔버튼 묶음, [[tokens/spacing]])
- footer 자체 상단: `space-4` 또는 `space-6` 공간 (본문과의 분리) — 선 없이 공간으로

### Do
- 액션 순서: **왼쪽 secondary → 오른쪽 primary** ([[components/_variants]] "중요=primary, 서브=outline")
- destructive 액션이 primary 자리로 올 때: `variant="destructive"` 사용. destructive가 두 번째 시선이면 `destructive-ghost`
- 모달의 경우 primary는 항상 하나 — ESC/닫기 외에 두 개 이상의 "주 액션"이 있으면 모달 설계 재검토
- footer 상단에 **선이 필요하면** `border-top: 1px solid var(--border)`만, 배경 변화 없이 — [[PRINCIPLES]] §5b
- 좌측에 **보조 정보**(예: "변경사항 저장 안 됨")가 필요하면 spacer 자리에 muted 텍스트 1줄. 더는 금지

### Don't
- [HARD] primary 2개 금지 — [[PRINCIPLES]] §4a HARD 예시. 주 액션은 한 화면에 하나
- [HARD] 액션을 세로로 쌓지 않는다 (모바일에서도 가로 유지가 기본). 세로가 필요하면 drawer/sheet가 맞는지 재검토
- [HARD] secondary로 `variant="secondary"`(레거시) 쓰지 않는다 — `outline`을 쓴다 ([[components/_variants]] 액션 선택 규칙)
- [HARD] 액션 사이 gap을 `space-2` 이상으로 벌리지 않는다 — 버튼 묶음은 `space-1` 고정 ([[tokens/spacing]])
- [SOFT] 왼쪽 정렬·중앙 정렬 금지 — 우측 정렬이 디폴트. 좌측 정렬은 오직 "폼 흐름이 좌에서 우로 흐르지 않는" 특수 자리에서만

### Fallback
primary 하나만 있으면 그 단독으로 (여전히 오른쪽 정렬). destructive가 primary 자리면 secondary도 반드시 함께 — 확인 가능한 escape를 제공.

### 조립 예시
```tsx
<footer className="form-footer">
  <Button variant="outline" size="md" onClick={onCancel}>
    취소
  </Button>
  <Button variant="primary" size="md" type="submit">
    저장
  </Button>
</footer>
```

```css
.form-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-6);
}
/* 좌측 보조 정보가 필요한 경우 */
.form-footer .status {
  margin-right: auto;
  font-size: var(--text-sm);
  color: var(--fg-muted);
}
```

destructive 예시:
```tsx
<footer className="form-footer">
  <Button variant="outline" size="md">취소</Button>
  <Button variant="destructive" size="md">삭제</Button>
</footer>
```

### 관련
- [[components/button]] — variant 선택
- [[components/_variants]] — 역할 × variant 매핑
- [[components/modal]] — footer 자리의 vendor host
- [[tokens/spacing]] — space-1 버튼 묶음 고정
