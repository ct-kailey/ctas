// Local Vite browser fixture: synthetic data only, no backend calls, not a production build entry.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Button, ControlButton, Disclosure, FormField, Input, Select, Tabs, Textarea, Toast, ToastProvider, ErrorNotice } from './ui.jsx';
import './components/ctds/tokens.css';
import './appearance.css';
import './styles.css';

const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function Fixture() {
  const formRef = useRef(null), inputRef = useRef(null), textareaRef = useRef(null), fileRef = useRef(null), selectRef = useRef(null), checkRef = useRef(null);
  const eventRef = useRef(null), formChanges = useRef(0), [controlled, setControlled] = useState('a'), [locked, setLocked] = useState(false), [report, setReport] = useState([]);
  const [tab, setTab] = useState('form'), [toast, setToast] = useState(false), [snapshot, setSnapshot] = useState(null);
  const nativeSnapshot = () => Object.fromEntries([...new FormData(formRef.current)].map(([key, value]) => [key, value instanceof File ? value.name : value]));
  async function runContracts() {
    const results = [];
    function check(name, condition) { results.push({ name, pass: Boolean(condition) }); }
    const select = selectRef.current, trigger = document.getElementById('required-choice');
    async function choose(label) {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
      await settle();
      const item = [...document.querySelectorAll('[data-ctds="select-option"]')].find(node => node.textContent === label);
      if (!item) throw new Error('CTDS option not found: ' + label);
      item.click(); await settle();
    }
    try {
      check('Input ref resolves to HTMLInputElement', inputRef.current instanceof HTMLInputElement);
      check('Textarea ref resolves to HTMLTextAreaElement', textareaRef.current instanceof HTMLTextAreaElement);
      check('File ref resolves to the native file input', fileRef.current instanceof HTMLInputElement && fileRef.current.type === 'file');
      check('Select ref resolves to HTMLSelectElement', select instanceof HTMLSelectElement);
      inputRef.current.focus(); check('Input focus targets input, never wrapper', document.activeElement === inputRef.current);
      check('FormField labels and hint are linked', inputRef.current.labels.length === 1 && Boolean(document.getElementById(inputRef.current.getAttribute('aria-describedby'))));
      check('No nested labels', document.querySelectorAll('label label').length === 0);
      check('Empty option remains empty and required', select.value === '' && !select.validity.valid);
      checkRef.current.click(); await settle();
      check('Checkbox native toggle appears in FormData', checkRef.current.checked && nativeSnapshot().confirm === 'yes');
      checkRef.current.click();
      await settle(); const changesBeforeSelect = formChanges.current;
      await choose('Beta');
      check('Visible CTDS selection updates native FormData once', nativeSnapshot().choice === 'b' && new FormData(formRef.current).getAll('choice').length === 1);
      check('One visible selection produces one form change event', formChanges.current - changesBeforeSelect === 1);
      check('Select onChange receives native SELECT target/currentTarget', eventRef.current?.target === 'SELECT' && eventRef.current?.currentTarget === 'SELECT' && eventRef.current?.name === 'choice' && eventRef.current?.value === 'b');
      check('Selected option clears required failure', select.validity.valid);
      await choose('선택하세요'); check('Empty option can be restored', select.value === '' && !select.validity.valid);
      await choose('Alpha');
      formRef.current.reset(); await settle();
      check('Reset restores default empty native and visible selection', select.value === '' && trigger.textContent.includes('선택하세요'));
      flushSync(() => setControlled('b'));
      formRef.current.reset(); await settle();
      check('Reset preserves controlled value and visible label', new FormData(formRef.current).get('controlled') === 'b' && document.getElementById('controlled-choice').textContent.includes('Beta'));
      flushSync(() => setLocked(true)); await settle();
      check('Fieldset disabled excludes controls from submission', !new FormData(formRef.current).has('choice') && select.matches(':disabled') && trigger.matches(':disabled'));
      flushSync(() => setLocked(false)); await settle();
      const collapsed = document.getElementById('collapsed-section');
      check('Closed Disclosure keeps values in FormData', nativeSnapshot().retained === 'kept' && Boolean(collapsed.querySelector('[inert]')));
      collapsed.querySelector('[data-ctds="disclosure-trigger"]').click(); await settle();
      check('Disclosure toggle updates accessible state', collapsed.querySelector('button').getAttribute('aria-expanded') === 'true' && !collapsed.querySelector('[inert]'));
      const multiline = document.getElementById('rich-button');
      check('Content button retains direct child markup', multiline.firstElementChild?.tagName === 'DIV');
      check('Content button has intrinsic height', multiline.scrollHeight <= multiline.clientHeight);
      const transfer = new DataTransfer(); transfer.items.add(new File(['synthetic fixture'], 'fixture.txt', { type: 'text/plain' }));
      fileRef.current.files = transfer.files;
      check('Native file input retains File in FormData', new FormData(formRef.current).get('attachment')?.name === 'fixture.txt');
      fileRef.current.value = ''; check('File ref can clear selection', fileRef.current.files.length === 0);
      check('Default ControlButton type preserves implicit submit', document.getElementById('implicit-submit').type === 'submit');
    } catch (error) { results.push({ name: error.message, pass: false }); }
    setReport(results); setSnapshot(nativeSnapshot());
  }
  return <ToastProvider><main style={{ padding: 'var(--space-6)', maxWidth: 'var(--input-w-lg)', margin: 'auto' }}>
    <h1>CTDS 폼 동작 검증</h1><p>이 화면은 실제 계정이나 저장 API를 사용하지 않습니다.</p>
    <Button type="button" onClick={runContracts}>자동 계약 검증</Button>
    <Tabs value={tab} onValueChange={setTab}><Tabs.List aria-label="검증 화면"><Tabs.Trigger value="form">입력 폼</Tabs.Trigger><Tabs.Trigger value="feedback">알림</Tabs.Trigger></Tabs.List>
      <Tabs.Panel value="form" keepMounted><form ref={formRef} onChange={() => { formChanges.current++; }} onSubmit={event => { event.preventDefault(); setSnapshot(nativeSnapshot()); }}>
        <fieldset disabled={locked}><legend>네이티브 폼 계약</legend>
          <FormField label="텍스트" hint="명시적 label과 설명"><Input ref={inputRef} name="text" defaultValue="initial" onKeyDown={event => { if (event.key === 'Escape') event.currentTarget.blur(); }} /></FormField>
          <FormField label="메모"><Textarea ref={textareaRef} name="memo" defaultValue="initial memo" rows={2} /></FormField>
          <FormField label="필수 선택" hint="빈 값은 제출 불가"><Select id="required-choice" ref={selectRef} name="choice" required defaultValue="" onChange={event => { eventRef.current = { target: event.target.tagName, currentTarget: event.currentTarget.tagName, name: event.target.name, value: event.target.value }; }}><option value="">선택하세요</option><optgroup label="활성 항목"><option value="a">Alpha</option><option value="b">Beta</option></optgroup><optgroup label="잠긴 항목" disabled><option value="c">Disabled</option></optgroup></Select></FormField>
          <FormField label="상태로 관리되는 선택"><Select id="controlled-choice" name="controlled" value={controlled} onChange={event => setControlled(event.target.value)}><option value="a">Alpha</option><option value="b">Beta</option></Select></FormField>
          <FormField label="날짜"><Input type="date" name="date" defaultValue="2026-10-14" /></FormField>
          <FormField label="파일"><Input ref={fileRef} type="file" name="attachment" accept=".txt" /></FormField>
          <label><Input ref={checkRef} type="checkbox" name="confirm" value="yes" /> 확인했습니다</label>
          <label><Input type="radio" name="radio" value="one" defaultChecked /> 첫째</label><label><Input type="radio" name="radio" value="two" /> 둘째</label>
          <Disclosure id="collapsed-section"><summary>접힌 입력 보존</summary><FormField label="보존되는 값"><Input name="retained" defaultValue="kept" /></FormField></Disclosure>
        </fieldset>
        <ControlButton id="implicit-submit">제출</ControlButton><ControlButton type="reset">폼 초기화</ControlButton>
        <ControlButton type="button" onClick={() => setLocked(!locked)}>{locked ? '폼 잠금 해제' : '폼 잠금'}</ControlButton>
        <ControlButton id="rich-button" type="button"><div><strong>여러 줄 카드</strong><p>기존 버튼 안의 블록 구조와 내용 높이를 보존합니다.</p></div></ControlButton>
      </form></Tabs.Panel>
      <Tabs.Panel value="feedback"><ErrorNotice error={{ message: '검증용 오류 안내', code: 'SYNTHETIC_TEST' }} onRetry={() => setToast(true)} /><ControlButton type="button" onClick={() => setToast(true)}>토스트 표시</ControlButton></Tabs.Panel>
    </Tabs>
    <output id="contract-result" aria-live="polite">{report.length ? `${report.filter(item => item.pass).length}/${report.length} 통과` : '아직 실행하지 않았습니다'}</output>
    <pre id="contract-details">{JSON.stringify(report, null, 2)}</pre><pre id="form-snapshot">{JSON.stringify(snapshot, null, 2)}</pre>
    {toast ? <Toast message="검증용 알림입니다" onClose={() => setToast(false)} /> : null}
  </main></ToastProvider>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture /></React.StrictMode>);
