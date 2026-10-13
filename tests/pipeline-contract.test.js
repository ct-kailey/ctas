'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const evidence = require('../nora/pipeline/evidence.json');
const { validatePipelineInput, validatePipelineResponse, DEFAULT_PIPELINE_ID, DEFAULT_STAGE_IDS } = require('../nora/client/pipeline-contract.js');

const input = () => structuredClone(evidence.valid.input);
const options = () => ({expectedProjectId: evidence.valid.input.project_id});
function response() {
  return {
    kind: 'pipelineRun', ok: true, pipelineId: DEFAULT_PIPELINE_ID,
    runId: evidence.valid.runId, status: 'succeeded',
    report: {
      stages: DEFAULT_STAGE_IDS.map(block_id => ({block_id, status: 'ok', artifacts: {records: 1, ok: 1, failed: 0}})),
      final_output: JSON.stringify(evidence.valid.output)
    }
  };
}
function throwsCode(fn, code) { assert.throws(fn, error => error.code === code); }
function corruptOutput(mutate) {
  const result = response(); const output = JSON.parse(result.report.final_output); mutate(output);
  result.report.final_output = JSON.stringify(output); return result;
}

test('accepts observed MCP inline shape and preserves arguments', () => {
  const document = input(), result = response(), before = structuredClone({document, result});
  assert.deepEqual(validatePipelineResponse(result, document, options()), evidence.valid.output);
  assert.deepEqual({document, result}, before);
});
test('accepts documented REST shape without optional MCP metadata', () => {
  const result = response(); delete result.kind; delete result.ok; delete result.pipelineId;
  assert.deepEqual(validatePipelineResponse(result, input(), options()), evidence.valid.output);
});
test('rejects array input before invocation, including one-element arrays', () => {
  throwsCode(() => validatePipelineInput([input()], options().expectedProjectId), 'PIPELINE_SINGLE_DOCUMENT_REQUIRED');
});
test('requires trusted expected project context and matching project', () => {
  throwsCode(() => validatePipelineInput(input()), 'PIPELINE_PROJECT_CONTEXT_REQUIRED');
  throwsCode(() => validatePipelineInput(input(), 'another-project'), 'PROJECT_MISMATCH');
});
test('rejects succeeded mixed-batch report from observed Nora behavior', () => {
  const result = response(); result.runId = evidence.mixed_array_limitation.runId;
  result.report.stages.forEach(stage => { stage.artifacts = {records: 2, ok: 1, failed: 1}; });
  result.report.final_output = JSON.stringify([evidence.valid.output, evidence.mixed_array_limitation.invalid_record]);
  throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_RECORD_FAILED');
});
test('rejects all-success batch counters and array final output', () => {
  const result = response(); result.report.stages[0].artifacts = {records: 2, ok: 2, failed: 0};
  throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_SINGLE_DOCUMENT_REQUIRED');
  const arrayOutput = response(); arrayOutput.report.final_output = JSON.stringify([evidence.valid.output]);
  throwsCode(() => validatePipelineResponse(arrayOutput, input(), options()), 'PIPELINE_SINGLE_DOCUMENT_REQUIRED');
});
test('rejects failed, pending and false-ok runs', () => {
  for (const status of ['failed', 'running', 'queued', 'cancelled']) {
    const result = response(); result.status = status;
    throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_RUN_NOT_SUCCEEDED');
  }
  const result = response(); result.ok = false;
  throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_RUN_NOT_SUCCEEDED');
});
test('rejects failed stage, missing failure counters and string counters', () => {
  const failed = response(); failed.report.stages[0].status = 'error';
  throwsCode(() => validatePipelineResponse(failed, input(), options()), 'PIPELINE_STAGE_FAILED');
  for (const value of [undefined, '0', null, 1]) {
    const result = response(); result.report.stages[0].artifacts.failed = value;
    throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_RECORD_FAILED');
  }
});
test('requires both expected stages once and in order', () => {
  const missing = response(); missing.report.stages.pop();
  throwsCode(() => validatePipelineResponse(missing, input(), options()), 'PIPELINE_STAGE_MISSING');
  const reordered = response(); reordered.report.stages.reverse();
  throwsCode(() => validatePipelineResponse(reordered, input(), options()), 'PIPELINE_STAGE_MISSING');
  const duplicate = response(); duplicate.report.stages.push(duplicate.report.stages[0]);
  throwsCode(() => validatePipelineResponse(duplicate, input(), options()), 'PIPELINE_STAGE_INVALID');
});
test('checks failure counters on extra reported stages too', () => {
  const result = response(); result.report.stages.push({block_id:'unexpected', status:'ok', artifacts:{failed:1}});
  throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_RECORD_FAILED');
});
test('rejects acknowledgements, malformed JSON and missing normalization', () => {
  throwsCode(() => validatePipelineResponse({runId:'x', statusUrl:'/runs/x'}, input(), options()), 'PIPELINE_RUN_NOT_SUCCEEDED');
  const result = response(); result.report.final_output = '{broken';
  throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_OUTPUT_INVALID');
  throwsCode(() => validatePipelineResponse(corruptOutput(d => delete d.normalization), input(), options()), 'PIPELINE_NORMALIZATION_INVALID');
});
test('rejects script_error even if reported run and stages succeeded', () => {
  throwsCode(() => validatePipelineResponse(corruptOutput(d => { d.script_error = {error:'failed'}; }), input(), options()), 'PIPELINE_SCRIPT_ERROR');
});
test('rejects changed original source text, locator and extraction status', () => {
  for (const mutate of [
    d => { d.segments[0].text = d.segments[0].text.replace('5 mg', '50 mg'); },
    d => { d.segments[0].locator.label = 'page 999'; },
    d => { d.segments[0].extraction_status = 'needs_review'; }
  ]) throwsCode(() => validatePipelineResponse(corruptOutput(mutate), input(), options()), 'PIPELINE_SEGMENT_CHANGED');
});
test('rejects source hash, revision and project changes', () => {
  throwsCode(() => validatePipelineResponse(corruptOutput(d => { d.source.sha256 = '0'.repeat(64); }), input(), options()), 'PIPELINE_SOURCE_CHANGED');
  throwsCode(() => validatePipelineResponse(corruptOutput(d => { d.revision_id = 'r999'; }), input(), options()), 'PIPELINE_IDENTITY_CHANGED');
  throwsCode(() => validatePipelineResponse(corruptOutput(d => { d.project_id = 'other'; }), input(), options()), 'PROJECT_MISMATCH');
});
test('rejects numerical or compatibility-character rewrites in normalized text', () => {
  for (const mutate of [
    d => { d.segments[0].normalized_text = d.segments[0].normalized_text.replace('5 mg', '50 mg'); },
    d => { d.segments[0].normalized_text = d.segments[0].normalized_text.normalize('NFKC'); }
  ]) throwsCode(() => validatePipelineResponse(corruptOutput(mutate), input(), options()), 'PIPELINE_NORMALIZED_TEXT_INVALID');
});
test('requires needs_review and retained warnings for incomplete extraction', () => {
  const document = input(); document.extraction = {complete:false, warnings:['Synthetic OCR uncertainty']};
  const result = corruptOutput(d => { d.extraction = structuredClone(document.extraction); });
  throwsCode(() => validatePipelineResponse(result, document, options()), 'PIPELINE_NORMALIZATION_INVALID');
  const output = JSON.parse(result.report.final_output);
  output.normalization = {status:'needs_review', warnings:['Synthetic OCR uncertainty'], segment_count:1};
  result.report.final_output = JSON.stringify(output);
  assert.equal(validatePipelineResponse(result, document, options()).normalization.status, 'needs_review');
});
test('rejects normalization count/status inconsistency and wrong pipeline', () => {
  throwsCode(() => validatePipelineResponse(corruptOutput(d => { d.normalization.segment_count = 9; }), input(), options()), 'PIPELINE_NORMALIZATION_INVALID');
  throwsCode(() => validatePipelineResponse(corruptOutput(d => { d.normalization.warnings = ['Review needed']; }), input(), options()), 'PIPELINE_NORMALIZATION_INVALID');
  const result = response(); result.pipelineId = 'another-pipeline';
  throwsCode(() => validatePipelineResponse(result, input(), options()), 'PIPELINE_ID_MISMATCH');
});
