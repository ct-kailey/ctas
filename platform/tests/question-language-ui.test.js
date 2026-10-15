'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/question-language-state.mjs');
const question = () => ({ id: 'q1', version: 3, status: 'draft', title: 'Policy check', question: 'Which policy applies?', due_at: '2026-10-20T00:00:00Z' });
const translation = () => ({ id: 't1', source_question_version: 3, status: 'draft', language: 'ko', title: '정책 확인', question: '어떤 정책을 적용하나요?' });

test('historical question language remains unknown rather than being relabeled Korean', async () => {
  const { questionLanguage } = await state();
  assert.equal(questionLanguage(null), null);
  assert.equal(questionLanguage(undefined), null);
  assert.equal(questionLanguage('ja'), null);
  assert.equal(questionLanguage('ko'), 'ko');
  assert.equal(questionLanguage('en'), 'en');
});

test('only current completed translation drafts can create a customer question message', async () => {
  const { canUseQuestionTranslation } = await state();
  assert.equal(canUseQuestionTranslation(question(), translation()), true);
  for (const status of ['running', 'uncertain', 'failed']) assert.equal(canUseQuestionTranslation(question(), { ...translation(), status }), false);
  assert.equal(canUseQuestionTranslation({ ...question(), version: 4 }, translation()), false);
  for (const status of ['resolved', 'cancelled']) assert.equal(canUseQuestionTranslation({ ...question(), status }, translation()), false);
  assert.equal(canUseQuestionTranslation(question(), { ...translation(), language: 'ja' }), false);
});

test('translation use preserves original content and includes explicit provenance', async () => {
  const { questionMessageDraft } = await state();
  const original = question(), translated = translation(), before = structuredClone(original);
  const draft = questionMessageDraft(original, translated);
  assert.equal(draft.subject, '정책 확인');
  assert.match(draft.body, /어떤 정책을 적용하나요/);
  assert.ok(draft.body.includes('답변 요청 기한: '+new Date(original.due_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})));
  assert.equal(draft.translation_id, 't1');
  assert.deepEqual(original, before);
});

test('English messages follow content language independently of UI language', async () => {
  const { questionMessageDraft } = await state();
  const draft = questionMessageDraft({ ...question(), language: 'en' }, null);
  assert.match(draft.body, /^Hello\./);
  assert.match(draft.body, /Which policy applies\?/);
  assert.ok(draft.body.includes('Requested response date: '+new Date(question().due_at).toLocaleString('en-US',{timeZone:'Asia/Seoul'})));
  assert.equal(draft.translation_id, undefined);
});

test('stale translations are not copied and resolved responses never copy translated questions as answers', async () => {
  const { questionMessageDraft } = await state();
  const stale = questionMessageDraft({ ...question(), version: 4 }, translation());
  assert.equal(stale.subject, 'Policy check');
  assert.equal(stale.translation_id, undefined);
  const resolved = questionMessageDraft({ ...question(), status: 'resolved', language: 'en', answer: { text: 'Use policy A.' }, resolution: { reason: 'Confirmed with owner.' } }, translation());
  assert.match(resolved.body, /Use policy A\./);
  assert.doesNotMatch(resolved.body, /어떤 정책을/);
  assert.equal(resolved.translation_id, undefined);
});


test('English interface selection cannot change the Korean customer draft or its date', async () => {
  const { questionMessageDraft } = await state();
  const { getLocale } = await import('../web/src/ui-language-state.mjs');
  const original = question(), translated = translation();
  const before = questionMessageDraft(original, translated);
  const savedLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'https://ains.example.test/?ui_lang=en' } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'en' } });
    assert.equal(getLocale(globalThis), 'en');
    assert.deepEqual(questionMessageDraft(original, translated), before);
    assert.ok(before.body.includes(new Date(original.due_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })));
  } finally {
    if (savedLocation) Object.defineProperty(globalThis, 'location', savedLocation); else delete globalThis.location;
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage); else delete globalThis.localStorage;
  }
});

test('a new translation attempt requires a terminal result, and active execution always blocks a duplicate', async () => {
  const { translationAttemptState } = await state();
  const uncertain = { id: 'old', status: 'uncertain' };
  const running = { id: 'active', status: 'running' };
  assert.deepEqual(translationAttemptState([uncertain], { request_id: 'old' }, uncertain), { active: false, retryable: true });
  assert.deepEqual(translationAttemptState([{ id: 'old', status: 'failed' }], null, { status: 'failed' }), { active: false, retryable: true });
  assert.deepEqual(translationAttemptState([uncertain, running], { request_id: 'old' }, uncertain), { active: true, retryable: false });
  assert.deepEqual(translationAttemptState([uncertain], { request_id: 'unknown' }, uncertain), { active: false, retryable: false });
  assert.deepEqual(translationAttemptState([translation()], null, translation()), { active: false, retryable: false });
});
