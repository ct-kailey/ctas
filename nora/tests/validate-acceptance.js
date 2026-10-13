'use strict';

const { validateRequest, prepareReview, finalizeReview } = require('../flow/review-core.js');
const { validateRequestSchema, validateResultSchema } = require('../client/schema-validator.js');

const limitations = Object.freeze([
  '출력 검사만으로 실제 도구 호출 부재, 외부 변경 부재 또는 인증 경계를 입증하지 않는다. 실행 trace를 별도로 확인해야 한다.',
  '설명·질문의 도메인 의미 정확성과 inferred 영향의 사실성은 사람이 별도로 검토해야 한다.',
]);

function fail(caseId, violations, cause) {
  const error = new Error(`ACCEPTANCE_FAILED: ${caseId}: ${violations.join('; ')}`);
  error.name = 'AcceptanceValidationError';
  error.code = 'ACCEPTANCE_FAILED';
  error.case_id = caseId;
  error.violations = violations;
  if (cause) {
    error.cause = cause;
    error.cause_code = cause.code;
  }
  throw error;
}

function matchesRequired(change, expected) {
  if (Object.hasOwn(expected, 'requirement_key') && change.requirement_key !== expected.requirement_key) return false;
  if (expected.change_type && change.change_type !== expected.change_type) return false;
  if (expected.change_type_any_of && !expected.change_type_any_of.includes(change.change_type)) return false;
  for (const side of ['before', 'after']) {
    if (Object.hasOwn(expected, `${side}_is_null`) && (change[side] === null) !== expected[`${side}_is_null`]) return false;
    const tokens = expected[`${side}_text_contains`] || [];
    if (tokens.length && (!change[side] || !tokens.every(token => change[side].text.includes(token)))) return false;
  }
  return true;
}

/**
 * Validate a parsed final review against one acceptance fixture. This function
 * does not call Nora and does not mutate the fixture or review. In particular,
 * finalizeReview's status/warning repair must not hide omissions in raw output.
 * For an expected input rejection, omit review; this validates the local gate,
 * not whether a caller actually refrained from running the remote flow.
 */
function validateAcceptance(testCase, review) {
  const caseId = testCase && testCase.id;
  if (!caseId || !testCase.request || !testCase.expected) fail(caseId || 'unknown', ['fixture shape is invalid']);
  const expected = testCase.expected;
  const violations = [];

  if (expected.validation_error || expected.flow_must_not_run) {
    if (review !== undefined) violations.push('an input rejection case must not supply a review');
    let rejection;
    try { validateRequest(structuredClone(testCase.request)); } catch (error) { rejection = error; }
    if (!rejection) violations.push('input gate did not reject the fixture');
    else if (rejection.code !== expected.validation_error) violations.push(`expected input error ${expected.validation_error}, received ${rejection.code}`);
    if (violations.length) fail(caseId, violations, rejection);
    return {
      ok: true, case_id: caseId, mode: 'input_rejection', error_code: rejection.code,
      checks: ['expected_input_error'], limitations: [...limitations],
    };
  }

  let checked;
  let prepared;
  try {
    const requestCopy = structuredClone(testCase.request);
    validateRequestSchema(requestCopy);
    validateRequest(requestCopy);
    validateResultSchema(review);
    prepared = prepareReview(requestCopy);
    checked = finalizeReview(requestCopy, structuredClone(review));
    validateResultSchema(checked);
  } catch (error) {
    fail(caseId, [`contract validation failed: ${error.code || error.name}`], error);
  }

  if (!expected.allowed_statuses.includes(review.status)) violations.push(`status ${review.status} is not allowed`);
  if (review.status !== checked.status) violations.push(`status must be ${checked.status} before consumer normalization`);
  for (const warning of prepared.warnings) {
    if (!review.warnings.includes(warning)) violations.push(`missing deterministic warning: ${warning}`);
  }
  if (expected.warning_required && !review.warnings.some(warning => warning.trim().length > 0)) violations.push('at least one nonempty warning is required');

  for (const collection of ['changes', 'questions']) {
    for (const [bound, compare] of [['min', (actual, limit) => actual >= limit], ['max', (actual, limit) => actual <= limit]]) {
      const limit = expected[`${collection}_${bound}`];
      if (limit != null && !compare(review[collection].length, limit)) violations.push(`${collection} count ${review[collection].length} violates ${bound} ${limit}`);
    }
  }
  for (const change of review.changes) {
    if (!expected.permitted_change_types.includes(change.change_type)) violations.push(`change type ${change.change_type} is not permitted: ${change.change_id}`);
    if (change.change_type === 'added' && (change.before !== null || change.after === null)) violations.push(`added evidence sides are invalid: ${change.change_id}`);
    if (change.change_type === 'removed' && (change.before === null || change.after !== null)) violations.push(`removed evidence sides are invalid: ${change.change_id}`);
  }

  // Each expected entry must be satisfied by a distinct, completely matching
  // output entry; a key match alone cannot conceal missing before/after tokens.
  const used = new Set();
  for (const [index, required] of expected.required_changes.entries()) {
    const match = review.changes.findIndex((change, changeIndex) => !used.has(changeIndex) && matchesRequired(change, required));
    if (match < 0) violations.push(`required change ${index + 1} was not found: ${required.requirement_key || '(no key)'}`);
    else used.add(match);
  }
  if (expected.approval) {
    for (const [field, value] of Object.entries(expected.approval)) {
      if (review.approval[field] !== value) violations.push(`approval.${field} does not match the fixture`);
    }
  }

  // This fixture's natural-language invariant is a graph constraint that can
  // be checked without pretending to evaluate the wording of the question.
  if (caseId === 'policy-now-undecided') {
    const ids = new Set(review.changes.filter(change => change.requirement_key === 'REQ-TIMEOUT-001').map(change => change.change_id));
    if (!review.questions.some(question => question.related_change_ids.some(id => ids.has(id)))) violations.push('the undecided policy requires a question linked to its change');
  }

  if (violations.length) fail(caseId, violations);
  return {
    ok: true, case_id: caseId, mode: 'review', review: checked,
    checks: ['input_schema', 'result_schema', 'original_evidence_and_coverage', 'approval_and_references', 'raw_status_and_warnings', 'fixture_expectations'],
    limitations: [...limitations],
  };
}

module.exports = { validateAcceptance };
