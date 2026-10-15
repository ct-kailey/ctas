import React, { useRef, useState } from 'react';
import { Button, Tabs } from './ui.jsx';
import { getLocale, changeUiLanguage, UI_LANGUAGES } from './ui-language-state.mjs';
import { useConfirm } from './confirmation.jsx';
import './language-settings.css';

export function LanguageChoice({ value, onChange, disabled = false }) {
  return <Tabs value={value} onValueChange={onChange} variant="segmented" size="sm">
    <Tabs.List aria-label="사이트 표시 언어">
      <Tabs.Trigger value="ko" disabled={disabled}>{UI_LANGUAGES.ko}</Tabs.Trigger>
      <Tabs.Trigger value="en" disabled={disabled}>{UI_LANGUAGES.en}</Tabs.Trigger>
    </Tabs.List>
  </Tabs>;
}

export function LoginLanguage({ busy, hasInput }) {
  const [language, setLanguage] = useState(getLocale);
  const [changing, setChanging] = useState(false);
  const active = useRef(false), confirm = useConfirm();
  async function apply() {
    if (busy || active.current || language === getLocale()) return;
    active.current = true; setChanging(true);
    try {
      if (hasInput() && !await confirm('언어를 변경하면 입력한 로그인 정보가 지워집니다.', { title: '표시 언어 변경', confirmLabel: '언어 변경', cancelLabel: '계속 작성' })) return;
      changeUiLanguage(language, window);
    } finally { active.current = false; setChanging(false); }
  }
  return <div className="login-language"><LanguageChoice value={language} onChange={setLanguage} disabled={busy || changing} />
    {language !== getLocale() ? <Button type="button" variant="secondary" busy={changing} disabled={busy} onClick={apply}>언어 적용</Button> : null}
  </div>;
}
