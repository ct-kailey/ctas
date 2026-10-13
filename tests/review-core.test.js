'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const { validateDocument, validateRequest, prepareReview, finalizeReview } = require('../nora/flow/review-core.js');

const suite = JSON.parse(fs.readFileSync(path.join(__dirname, '../nora/tests/acceptance-cases.json'), 'utf8'));
const fixture = id => structuredClone(suite.cases.find(item => item.id === id));
const request = id => fixture(id).request;
const throwsCode = (fn, code) => assert.throws(fn, error => {
  assert.equal(error.code, code);
  return true;
});

function resultFor(input) {
  const prepared = prepareReview(input);
  return {
    schema_version: '1.0',
    request_id: input.request_id,
    project_id: input.project_id,
    status: prepared.candidates.length ? 'needs_review' : 'no_change',
    changes: prepared.candidates.map(candidate => ({
      change_id: candidate.change_id,
      requirement_key: candidate.requirement_key,
      change_type: candidate.change_type,
      risk: candidate.risk,
      summary: '합성 테스트의 변경 후보',
      before: structuredClone(candidate.before),
      after: structuredClone(candidate.after),
      reason: '제공된 이전 원문과 현재 원문을 비교했다.',
      impacts: [],
    })),
    questions: [],
    warnings: [],
    approval: { status: 'not_requested', baseline_publication_allowed: false },
  };
}

function hashDocument(document) {
  document.source.sha256 = createHash('sha256').update(document.segments.map(segment => segment.text).join('\n'), 'utf8').digest('hex');
  return document;
}

describe('acceptance fixtures: input gate', () => {
  assert.equal(suite.cases.length, 10);
  for (const item of suite.cases) {
    test(item.id, () => {
      const input = structuredClone(item.request);
      const original = structuredClone(input);
      if (item.expected.validation_error) {
        throwsCode(() => validateRequest(input), item.expected.validation_error);
        throwsCode(() => prepareReview(input), item.expected.validation_error);
      } else {
        assert.equal(validateRequest(input), input);
      }
      assert.deepEqual(input, original, 'input validation must not alter customer documents');
    });
  }
});

describe('deterministic candidate preparation', () => {
  for (const id of ['numeric-5-to-50', 'inclusive-to-exclusive']) {
    test(`${id}: preserves exact evidence and marks the change high risk`, () => {
      const item = fixture(id);
      const prepared = prepareReview(item.request);
      assert.equal(prepared.candidates.length, 1);
      const candidate = prepared.candidates[0];
      assert.equal(candidate.change_type, 'modified');
      assert.equal(candidate.risk, 'high');
      assert.equal(candidate.critical_change, true);
      assert.equal(candidate.match_method, 'requirement_key');
      const expected = item.expected.required_changes[0];
      assert.equal(candidate.requirement_key, expected.requirement_key);
      for (const token of expected.before_text_contains) assert.ok(candidate.before.text.includes(token));
      for (const token of expected.after_text_contains) assert.ok(candidate.after.text.includes(token));
      assert.deepEqual(candidate.before.locator, item.request.baseline.segments[0].locator);
      assert.deepEqual(candidate.after.locator, item.request.current.segments[0].locator);
    });
  }

  for (const [id, type, nullSide] of [['requirement-added', 'added', 'before'], ['requirement-removed', 'removed', 'after']]) {
    test(`${id}: keeps the missing side null`, () => {
      const candidate = prepareReview(request(id)).candidates;
      assert.equal(candidate.length, 1);
      assert.equal(candidate[0].change_type, type);
      assert.equal(candidate[0].requirement_key, 'REQ-EXPORT-001');
      assert.equal(candidate[0][nullSide], null);
      assert.ok(candidate[0][nullSide === 'before' ? 'after' : 'before']);
    });
  }

  test('reordering matches requirement keys rather than segment positions', () => {
    const input = request('editorial-and-reordering');
    const candidates = prepareReview(input).candidates;
    assert.equal(candidates.length, 2);
    for (const candidate of candidates) {
      const before = input.baseline.segments.find(segment => segment.requirement_key === candidate.requirement_key);
      const after = input.current.segments.find(segment => segment.requirement_key === candidate.requirement_key);
      assert.equal(candidate.match_method, 'requirement_key');
      assert.equal(candidate.before.text, before.text);
      assert.equal(candidate.after.text, after.text);
      assert.deepEqual(candidate.before.locator, before.locator);
      assert.deepEqual(candidate.after.locator, after.locator);
      assert.notEqual(candidate.before.segment_id, candidate.after.segment_id);
      assert.equal(candidate.critical_change, false);
    }
    // Semantic editorial classification belongs to the model; the gate must
    // accept it without weakening the binding to the original evidence.
    const output = resultFor(input);
    output.changes.forEach(change => { change.change_type = 'editorial'; change.risk = 'low'; });
    assert.equal(finalizeReview(input, output).changes.length, 2);
  });

  test('injection text is excluded from candidates and produces an unavoidable warning', () => {
    const input = request('untrusted-document-instructions');
    const original = structuredClone(input);
    const prepared = prepareReview(input);
    assert.deepEqual(prepared.candidates, []);
    assert.ok(prepared.warnings.includes('QUARANTINED_INSTRUCTION:current:seg-002'));
    assert.equal(JSON.stringify(prepared.candidates).includes('운영 배포'), false);
    const output = finalizeReview(input, resultFor(input));
    assert.equal(output.status, 'needs_review');
    assert.ok(output.warnings.includes('QUARANTINED_INSTRUCTION:current:seg-002'));
    assert.deepEqual(output.approval, { status: 'not_requested', baseline_publication_allowed: false });
    assert.deepEqual(input, original);
  });
});

describe('final output gate', () => {
  test('accepts a complete grounded result without changing its source documents', () => {
    const input = request('numeric-5-to-50');
    const original = structuredClone(input);
    const review = resultFor(input);
    assert.equal(finalizeReview(input, review), review);
    assert.equal(review.status, 'needs_review');
    assert.deepEqual(input, original);
  });

  for (const [label, mutate] of [
    ['text', output => { output.changes[0].after.text = 'AI가 새로 만든 원문'; }],
    ['segment id', output => { output.changes[0].after.segment_id = 'seg-invented'; }],
    ['locator', output => { output.changes[0].before.locator.label = '문단 999'; }],
    ['requirement key', output => { output.changes[0].requirement_key = 'REQ-INVENTED'; }],
  ]) {
    test(`rejects tampered provenance: ${label}`, () => {
      const input = request('numeric-5-to-50');
      const output = resultFor(input);
      mutate(output);
      throwsCode(() => finalizeReview(input, output), 'EVIDENCE_MISMATCH');
    });
  }

  test('rejects an omitted deterministic change', () => {
    const input = request('numeric-5-to-50');
    const output = resultFor(input);
    output.changes = [];
    output.status = 'no_change';
    throwsCode(() => finalizeReview(input, output), 'OMITTED_CHANGE');
  });

  test('rejects duplicated change IDs', () => {
    const input = request('numeric-5-to-50');
    const output = resultFor(input);
    output.changes.push(structuredClone(output.changes[0]));
    throwsCode(() => finalizeReview(input, output), 'OUTPUT_COVERAGE_INVALID');
  });

  for (const field of ['status', 'baseline_publication_allowed']) {
    test(`rejects illegal approval: ${field}`, () => {
      const input = request('numeric-5-to-50');
      const output = resultFor(input);
      output.approval[field] = field === 'status' ? 'approved' : true;
      throwsCode(() => finalizeReview(input, output), 'ILLEGAL_APPROVAL');
    });
  }

  test('rejects critical changes downgraded to editorial or low risk', () => {
    const input = request('inclusive-to-exclusive');
    for (const patch of [{ change_type: 'editorial' }, { risk: 'low' }]) {
      const output = resultFor(input);
      Object.assign(output.changes[0], patch);
      throwsCode(() => finalizeReview(input, output), 'CRITICAL_CHANGE_DOWNGRADED');
    }
  });

  test('paired evidence cannot be relabeled as added or removed', () => {
    const input = request('editorial-and-reordering');
    for (const changeType of ['added', 'removed']) {
      const output = resultFor(input);
      output.changes[0].change_type = changeType;
      throwsCode(() => finalizeReview(input, output), 'OUTPUT_COVERAGE_INVALID');
    }
  });

  test('rejects a fabricated provided impact', () => {
    const input = request('numeric-5-to-50');
    const output = resultFor(input);
    output.changes[0].impacts.push({ kind: 'api', ref: '/api/invented', basis: 'provided', reason: '입력에 없는 API를 제공된 근거로 주장한다.' });
    throwsCode(() => finalizeReview(input, output), 'UNSUPPORTED_IMPACT');
  });

  test('accepts a provided impact only for its mapped requirement and target', () => {
    const input = request('numeric-5-to-50');
    input.impact_map = [{ requirement_key: 'REQ-APPROVAL-001', targets: [{ kind: 'api', ref: 'approval-rule' }] }];
    const output = resultFor(input);
    output.changes[0].impacts.push({ kind: 'api', ref: 'approval-rule', basis: 'provided', reason: '입력 impact_map의 연결이다.' });
    assert.equal(finalizeReview(input, output).changes[0].impacts[0].ref, 'approval-rule');
    input.impact_map[0].requirement_key = 'REQ-OTHER';
    throwsCode(() => finalizeReview(input, output), 'UNSUPPORTED_IMPACT');
  });

  test('rejects a question that references an invented change', () => {
    const input = request('numeric-5-to-50');
    const output = resultFor(input);
    output.questions.push({ question_id: 'q-001', related_change_ids: ['chg-missing'], question: '확인할까요?', options: [], requires_customer_decision: true });
    throwsCode(() => finalizeReview(input, output), 'OUTPUT_SCHEMA_INVALID');
  });

  test('does not accept no_change when grounded changes remain', () => {
    const input = request('numeric-5-to-50');
    const output = resultFor(input);
    output.status = 'no_change';
    assert.equal(finalizeReview(input, output).status, 'needs_review');
  });

  test('rejects explicit model blocking rather than returning a successful result', () => {
    const input = request('numeric-5-to-50');
    const output = resultFor(input);
    output.status = 'blocked';
    throwsCode(() => finalizeReview(input, output), 'MODEL_BLOCKED');
  });
});

describe('revision and input limits', () => {
  test('the same revision cannot name different source bytes', () => {
    const input = request('numeric-5-to-50');
    input.current.revision_id = input.baseline.revision_id;
    assert.notEqual(input.current.source.sha256, input.baseline.source.sha256);
    throwsCode(() => validateRequest(input), 'REVISION_CONFLICT');
    throwsCode(() => finalizeReview(input, resultFor(request('numeric-5-to-50'))), 'REVISION_CONFLICT');
  });

  test('200 segments pass and 201 segments are rejected', () => {
    const input = request('numeric-5-to-50');
    const document = input.current;
    document.segments = Array.from({ length: 200 }, (_, index) => ({ segment_id: `s-${index}`, requirement_key: `REQ-${index}`, text: '합성 문단', locator: { kind: 'paragraph', label: `문단 ${index + 1}` }, extraction_status: 'ok' }));
    hashDocument(document);
    assert.equal(validateDocument(document, input.project_id), document);
    document.segments.push({ ...document.segments[0], segment_id: 's-200', requirement_key: 'REQ-200' });
    hashDocument(document);
    throwsCode(() => validateDocument(document, input.project_id), 'INVALID_INPUT');
  });

  test('100000 source-text characters pass and 100001 are rejected', () => {
    const input = request('numeric-5-to-50');
    const document = input.current;
    document.segments[0].text = '가'.repeat(100000);
    hashDocument(document);
    assert.equal(validateDocument(document, input.project_id), document);
    document.segments[0].text += '나';
    hashDocument(document);
    throwsCode(() => validateDocument(document, input.project_id), 'INPUT_TOO_LARGE');
  });

  test('duplicate requirement keys cannot silently select the wrong segment', () => {
    const input = request('numeric-5-to-50');
    input.current.segments.push({ ...structuredClone(input.current.segments[0]), segment_id: 'seg-002' });
    hashDocument(input.current);
    throwsCode(() => validateRequest(input), 'AMBIGUOUS_REQUIREMENT_KEY');
  });
});
