'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const { validateDocumentSchema, validateRequestSchema, validateResultSchema } = require('../nora/client/schema-validator');

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../nora/tests/acceptance-cases.json'), 'utf8'));
const request = () => structuredClone(fixtures.cases.find(item => item.id === 'numeric-5-to-50').request);
const document = () => request().current;

function result() {
  const input = request();
  const evidence = segment => ({ segment_id: segment.segment_id, text: segment.text, locator: structuredClone(segment.locator) });
  return {
    schema_version: '1.0', request_id: input.request_id, project_id: input.project_id,
    status: 'needs_review',
    changes: [{ change_id: 'chg-001', requirement_key: 'REQ-APPROVAL-001', change_type: 'modified', risk: 'high', summary: '승인 대상 건수 기준 변경', before: evidence(input.baseline.segments[0]), after: evidence(input.current.segments[0]), reason: '5건에서 50건으로 변경되었다.', impacts: [] }],
    questions: [], warnings: [], approval: { status: 'not_requested', baseline_publication_allowed: false },
  };
}

function assertSchemaError(fn, code, keyword, instancePath) {
  assert.throws(fn, error => {
    assert.equal(error.name, 'SchemaValidationError');
    assert.equal(error.code, code);
    assert.ok(Array.isArray(error.validationErrors) && error.validationErrors.length > 0);
    if (keyword) assert.ok(error.validationErrors.some(issue => issue.keyword === keyword && (instancePath === undefined || issue.instancePath === instancePath)), JSON.stringify(error.validationErrors));
    return true;
  });
}

describe('strict draft 2020-12 schema contracts', () => {
  for (const [name, factory, validate] of [['document', document, validateDocumentSchema], ['request', request, validateRequestSchema], ['result', result, validateResultSchema]]) {
    test(`${name}: valid payload is returned by identity without mutation`, () => {
      const input = factory();
      const original = structuredClone(input);
      assert.equal(validate(input), input);
      assert.deepEqual(input, original);
    });
  }

  test('optional normalized document fields declared by the schema are accepted', () => {
    const input = document();
    input.segments[0].normalized_text = input.segments[0].text;
    input.normalization = { status: 'ready', warnings: [], segment_count: input.segments.length };
    assert.equal(validateDocumentSchema(input), input);
  });

  for (const [name, factory, validate, code] of [
    ['document', document, validateDocumentSchema, 'DOCUMENT_SCHEMA_INVALID'],
    ['request', request, validateRequestSchema, 'REQUEST_SCHEMA_INVALID'],
    ['result', result, validateResultSchema, 'RESULT_SCHEMA_INVALID'],
  ]) {
    test(`${name}: unexpected top-level fields are rejected, never removed`, () => {
      const input = factory();
      input.execute_deployment = true;
      const original = structuredClone(input);
      assertSchemaError(() => validate(input), code, 'additionalProperties', '');
      assert.deepEqual(input, original);
    });

    test(`${name}: an unrecognized schema_version is rejected`, () => {
      const input = factory();
      input.schema_version = '999';
      assertSchemaError(() => validate(input), code, 'const', '/schema_version');
    });
  }

  test('nested unknown document fields are rejected in requests', () => {
    const input = request();
    input.current.segments[0].locator.external_url = 'https://example.invalid/not-a-locator';
    assertSchemaError(() => validateRequestSchema(input), 'REQUEST_SCHEMA_INVALID', 'additionalProperties', '/current/segments/0/locator');
  });

  test('numeric values are not coerced into evidence strings', () => {
    const output = result();
    output.changes[0].after.text = 50;
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'type', '/changes/0/after/text');
    assert.equal(output.changes[0].after.text, 50);
  });

  test('evidence cannot be a plain string', () => {
    const output = result();
    output.changes[0].before = '문단 1';
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'anyOf', '/changes/0/before');
  });

  test('result evidence rejects extra source fields', () => {
    const output = result();
    output.changes[0].before.original_document = 'invented';
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'additionalProperties', '/changes/0/before');
  });

  for (const [field, value] of [['status', 'approved'], ['baseline_publication_allowed', true], ['baseline_publication_allowed', 'false']]) {
    test(`approval cannot contain ${field}=${JSON.stringify(value)}`, () => {
      const output = result();
      output.approval[field] = value;
      assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'const', `/approval/${field}`);
    });
  }

  test('questions cannot waive customer decision', () => {
    const output = result();
    output.questions.push({ question_id: 'q-001', related_change_ids: ['chg-001'], question: '새 기준이 맞습니까?', options: [], requires_customer_decision: false });
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'const', '/questions/0/requires_customer_decision');
  });

  test('missing approval is rejected without default insertion', () => {
    const output = result();
    delete output.approval;
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'required', '');
    assert.equal(Object.hasOwn(output, 'approval'), false);
  });

  test('an inherited approval property cannot fulfill the required field', () => {
    const output = result();
    const inheritedApproval = output.approval;
    delete output.approval;
    Object.setPrototypeOf(output, { approval: inheritedApproval });
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'required', '');
  });

  test('empty document text and empty segment collections are rejected', () => {
    const input = document();
    input.segments[0].text = '';
    assertSchemaError(() => validateDocumentSchema(input), 'DOCUMENT_SCHEMA_INVALID', 'minLength', '/segments/0/text');
    input.segments = [];
    assertSchemaError(() => validateDocumentSchema(input), 'DOCUMENT_SCHEMA_INVALID', 'minItems', '/segments');
  });

  test('empty request identity and empty result explanation are rejected', () => {
    const input = request();
    input.request_id = '';
    assertSchemaError(() => validateRequestSchema(input), 'REQUEST_SCHEMA_INVALID', 'minLength', '/request_id');
    const output = result();
    output.changes[0].reason = '';
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'minLength', '/changes/0/reason');
  });

  test('document and request accept 200 segments and reject 201', () => {
    const input = request();
    const segment = input.current.segments[0];
    input.current.segments = Array.from({ length: 200 }, (_, index) => ({ ...structuredClone(segment), segment_id: `seg-${index}`, requirement_key: `REQ-${index}` }));
    assert.equal(validateDocumentSchema(input.current), input.current);
    assert.equal(validateRequestSchema(input), input);
    input.current.segments.push({ ...structuredClone(segment), segment_id: 'seg-200', requirement_key: 'REQ-200' });
    assertSchemaError(() => validateDocumentSchema(input.current), 'DOCUMENT_SCHEMA_INVALID', 'maxItems', '/segments');
    assertSchemaError(() => validateRequestSchema(input), 'REQUEST_SCHEMA_INVALID', 'maxItems', '/current/segments');
  });

  test('result accepts 400 changes and rejects 401', () => {
    const output = result();
    const change = output.changes[0];
    output.changes = Array.from({ length: 400 }, (_, index) => ({ ...structuredClone(change), change_id: `chg-${index}` }));
    assert.equal(validateResultSchema(output), output);
    output.changes.push({ ...structuredClone(change), change_id: 'chg-400' });
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'maxItems', '/changes');
  });

  test('result rejects 401 questions', () => {
    const output = result();
    output.questions = Array.from({ length: 401 }, (_, index) => ({ question_id: `q-${index}`, related_change_ids: ['chg-001'], question: '정책 확인', options: [], requires_customer_decision: true }));
    assertSchemaError(() => validateResultSchema(output), 'RESULT_SCHEMA_INVALID', 'maxItems', '/questions');
  });

  test('document hashes must be exactly 64 lowercase hexadecimal characters', () => {
    for (const badHash of ['abc', 'A'.repeat(64), 'g'.repeat(64), 'a'.repeat(65)]) {
      const input = document();
      input.source.sha256 = badHash;
      assertSchemaError(() => validateDocumentSchema(input), 'DOCUMENT_SCHEMA_INVALID', 'pattern', '/source/sha256');
    }
  });

  test('saved error diagnostics do not change after another validation', () => {
    const input = document();
    input.segments[0].text = '';
    let firstError;
    try { validateDocumentSchema(input); } catch (error) { firstError = error; }
    assert.ok(firstError);
    const captured = structuredClone(firstError.validationErrors);
    const other = document();
    other.source.sha256 = 'bad';
    assertSchemaError(() => validateDocumentSchema(other), 'DOCUMENT_SCHEMA_INVALID');
    assert.deepEqual(firstError.validationErrors, captured);
    assert.equal(JSON.stringify(firstError.validationErrors).includes(input.segments[0].requirement_key), false);
  });

  test('invalid fixture structures fail schema validation independently of business checks', () => {
    for (const id of ['malformed-segments', 'missing-source-locator']) {
      const input = structuredClone(fixtures.cases.find(item => item.id === id).request);
      assertSchemaError(() => validateRequestSchema(input), 'REQUEST_SCHEMA_INVALID');
    }
  });
});
