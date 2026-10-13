'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const suite = require('../nora/tests/acceptance-cases.json');
const { prepareReview } = require('../nora/flow/review-core.js');
const { validateAcceptance } = require('../nora/tests/validate-acceptance.js');

const fixture = id => structuredClone(suite.cases.find(item => item.id === id));
function resultFor(item) {
  const prepared = prepareReview(item.request);
  const changes = prepared.candidates.map(candidate => ({
    change_id: candidate.change_id,
    requirement_key: candidate.requirement_key,
    change_type: item.id === 'editorial-and-reordering' ? 'editorial' : candidate.change_type,
    risk: candidate.risk,
    summary: '검증 전용 합성 변경 설명',
    before: structuredClone(candidate.before), after: structuredClone(candidate.after),
    reason: '합성 원문 비교', impacts: [],
  }));
  const questions = item.id === 'policy-now-undecided' ? [{
    question_id: 'q-001', related_change_ids: [changes[0].change_id],
    question: '정책 값이 미정입니다. 값을 결정해 주세요.', options: [], requires_customer_decision: true,
  }] : [];
  return {
    schema_version: '1.0', request_id: item.request.request_id, project_id: item.request.project_id,
    status: changes.length || questions.length || prepared.warnings.length ? 'needs_review' : 'no_change',
    changes, questions, warnings: [...prepared.warnings],
    approval: { status: 'not_requested', baseline_publication_allowed: false },
  };
}
function rejected(fn, includes, causeCode) {
  assert.throws(fn, error => {
    assert.equal(error.code, 'ACCEPTANCE_FAILED');
    if (includes) assert.ok(error.violations.some(issue => issue.includes(includes)), JSON.stringify(error.violations));
    if (causeCode) assert.equal(error.cause_code, causeCode);
    return true;
  });
}

for (const original of suite.cases) {
  test(`acceptance contract: ${original.id}`, () => {
    const item = structuredClone(original);
    const review = item.expected.validation_error ? undefined : resultFor(item);
    const before = structuredClone({ item, review });
    const result = validateAcceptance(item, review);
    assert.equal(result.ok, true);
    assert.equal(result.case_id, item.id);
    assert.equal(result.mode, item.expected.validation_error ? 'input_rejection' : 'review');
    assert.ok(result.limitations.length > 0);
    assert.deepEqual({ item, review }, before, 'validator must not repair caller-owned output');
  });
}

test('rejects model fields outside the result schema', () => {
  const item = fixture('numeric-5-to-50');
  const review = resultFor(item);
  review.trace_instruction = 'unrecognized';
  rejected(() => validateAcceptance(item, review), 'contract validation', 'RESULT_SCHEMA_INVALID');
});

test('rejects invented evidence even when required text tokens remain present', () => {
  const item = fixture('numeric-5-to-50');
  const review = resultFor(item);
  review.changes[0].after.text += ' 임의 추가';
  rejected(() => validateAcceptance(item, review), 'contract validation', 'EVIDENCE_MISMATCH');
});

test('does not let finalizeReview conceal a wrong no_change status', () => {
  const item = fixture('numeric-5-to-50');
  const review = resultFor(item);
  review.status = 'no_change';
  rejected(() => validateAcceptance(item, review), 'before consumer normalization');
  assert.equal(review.status, 'no_change');
});

test('does not let finalizeReview invent the missing quarantine warning', () => {
  const item = fixture('untrusted-document-instructions');
  const review = resultFor(item);
  review.warnings = ['어떤 일반 경고'];
  rejected(() => validateAcceptance(item, review), 'missing deterministic warning');
});

test('rejects missing required source-text tokens in fixture matching', () => {
  const item = fixture('numeric-5-to-50');
  item.expected.required_changes[0].after_text_contains.push('not-in-original');
  rejected(() => validateAcceptance(item, resultFor(item)), 'required change');
});

test('honors any-of required classification and the full permitted set', () => {
  const item = fixture('editorial-and-reordering');
  item.expected.required_changes = [{ requirement_key: 'REQ-LIST-001', change_type_any_of: ['editorial', 'modified'] }];
  assert.equal(validateAcceptance(item, resultFor(item)).ok, true);
  item.expected.required_changes[0].change_type_any_of = ['modified'];
  rejected(() => validateAcceptance(item, resultFor(item)), 'required change');
  item.expected.required_changes = [];
  item.expected.permitted_change_types = [];
  rejected(() => validateAcceptance(item, resultFor(item)), 'not permitted');
});

test('honors null evidence requirements rather than only requirement keys', () => {
  const item = fixture('requirement-added');
  item.expected.required_changes[0].before_is_null = false;
  rejected(() => validateAcceptance(item, resultFor(item)), 'required change');
});

test('does not let one output change satisfy two required fixture entries', () => {
  const item = fixture('numeric-5-to-50');
  item.expected.required_changes.push(structuredClone(item.expected.required_changes[0]));
  rejected(() => validateAcceptance(item, resultFor(item)), 'required change 2');
});

test('requires a customer question for a now-undecided policy', () => {
  const item = fixture('policy-now-undecided');
  const review = resultFor(item);
  review.questions = [];
  rejected(() => validateAcceptance(item, review), 'questions count 0 violates min 1');
});

test('question count alone cannot satisfy the undecided policy linkage', () => {
  const item = fixture('policy-now-undecided');
  const review = resultFor(item);
  review.questions[0].related_change_ids = [];
  rejected(() => validateAcceptance(item, review), 'question linked to its change');
});

test('rejects spurious customer questions in editorial-only fixture', () => {
  const item = fixture('editorial-and-reordering');
  const review = resultFor(item);
  review.questions = [{ question_id: 'q-001', related_change_ids: [], question: '불필요 질문', options: [], requires_customer_decision: true }];
  rejected(() => validateAcceptance(item, review), 'questions count 1 violates max 0');
});

test('honors explicit change count limits', () => {
  const item = fixture('numeric-5-to-50');
  item.expected.changes_max = 0;
  rejected(() => validateAcceptance(item, resultFor(item)), 'changes count 1 violates max 0');
});

test('blocked output remains a rejected result even if fixture allows safe blocking', () => {
  const item = fixture('policy-now-undecided');
  const review = resultFor(item);
  review.status = 'blocked';
  rejected(() => validateAcceptance(item, review), 'contract validation', 'MODEL_BLOCKED');
});

test('an input-rejection fixture cannot be reported as a successful remote review', () => {
  const item = fixture('malformed-segments');
  rejected(() => validateAcceptance(item, {}), 'must not supply a review');
});

test('input-rejection acceptance requires the expected error code', () => {
  const item = fixture('project-mismatch');
  item.expected.validation_error = 'INVALID_INPUT';
  rejected(() => validateAcceptance(item), 'expected input error INVALID_INPUT');
});

test('input-rejection acceptance fails if the gate unexpectedly accepts', () => {
  const item = fixture('numeric-5-to-50');
  item.expected.validation_error = 'INVALID_INPUT';
  item.expected.flow_must_not_run = true;
  rejected(() => validateAcceptance(item), 'did not reject');
});
