# AvatarUpload

### 원칙
Avatar + 파일 피커. 프로필·조직 로고 설정의 "현재 사진 보여주고 바꾸기" 자리. 평소엔 [[components/avatar]]와 동일하게 보이고, hover·focus에서 카메라 오버레이가 뜨며, src가 있으면 우측 상단에 작은 X로 제거.

### Do
- `size="xl"` 기본 — 프로필 설정 폼의 가장 흔한 자리.
- `name`은 반드시 넘긴다 — src가 없을 때 Avatar가 이니셜로 폴백. alt는 생략 시 name으로 폴백.
- `onRemove`를 넘길 때만 X 버튼이 뜬다. 초기 상태(src 없음)에서 X가 보이지 않도록 조건부로.
- 허용 포맷은 `accept="image/*"` 유지. 특정 포맷만 받을 땐 `accept="image/png,image/jpeg"`.

### Don't
- 업로드 중 상태를 자체 prop으로 두지 않는다 — 상위에서 Avatar 자리 Spinner로 교체하거나 `disabled`로 잠근다.
- 로컬 파일 preview를 컴포넌트가 책임지지 않는다 — `onChange(file)` 받고 호출자가 FileReader·blob URL로 src 세팅.
- `size="xs"`에 X 버튼이 보이게 두지 않는다 — 버튼이 아바타보다 커진다. 작은 자리에선 remove 비활성.

### Props 시그니처
```tsx
<AvatarUpload
  size?="xs | sm | md | lg | xl"       // default: xl
  shape?="circle | rounded"              // default: circle
  src?={string}
  name?={string}                          // 이니셜·접근성 폴백
  alt?={string}                           // name보다 우선
  onChange?={(file: File) => void}
  onRemove?={() => void}                  // 있을 때만 X 노출
  accept?={string}                        // default: image/*
  disabled?={boolean}
  editLabel?={string}                     // default: "사진 변경"
  removeLabel?={string}                   // default: "사진 제거"
/>
```

### 조합 예시
```tsx
const [src, setSrc] = useState<string | undefined>(user.avatarUrl);

<AvatarUpload
  size="xl"
  src={src}
  name={user.name}
  onChange={async (file) => {
    const url = await uploadToStorage(file);
    setSrc(url);
  }}
  onRemove={() => setSrc(undefined)}
/>
```

### 관련
- [[components/avatar]] — 베이스 Avatar (업로드 없는 표시용)
- [[components/icon-button]] — remove X 버튼의 패턴
- [[tokens/color]] — overlay 색은 scrim 톤
