'use strict';

const { isDeepStrictEqual } = require('node:util');
const { validateDocument } = require('../flow/review-core.js');
const manifest = require('../pipeline/manifest.json');

const DEFAULT_PIPELINE_ID = manifest.pipeline_id;
const DEFAULT_STAGE_IDS = Object.freeze([manifest.nodes.validate, manifest.nodes.normalize]);

function fail(code, message) {
  const error = new Error(code + ': ' + message);
  error.code = code;
  throw error;
}
function need(value, code, message) { if (!value) fail(code, message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
function normalizeWhitespace(text) {
  return text.replace(/\r\n?/g, '\n').split('\n')
    .map(line => line.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n').trim();
}

/**
 * Validate BEFORE issuing an external request. Nora expands array input into
 * records and may succeed after a record failed. No array/batch is supported.
 * expectedProjectId must come from the trusted caller's project context;
 * comparing an ID is not a substitute for authenticating project access.
 * Full JSON Schema/additionalProperties validation belongs to the caller.
 */
function validatePipelineInput(document, expectedProjectId) {
  need(object(document), 'PIPELINE_SINGLE_DOCUMENT_REQUIRED', 'Input must be one Document object');
  need(nonempty(expectedProjectId), 'PIPELINE_PROJECT_CONTEXT_REQUIRED', 'A trusted expected project ID is required');
  need(!own(document, 'script_error'), 'PIPELINE_SCRIPT_ERROR', 'Input contains a failed-script marker');
  return validateDocument(document, expectedProjectId);
}

/**
 * Accept the parsed JSON run payload, not a raw MCP content wrapper, an SSE
 * frame, a status URL or an asynchronous acknowledgement. Observed MCP shape:
 * {kind:'pipelineRun',ok:true,pipelineId,runId,status:'succeeded',report:{
 *   stages:[{block_id,status:'ok',artifacts:{failed:0,records:1,ok:1}}, ...],
 *   final_output:'<serialized Document>'}}
 *
 * The documented external REST shape omits kind/ok/pipelineId and is also
 * accepted; these fields are checked when present. Required script stages
 * must appear exactly once, in expected order, and have one successful record.
 * Every reported stage must have status=ok and artifacts.failed exactly 0.
 *
 * Returns the parsed, validated normalized Document without mutating either
 * argument. This checks structural/integrity invariants, not original-binary
 * extraction accuracy, SHA-256 recomputation or user authorization.
 */
function validatePipelineResponse(response, inputDocument, options = {}) {
  need(object(options), 'PIPELINE_OPTIONS_INVALID', 'Options must be an object');
  const expectedProjectId = options.expectedProjectId;
  const expectedPipelineId = options.expectedPipelineId === undefined ? DEFAULT_PIPELINE_ID : options.expectedPipelineId;
  const expectedStageIds = options.expectedStageIds === undefined ? DEFAULT_STAGE_IDS : options.expectedStageIds;
  validatePipelineInput(inputDocument, expectedProjectId);
  need(nonempty(expectedPipelineId), 'PIPELINE_OPTIONS_INVALID', 'Expected pipeline ID is required');
  need(Array.isArray(expectedStageIds) && expectedStageIds.length > 0 && expectedStageIds.every(nonempty) &&
    new Set(expectedStageIds).size === expectedStageIds.length, 'PIPELINE_OPTIONS_INVALID', 'Expected stage IDs must be unique nonempty strings');
  need(object(response), 'PIPELINE_RESPONSE_INVALID', 'Run response must be an object');
  need(response.status === 'succeeded' && nonempty(response.runId) && !response.error,
    'PIPELINE_RUN_NOT_SUCCEEDED', 'A completed successful run is required');
  if (own(response, 'ok')) need(response.ok === true, 'PIPELINE_RUN_NOT_SUCCEEDED', 'Run ok flag is not true');
  if (own(response, 'kind')) need(response.kind === 'pipelineRun', 'PIPELINE_RESPONSE_INVALID', 'Unexpected run kind');
  if (own(response, 'pipelineId')) need(response.pipelineId === expectedPipelineId, 'PIPELINE_ID_MISMATCH', 'Unexpected pipeline ID');
  need(object(response.report) && Array.isArray(response.report.stages), 'PIPELINE_REPORT_INVALID', 'Completed stage report is required');

  const seen = new Set();
  const expectedOrder = [];
  for (const stage of response.report.stages) {
    need(object(stage) && nonempty(stage.block_id) && !seen.has(stage.block_id), 'PIPELINE_STAGE_INVALID', 'Missing or duplicate stage ID');
    seen.add(stage.block_id);
    need(stage.status === 'ok', 'PIPELINE_STAGE_FAILED', 'Every stage must complete successfully');
    need(object(stage.artifacts) && stage.artifacts.failed === 0, 'PIPELINE_RECORD_FAILED', 'Every stage must explicitly report zero failed records');
    if (expectedStageIds.includes(stage.block_id)) {
      need(stage.artifacts.records === 1 && stage.artifacts.ok === 1,
        'PIPELINE_SINGLE_DOCUMENT_REQUIRED', 'Expected script stage must process exactly one successful record');
      expectedOrder.push(stage.block_id);
    }
  }
  need(isDeepStrictEqual(expectedOrder, [...expectedStageIds]), 'PIPELINE_STAGE_MISSING', 'Expected validation and normalization stages must complete in order');
  need(typeof response.report.final_output === 'string' && response.report.final_output.trim() !== '',
    'PIPELINE_OUTPUT_INVALID', 'Completed report must contain serialized final_output');
  let output;
  try { output = JSON.parse(response.report.final_output); }
  catch { fail('PIPELINE_OUTPUT_INVALID', 'final_output is not valid JSON'); }
  need(object(output), 'PIPELINE_SINGLE_DOCUMENT_REQUIRED', 'Final output must be one Document object');
  need(!own(output, 'script_error'), 'PIPELINE_SCRIPT_ERROR', 'Output contains a failed-script marker');
  validateDocument(output, expectedProjectId);

  for (const field of ['schema_version', 'project_id', 'document_id', 'revision_id']) {
    need(output[field] === inputDocument[field], 'PIPELINE_IDENTITY_CHANGED', 'Document identity changed: ' + field);
  }
  need(isDeepStrictEqual(output.source, inputDocument.source), 'PIPELINE_SOURCE_CHANGED', 'Source metadata changed');
  need(isDeepStrictEqual(output.extraction, inputDocument.extraction), 'PIPELINE_EXTRACTION_CHANGED', 'Extraction evidence changed');
  need(output.segments.length === inputDocument.segments.length, 'PIPELINE_SEGMENTS_CHANGED', 'Segment count changed');
  output.segments.forEach((segment, index) => {
    const original = inputDocument.segments[index];
    for (const field of ['segment_id', 'requirement_key', 'text', 'locator', 'extraction_status']) {
      need(isDeepStrictEqual(segment[field], original[field]), 'PIPELINE_SEGMENT_CHANGED', 'Original segment evidence changed: ' + field);
    }
    need(segment.normalized_text === normalizeWhitespace(original.text),
      'PIPELINE_NORMALIZED_TEXT_INVALID', 'normalized_text may only normalize whitespace and line endings');
  });

  const normalization = output.normalization;
  need(object(normalization) && ['ready', 'needs_review'].includes(normalization.status) &&
    Array.isArray(normalization.warnings) && normalization.warnings.every(nonempty) &&
    normalization.segment_count === output.segments.length,
    'PIPELINE_NORMALIZATION_INVALID', 'A valid normalization result is required');
  need(normalization.status === (normalization.warnings.length > 0 ? 'needs_review' : 'ready'),
    'PIPELINE_NORMALIZATION_INVALID', 'Normalization status must agree with its warnings');
  const sourceNeedsReview = !inputDocument.extraction.complete || inputDocument.extraction.warnings.length > 0 ||
    inputDocument.segments.some(segment => segment.extraction_status === 'needs_review');
  need(!sourceNeedsReview || normalization.status === 'needs_review',
    'PIPELINE_NORMALIZATION_INVALID', 'Extraction uncertainty cannot be marked ready');
  need(inputDocument.extraction.warnings.every(warning => normalization.warnings.includes(warning)),
    'PIPELINE_NORMALIZATION_INVALID', 'Extraction warnings must be retained');
  return output;
}

module.exports = { validatePipelineInput, validatePipelineResponse, DEFAULT_PIPELINE_ID, DEFAULT_STAGE_IDS };
