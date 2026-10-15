const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../web');
const modules = Promise.all([import('../web/i18n-transform.mjs'), import('../web/src/ui-i18n.mjs'), import('../web/src/ui-language-state.mjs')]);

test('interface language defaults to Korean, validates URL/storage, and leaves preference unchanged until navigation commits', async () => {
  const [, , state] = await modules;
  const saved = new Map(), storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  assert.equal(state.readUiLanguage(storage), 'ko');
  assert.equal(state.persistUiLanguage(storage, 'en'), true);
  assert.equal(state.readUiLanguage(storage), 'en');
  assert.equal(state.persistUiLanguage(storage, 'javascript:alert(1)'), false);
  assert.equal(state.getLocale({ location: { href: 'https://ains.example/?ui_lang=ko' }, localStorage: storage }), 'ko');
  assert.equal(state.getLocale({ location: { href: 'https://ains.example/?ui_lang=invalid' }, localStorage: storage }), 'en');
  assert.equal(state.getLocale({ get localStorage() { throw new Error('blocked'); } }), 'ko');
  const browser = { localStorage: storage, location: { href: 'https://ains.example/?project=p1&tab=questions#selected', assign(value) { this.next = value; } } };
  state.changeUiLanguage('ko', browser);
  assert.equal(saved.get(state.UI_LANGUAGE_STORAGE_KEY), 'en', 'cancelled navigation must not switch the saved preference');
  const next = new URL(browser.location.next);
  assert.equal(next.searchParams.get('ui_lang'), 'ko');
  assert.equal(next.searchParams.get('project'), 'p1');
  assert.equal(next.searchParams.get('tab'), 'questions');
  assert.equal(next.hash, '#selected');
  assert.throws(() => state.changeUiLanguage('invalid', browser), TypeError);
  const blocked = { location: { href: 'https://ains.example/?tab=work', assign(value) { this.next = value; } }, get localStorage() { throw new Error('blocked'); } };
  state.changeUiLanguage('en', blocked);
  assert.equal(new URL(blocked.location.next).searchParams.get('ui_lang'), 'en');
  const attributes = new Map(); state.applyUiLanguage({ setAttribute: (key, value) => attributes.set(key, value) }, 'en');
  assert.equal(attributes.get('lang'), 'en'); assert.equal(attributes.get('data-lang'), 'en');
});

test('translations are source-owned plain text, retain placeholders, and never translate inserted user content', async () => {
  const [, i18n] = await modules;
  const catalog = { '검토 {0} / {1}': 'Review {1}: {0}', '고객 기록': 'Client record', '안내': '<script>alert(1)</script>', '누락 {0}': 'Broken' };
  assert.equal(i18n.translateWithCatalog('검토 {0} / {1}', ['고객 기록', '<b>source</b>'], 'en', catalog), 'Review <b>source</b>: 고객 기록');
  assert.equal(i18n.translateWithCatalog('검토 {0} / {1}', ['기록', '버전'], 'ko', catalog), '검토 기록 / 버전');
  assert.equal(i18n.translateWithCatalog(' 알 수 없음 ', [], 'en', catalog), ' 알 수 없음 ');
  assert.equal(i18n.translateWithCatalog('누락 {0}', ['기록'], 'en', catalog), '누락 기록');
  assert.equal(i18n.translateWithCatalog('안내', [], 'en', catalog), '<script>alert(1)</script>', 'returned string is text, no DOM/HTML parsing');
  assert.equal(i18n.validTranslation('검토 {0} / {1}', 'Review {0} {0}'), false);
  assert.equal(i18n.validTranslation('검토', ''), false);
});

test('compiler translates labels and whole templates but preserves persisted content, domain comparisons and keys', async () => {
  const [{ transformUiSource }] = await modules;
  const source = [
    "const status = { pending: '검토 대기' };",
    "const result = `고객 ${customer.name}: ${count}건`;",
    "const body = { title: '실제 요구사항', channel: '이메일' };",
    "request('/api/questions', { method: 'POST', body: { question: '고객에게 확인할 내용' } });",
    "const [form] = useState({ title: '고객 질문', requirement: `완료 기준 ${task.criteria}` });",
    "const same = value === '확정';",
    "const found = value.includes('정책');",
    "const normalized = value.replaceAll('기준선', '확정본');",
    "const keys = { '한국어 키': '표시할 값' };",
    "const date = new Intl.DateTimeFormat('ko-KR').format(now);",
    "const sorted = a.localeCompare(b, 'ko-KR');",
    '<section title="고객 질문"><Input value="이메일" placeholder="질문 제목"/><span>{apiResponse.question}</span><Button onClick={() => notify("저장했습니다")}>질문 등록</Button></section>;',
  ].join('\n');
  const result = transformUiSource(source);
  assert.match(result.code, /__ainsTranslate\("검토 대기"\)/);
  assert.match(result.code, /__ainsTranslate\("고객 \{0\}: \{1\}건", \[customer.name, count\]\)/);
  for (const original of ["title: '실제 요구사항'", "channel: '이메일'", "question: '고객에게 확인할 내용'", "title: '고객 질문'", "value === '확정'", "value.includes('정책')", "value.replaceAll('기준선', '확정본')", "'한국어 키':", 'value="이메일"', '{apiResponse.question}']) assert.ok(result.code.includes(original), original);
  assert.match(result.code, /DateTimeFormat\(__ainsLocaleTag\(\)\)/);
  assert.ok(result.code.includes("a.localeCompare(b, 'ko-KR')"));
  assert.match(result.code, /notify\(__ainsTranslate\("저장했습니다"\)\)/);
  assert.ok(result.skipped.some(item => item.source === '고객 질문' && item.reason === 'editable-content-default'));
  assert.ok(result.keys.includes('질문 제목'));
});

test('compiler boundaries exclude libraries and the separately selected customer question language', async () => {
  const [{ ainsUiI18n, transformUiSource }] = await modules;
  const plugin = ainsUiI18n(); plugin.configResolved({ root: '/workspace/platform/web' });
  const source = `export const message = '안내';`;
  assert.equal(plugin.transform(source, '/workspace/platform/web/src/components/ctds/Thing.jsx'), null);
  assert.equal(plugin.transform(source, '/workspace/node_modules/library/index.js'), null);
  assert.equal(plugin.transform(source, '/workspace/platform/web/src/question-language-state.mjs'), null);
  assert.equal(transformUiSource(source, { filename: 'question-language-state.mjs' }).code, source);
  assert.ok(plugin.transform(source, '/workspace/platform/web/src/ui.jsx')?.code.includes('__ainsTranslate'));
});

test('adjacent JSX text forms one translatable phrase while inserted React content and null remain intact', async () => {
  const [{ transformUiSource }, { translatePartsWithCatalog }] = await modules;
  const result = transformUiSource('<h3>질문 {count}건 · {name}</h3>');
  assert.ok(result.keys.includes('질문 {0}건 · {1}'));
  assert.match(result.code, /__ainsTranslateParts\("질문 \{0\}건 · \{1\}", \[count, name\]\)/);
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const value = React.createElement('strong', null, '<customer content>');
  const nodes = translatePartsWithCatalog('질문 {0}건 · {1}', [null, value], 'en', { '질문 {0}건 · {1}': '{1} — {0} questions' });
  assert.equal(renderToStaticMarkup(React.createElement('h3', null, nodes)), '<h3><strong>&lt;customer content&gt;</strong> —  questions</h3>');
});

test('Korean domain values used in comparisons retain identity even when display text is localized', async () => {
  const [{ transformUiSource }] = await modules;
  const source = "const items = [{ decided: '미확정' }]; const [filter] = useState('전체'); const shown = items.filter(item => filter === '전체' || item.decided !== '미확정'); const view = <Button onClick={() => setFilter('전체')}>전체</Button>;";
  const result = transformUiSource(source);
  assert.ok(result.code.includes("decided: '미확정'"));
  assert.ok(result.code.includes("useState('전체')"));
  assert.ok(result.code.includes("setFilter('전체')"));
  assert.ok(result.code.includes('__ainsTranslate("전체")'));
});

test('every transformed application module remains parseable', async () => {
  const [{ transformUiSource }, , ] = await modules, { parse } = await import('@babel/parser');
  for (const name of fs.readdirSync(path.join(root, 'src')).filter(name => /\.(jsx|js|mjs)$/.test(name))) {
    const result = transformUiSource(fs.readFileSync(path.join(root, 'src', name), 'utf8'), { filename: name });
    assert.doesNotThrow(() => parse(result.code, { sourceType: 'module', plugins: ['jsx'] }), name);
  }
});
