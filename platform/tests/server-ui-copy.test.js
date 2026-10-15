'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('known dashboard instructions change language without touching a customer title or source text', async () => {
  const { attentionInstruction } = await import('../web/src/server-ui-copy.mjs');
  const item = { rule: 'question_draft', title: '한국어 고객 질문 원문', description: '아직 전달하지 않은 질문입니다. 내용을 검토하고 발송 이력을 기록하세요.', target: { questionId: 'original-question' } };
  const before = structuredClone(item);
  assert.match(attentionInstruction(item, 'en'), /has not been sent/);
  assert.equal(attentionInstruction(item, 'ko'), item.description);
  assert.deepEqual(item, before);
});

test('unknown rules and source-owned Korean descriptions are preserved even with English UI', async () => {
  const { attentionInstruction } = await import('../web/src/server-ui-copy.mjs');
  for (const rule of [undefined, 'customer.custom_rule', '__proto__', 'constructor']) {
    const description = '고객이 기록한 문장과 결정 사항을 그대로 유지합니다.';
    assert.equal(attentionInstruction({ rule, description }, 'en'), description);
  }
  assert.equal(attentionInstruction(null, 'en'), '');
});

test('uncertain results ask for inspection and waiting thresholds do not invent elapsed days', async () => {
  const { attentionInstruction } = await import('../web/src/server-ui-copy.mjs');
  for (const rule of ['job_uncertain', 'channel_uncertain']) {
    const text = attentionInstruction({ rule, description: '원본 안내' }, 'en');
    assert.match(text, /unconfirmed/);
    assert.match(text, /history/);
    assert.doesNotMatch(text, /complete the review|process it again|automatically/);
  }
  assert.match(attentionInstruction({ rule: 'question_waiting_long', created_at: '2020-01-01', description: '원본 안내' }, 'en'), /at least 3 days/);
  assert.doesNotMatch(attentionInstruction({ rule: 'question_waiting', created_at: '2020-01-01', description: '원본 안내' }, 'en'), /\d+ days/);
});

test('journey localizes only system audit titles and never guesses prefixes in user record titles', async () => {
  const { journeyEventTitle } = await import('../web/src/server-ui-copy.mjs');
  assert.equal(journeyEventTitle({ type: 'audit', kind: 'implementation.execution_uncertain', title: '구현 실행 결과 확인 필요' }, 'en'), 'Implementation run result unconfirmed');
  for (const event of [
    { type: 'revision', kind: 'document_registered', title: '문서 등록 · 고객의 기획 문서' },
    { type: 'milestone', kind: 'project.created', title: '프로젝트 등록' },
    { type: 'audit', kind: 'governance.artifact_registered', title: '검수 결과물 등록 · 고객 자료' },
    { type: 'audit', kind: 'unknown.future_kind', title: '새 기록 원문' },
  ]) assert.equal(journeyEventTitle(event, 'en'), event.title);
});

test('journey static descriptions preserve lifecycle distinctions and leave customer decisions unchanged', async () => {
  const { journeyEventDescription } = await import('../web/src/server-ui-copy.mjs');
  const pr = { type: 'audit', kind: 'github_delivery.published', description: '검토용 PR 발행 기록입니다.' };
  assert.match(journeyEventDescription(pr, pr.description, 'en'), /does not indicate a merge, final delivery or contract closure/);
  assert.equal(journeyEventDescription(pr, pr.description, 'ko'), pr.description);
  const customer = { type: 'audit', kind: 'review.approved', description: '고객이 요청한 범위를 승인합니다.' };
  assert.equal(journeyEventDescription(customer, customer.description, 'en'), customer.description);
  const milestone = { type: 'milestone', kind: 'github_delivery.published', description: '직접 남긴 일정 내용' };
  assert.equal(journeyEventDescription(milestone, milestone.description, 'en'), milestone.description);
});

test('journey source metadata is translated by known type while commercial section titles remain intact', async () => {
  const { journeyFieldLabel, journeySourceTitle, journeySourceDescription } = await import('../web/src/server-ui-copy.mjs');
  assert.equal(journeyFieldLabel('현재 상태', 'question', 'en'), 'Current status');
  assert.equal(journeyFieldLabel('고객 고유 제목', 'question', 'en'), '고객 고유 제목');
  assert.equal(journeyFieldLabel('요약', 'commercial_revision', 'en'), '요약');
  assert.equal(journeyFieldLabel('현재 상태', 'commercial_revision', 'en'), '현재 상태');
  assert.equal(journeyFieldLabel('현재 상태', undefined, 'ko'), '현재 상태');
  assert.equal(journeySourceTitle({ type: 'analysis', title: '정책 분석' }, 'en'), 'Policy analysis');
  assert.equal(journeySourceTitle({ type: 'work_preflight', title: '고객의 사전 검토 제목' }, 'en'), '고객의 사전 검토 제목');
  assert.equal(journeySourceDescription({ type: 'question' }, '고객에게 받은 질문 원문', 'en'), '고객에게 받은 질문 원문');
});
