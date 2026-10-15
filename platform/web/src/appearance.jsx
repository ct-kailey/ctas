import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { Monitor, Palette, Check } from 'lucide-react';
import config from '../../../ctds.config.json';
import { IconAxisProvider } from './components/ctds/Icon';
import { Button, Badge, FormField, Modal, Input, Select } from './ui.jsx';
import { THEME_STORAGE_KEY, normalizeTheme, readTheme, persistTheme, applyThemeToDocument } from './theme-state.mjs';
import { applyThemeContrast } from './theme-contrast.mjs';
import { getLocale, applyUiLanguage } from './ui-language-state.mjs';
import { LanguageChoice } from './language-settings.jsx';
import './appearance.css';

const AppearanceContext = createContext(null);
const ICON_AXIS = { family: 'lucide', weight: 'regular' };
export const DEFAULT_THEME = normalizeTheme(config, config);
function browserTheme() { try { return readTheme(window.localStorage, DEFAULT_THEME); } catch { return DEFAULT_THEME; } }
// Run before React mounts so existing preferences do not flash the default theme.
applyThemeToDocument(browserTheme(), document.documentElement);
applyUiLanguage(document.documentElement);
applyThemeContrast(document.documentElement);

export function AppearanceProvider({ children }) {
  const [theme, setTheme] = useState(browserTheme);
  useLayoutEffect(() => {
    applyThemeToDocument(theme, document.documentElement);
    applyUiLanguage(document.documentElement);
    applyThemeContrast(document.documentElement);
  }, [theme]);
  useEffect(() => {
    function sync(event) { if (event.key === THEME_STORAGE_KEY || event.key === null) setTheme(browserTheme()); }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  function apply(value) {
    const next = normalizeTheme(value, DEFAULT_THEME);
    let saved = false;
    try { saved = persistTheme(window.localStorage, next); } catch { /* Current-session theme still works. */ }
    setTheme(next);
    return saved;
  }
  return <AppearanceContext.Provider value={{ theme, apply }}><IconAxisProvider value={ICON_AXIS}>{children}</IconAxisProvider></AppearanceContext.Provider>;
}
export function AppearanceSettings({ onClose, onLanguageChange }) {
  const { theme, apply } = useContext(AppearanceContext);
  const [draft, setDraft] = useState(theme), [message, setMessage] = useState('');
  const [language, setLanguage] = useState(getLocale);
  function change(key, value) { setDraft((old) => ({ ...old, [key]: value })); setMessage(''); }
  function save(event) {
    event.preventDefault();
    const saved = apply(draft);
    if (language !== getLocale()) { onLanguageChange(language); return; }
    setMessage(saved ? '화면에 적용했습니다. 이 브라우저에서 다음 접속에도 유지됩니다.' : '화면에 적용했습니다. 브라우저 저장이 차단되어 다음 접속에는 기본 설정을 사용합니다.');
  }
  return <Modal title="화면 설정" eyebrow="CTDS" wide onClose={onClose}>
    <form onSubmit={save}>
      <div className="modal-body appearance-settings">
        <div className="appearance-language"><strong>사이트 표시 언어</strong><LanguageChoice value={language} onChange={setLanguage} /><p className="appearance-description">적용하면 화면을 다시 불러옵니다. 고객 질문의 작성 언어는 고객 질문 메뉴에서 별도로 설정합니다.</p></div>
        <p className="appearance-description">업무 화면의 색상과 밀도를 조절합니다. 설정은 이 브라우저에만 저장됩니다.</p>
        <div className="appearance-fields">
          <FormField label="화면 모드"><Select value={draft.mode} onChange={(e) => change('mode', e.target.value)}><option value="light">밝게</option><option value="dark">어둡게</option></Select></FormField>
          <FormField label="팔레트"><Select value={draft.palette} onChange={(e) => change('palette', e.target.value)}><option value="calm">차분하게</option><option value="standard">기본</option><option value="mono">단색</option><option value="vivid">선명하게</option><option value="pastel">파스텔</option></Select></FormField>
          <FormField label="브랜드 색상" hint={`0~360의 색상 각도입니다. 기본 카키는 ${DEFAULT_THEME.hue}입니다.`}><Input type="number" min="0" max="360" required value={draft.hue} onChange={(e) => change('hue', e.target.value === '' ? '' : Number(e.target.value))} /></FormField>
          <FormField label="모서리"><Select value={draft.shape} onChange={(e) => change('shape', e.target.value)}><option value="standard">기본</option><option value="soft">둥글게</option><option value="crisp">각지게</option></Select></FormField>
          <FormField label="화면 밀도"><Select value={draft.density} onChange={(e) => change('density', e.target.value)}><option value="compact">촘촘하게</option><option value="default">기본</option><option value="comfortable">여유롭게</option></Select></FormField>
          <FormField label="움직임"><Select value={draft.motion} onChange={(e) => change('motion', e.target.value)}><option value="calm">차분하게</option><option value="standard">기본</option><option value="bouncy">탄력 있게</option><option value="none">없음</option></Select></FormField>
        </div>
        <p className="appearance-description">아이콘은 Lucide, 글꼴은 한국어 Pretendard를 사용합니다. 기기의 동작 줄이기 설정과 키보드 포커스를 항상 지원합니다.</p>
        <div className="appearance-sample" aria-label="현재 적용된 컴포넌트">
          <div className="appearance-sample-title"><Monitor aria-hidden="true" /><strong>현재 적용된 화면</strong><Badge tone="green">검토 완료</Badge></div>
          <p>프로젝트의 기록과 결정을 일관된 화면으로 확인하세요.</p>
          <div className="appearance-sample-actions"><Button type="button" variant="secondary" icon={Check}>보조 버튼 예시</Button></div>
        </div>
        {message ? <p className="appearance-feedback" role="status">{message}</p> : null}
      </div>
      <footer className="modal-actions"><Button type="button" variant="secondary" onClick={() => { setDraft(DEFAULT_THEME); setMessage('기본 설정을 선택했습니다. 적용하면 화면이 변경됩니다.'); }}>기본 설정</Button><Button type="submit" icon={Palette}>적용</Button></footer>
    </form>
  </Modal>;
}
