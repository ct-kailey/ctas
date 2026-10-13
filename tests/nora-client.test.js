'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { describe, test } = require('node:test');
const { PIPELINE_URL, FLOW_SLUG, FLOW_URL, runDocumentPipeline, validateFlowResponse, runChangeReview,
  validatePublishedFlowResponse, runPublishedChangeReview, runDocumentReview } = require('../nora/client/nora-client');
const { prepareReview } = require('../nora/flow/review-core');

const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const fixtures = read('nora/tests/acceptance-cases.json');
const request = () => structuredClone(fixtures.cases.find(item => item.id === 'numeric-5-to-50').request);
const pipelineInput = () => read('nora/pipeline/synthetic-document.json');
const observedHttpResponse = () => read('nora/pipeline/http-smoke-response.json');
const observedFailedFlow = () => read('nora/flow/failed-run.json');
const observedPublishedFlow = () => read('nora/flow/http-smoke-response.json');
const fakeToken = 'test-token-not-a-real-secret';

function reviewFor(input) {
  return {
    schema_version: '1.0', request_id: input.request_id, project_id: input.project_id, status: 'needs_review',
    changes: prepareReview(input).candidates.map(candidate => ({
      change_id: candidate.change_id, requirement_key: candidate.requirement_key,
      change_type: candidate.change_type, risk: candidate.risk,
      summary: '합성 변경 검토', before: structuredClone(candidate.before), after: structuredClone(candidate.after),
      reason: '제공된 이전·현재 원문 비교', impacts: [],
    })),
    questions: [], warnings: [], approval: { status: 'not_requested', baseline_publication_allowed: false },
  };
}

// Fabricated variations exercise failure boundaries; actual successful runs
// from Nora are separately checked below.
function hypotheticalSuccess(input, output = reviewFor(input)) {
  return { kind: 'flowRun', slug: FLOW_SLUG, ok: true, status: 'ok', run: { traceId: 'trace-synthetic-hypothesis', status: 'ok', output } };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => { assert.equal(error.code, code); return true; });
}

describe('pipeline HTTP client with recorded response', () => {
  test('validates the real HTTP smoke envelope through mock fetch without mutating input', async () => {
    const input = pipelineInput();
    const original = structuredClone(input);
    const response = observedHttpResponse();
    const responseOriginal = structuredClone(response);
    const calls = [];
    const output = await runDocumentPipeline(input, {
      expectedProjectId: input.project_id, token: fakeToken,
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        assert.equal(url, PIPELINE_URL);
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, `Bearer ${fakeToken}`);
        assert.ok(options.signal instanceof AbortSignal);
        const body = JSON.parse(options.body);
        assert.deepEqual(body.input, original);
        assert.match(body.idempotency_key, /^[a-f0-9]{64}$/);
        return { ok: true, status: 200, json: async () => response };
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(output.runId, response.runId);
    assert.deepEqual(output.document, JSON.parse(response.report.final_output));
    assert.equal(output.idempotencyKey, JSON.parse(calls[0].options.body).idempotency_key);
    assert.deepEqual(input, original);
    assert.deepEqual(response, responseOriginal);
    assert.equal(JSON.stringify(output).includes(fakeToken), false);
  });

  test('the same input produces the same idempotency key', async () => {
    const input = pipelineInput();
    const keys = [];
    const options = { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async (_url, init) => {
      keys.push(JSON.parse(init.body).idempotency_key);
      return { ok: true, status: 200, json: async () => observedHttpResponse() };
    } };
    await runDocumentPipeline(input, options);
    await runDocumentPipeline(structuredClone(input), options);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
  });

  for (const [label, mutate, code] of [
    ['missing trusted project', (_input, options) => { delete options.expectedProjectId; }, 'PIPELINE_PROJECT_CONTEXT_REQUIRED'],
    ['wrong project', (_input, options) => { options.expectedProjectId = 'other-project'; }, 'PROJECT_MISMATCH'],
    ['unknown input field', input => { input.approved = true; }, 'DOCUMENT_SCHEMA_INVALID'],
    ['missing token', (_input, options) => { delete options.token; }, 'PIPELINE_AUTH_REQUIRED'],
  ]) {
    test(`${label}: rejects before fetch`, async () => {
      const input = pipelineInput();
      let calls = 0;
      const options = { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async () => { calls++; throw new Error('must not call'); } };
      mutate(input, options);
      await rejectsCode(runDocumentPipeline(input, options), code);
      assert.equal(calls, 0);
    });
  }

  test('HTTP 401 is rejected without trying to parse a success result', async () => {
    const input = pipelineInput();
    let calls = 0;
    let parsed = false;
    await rejectsCode(runDocumentPipeline(input, { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async () => {
      calls++;
      return { ok: false, status: 401, json: async () => { parsed = true; return observedHttpResponse(); } };
    } }), 'PIPELINE_HTTP_401');
    assert.equal(calls, 1);
    assert.equal(parsed, false);
  });

  test('redirects are disallowed and an unknown transport result is never replayed', async () => {
    const input = pipelineInput();
    let calls = 0;
    await assert.rejects(runDocumentPipeline(input, { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, 'error');
      throw new TypeError(`redirect/network failure ${fakeToken}`);
    } }), error => {
      assert.equal(error.code, 'PIPELINE_TRANSPORT_UNKNOWN');
      assert.equal(error.message.includes(fakeToken), false);
      return true;
    });
    assert.equal(calls, 1);
  });

  test('a returned 302 response also fails closed', async () => {
    const input = pipelineInput();
    await rejectsCode(runDocumentPipeline(input, { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async () => ({ ok: false, status: 302 }) }), 'PIPELINE_HTTP_302');
  });

  test('HTTP success with non-JSON or an unknown envelope is rejected', async () => {
    const input = pipelineInput();
    await rejectsCode(runDocumentPipeline(input, { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad JSON'); } }) }), 'PIPELINE_RESPONSE_INVALID');
    await rejectsCode(runDocumentPipeline(input, { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ accepted: true }) }) }), 'PIPELINE_RUN_NOT_SUCCEEDED');
  });

  test('HTTP success cannot hide a failed pipeline stage', async () => {
    const input = pipelineInput();
    const response = observedHttpResponse();
    response.report.stages[0].artifacts.failed = 1;
    await rejectsCode(runDocumentPipeline(input, { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async () => ({ ok: true, status: 200, json: async () => response }) }), 'PIPELINE_RECORD_FAILED');
  });

  test('pipeline response cannot alter original text even when its schema is valid', async () => {
    const input = pipelineInput();
    const original = structuredClone(input);
    const response = observedHttpResponse();
    const document = JSON.parse(response.report.final_output);
    document.segments[0].text = '변조된 원문';
    response.report.final_output = JSON.stringify(document);
    await rejectsCode(runDocumentPipeline(input, { expectedProjectId: input.project_id, token: fakeToken, fetchImpl: async () => ({ ok: true, status: 200, json: async () => response }) }), 'PIPELINE_SEGMENT_CHANGED');
    assert.deepEqual(input, original);
  });
});

describe('flow transport and evidence boundary', () => {
  test('the observed failed MCP run is rejected and its trace is retained', () => {
    const input = request();
    const response = observedFailedFlow();
    assert.throws(() => validateFlowResponse(response, input, input.project_id, { expectedFlowSlug: 'ains-sism-change-review-v1' }), error => {
      assert.equal(error.code, 'FLOW_RUN_NOT_SUCCEEDED');
      assert.equal(error.traceId, response.run.traceId);
      return true;
    });
  });

  for (const fixture of fixtures.cases.filter(item => !item.expected.flow_must_not_run)) {
    test(`recorded OpenAI success passes original-evidence validation: ${fixture.id}`, () => {
      const response = read(`nora/flow/acceptance-runs/${fixture.id}.json`);
      const original = structuredClone(response);
      const result = validateFlowResponse(response, fixture.request, fixture.request.project_id, {
        expectedFlowSlug: 'ains-sism-change-review-openai-v1',
      });
      assert.equal(result.traceId, response.run.traceId);
      assert.equal(result.review.request_id, fixture.request.request_id);
      assert.equal(result.review.approval.baseline_publication_allowed, false);
      assert.deepEqual(response, original);
    });
  }

  test('historical success requires the caller to explicitly select its flow slug', () => {
    const input = request();
    const response = hypotheticalSuccess(input);
    response.slug = 'historical-archived-flow';
    assert.throws(() => validateFlowResponse(response, input, input.project_id), { code: 'FLOW_RESPONSE_INVALID' });
    assert.equal(validateFlowResponse(response, input, input.project_id, { expectedFlowSlug: response.slug }).review.request_id, input.request_id);
  });

  test('a raw MCP content wrapper is not mistaken for a parsed success response', () => {
    const input = request();
    const wrapper = { content: [{ type: 'text', text: JSON.stringify(hypotheticalSuccess(input)) }] };
    assert.throws(() => validateFlowResponse(wrapper, input, input.project_id), { code: 'FLOW_RESPONSE_INVALID' });
  });

  test('a hypothetical successful transport uses cloned inputs and preserves the local request', async () => {
    const input = request();
    const original = structuredClone(input);
    let calls = 0;
    const output = await runChangeReview(input, { expectedProjectId: input.project_id, invokeFlow: async args => {
      calls++;
      assert.equal(args.slug, FLOW_SLUG);
      assert.equal(args.test, false);
      assert.deepEqual(JSON.parse(args.input), original);
      assert.deepEqual(args.variables.review_request, original);
      assert.notEqual(args.variables.review_request, input);
      return hypotheticalSuccess(input, JSON.stringify(reviewFor(input)));
    } });
    assert.equal(calls, 1);
    assert.equal(output.traceId, 'trace-synthetic-hypothesis');
    assert.deepEqual(output.review.approval, { status: 'not_requested', baseline_publication_allowed: false });
    assert.deepEqual(input, original);
  });

  test('draft execution requires an explicit test option', async () => {
    const input = request();
    await runChangeReview(input, { expectedProjectId: input.project_id, test: true, invokeFlow: async args => {
      assert.equal(args.test, true);
      return hypotheticalSuccess(input);
    } });
  });

  for (const [label, mutate, code] of [
    ['wrong trusted project', (_input, options) => { options.expectedProjectId = 'other-project'; }, 'PROJECT_MISMATCH'],
    ['missing trusted project', (_input, options) => { delete options.expectedProjectId; }, 'PROJECT_MISMATCH'],
    ['embedded project mismatch', input => { input.current.project_id = 'other-project'; }, 'PROJECT_MISMATCH'],
    ['conflicting original revision', input => { input.current.revision_id = input.baseline.revision_id; }, 'REVISION_CONFLICT'],
    ['unknown original field', input => { input.current.segments[0].approval = true; }, 'REQUEST_SCHEMA_INVALID'],
  ]) {
    test(`${label}: rejects before flow transport`, async () => {
      const input = request();
      let calls = 0;
      const options = { expectedProjectId: input.project_id, invokeFlow: async () => { calls++; throw new Error('must not call'); } };
      mutate(input, options);
      await rejectsCode(runChangeReview(input, options), code);
      assert.equal(calls, 0);
    });
  }

  test('transport cannot mutate the authoritative request snapshot to legitimize invented evidence', async () => {
    const input = request();
    const original = structuredClone(input);
    await rejectsCode(runChangeReview(input, { expectedProjectId: input.project_id, invokeFlow: async args => {
      const tampered = args.variables.review_request;
      tampered.current.segments[0].text = '처리 건수가 5000건 이상이면 추가 승인을 요청한다.';
      return hypotheticalSuccess(tampered);
    } }), 'EVIDENCE_MISMATCH');
    assert.deepEqual(input, original);
  });

  test('valid success flags cannot legitimize output provenance or approval tampering', () => {
    const input = request();
    const wrongEvidence = hypotheticalSuccess(input);
    wrongEvidence.run.output.changes[0].after.locator.label = '존재하지 않는 원문';
    assert.throws(() => validateFlowResponse(wrongEvidence, input, input.project_id), { code: 'EVIDENCE_MISMATCH' });
    const illegalApproval = hypotheticalSuccess(input);
    illegalApproval.run.output.approval.baseline_publication_allowed = true;
    assert.throws(() => validateFlowResponse(illegalApproval, input, input.project_id), { code: 'RESULT_SCHEMA_INVALID' });
  });

  test('pending, partial, failure-bearing, and unknown flow envelopes fail closed', () => {
    const input = request();
    const variations = [
      response => { response.status = 'partial'; },
      response => { response.run.status = 'needs_review'; },
      response => { response.run.failure = { code: 'provider.failed' }; },
      response => { response.ok = false; },
      response => { delete response.run.traceId; },
    ];
    for (const mutate of variations) {
      const response = hypotheticalSuccess(input);
      mutate(response);
      assert.throws(() => validateFlowResponse(response, input, input.project_id), { code: 'FLOW_RUN_NOT_SUCCEEDED' });
    }
    const wrongSlug = hypotheticalSuccess(input);
    wrongSlug.slug = 'other-flow';
    assert.throws(() => validateFlowResponse(wrongSlug, input, input.project_id), { code: 'FLOW_RESPONSE_INVALID' });
  });

  test('successful envelopes need a nonempty string trace ID', () => {
    const input = request();
    for (const traceId of [1, {}, [], '   ']) {
      const response = hypotheticalSuccess(input);
      response.run.traceId = traceId;
      assert.throws(() => validateFlowResponse(response, input, input.project_id), { code: 'FLOW_RUN_NOT_SUCCEEDED' });
    }
  });

  test('missing transport and transport uncertainty never return a review or replay the call', async () => {
    const input = request();
    await rejectsCode(runChangeReview(input, { expectedProjectId: input.project_id }), 'FLOW_TRANSPORT_REQUIRED');
    let calls = 0;
    await assert.rejects(runChangeReview(input, { expectedProjectId: input.project_id, invokeFlow: async () => { calls++; throw new Error('completion unknown'); } }));
    assert.equal(calls, 1);
  });
});

describe('offline CLI behavior', () => {
  function setup(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nora-client-tests-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const input = request();
    const inputFile = path.join(directory, 'request.json');
    fs.writeFileSync(inputFile, JSON.stringify(input));
    return { directory, input, inputFile };
  }
  const cli = path.join(__dirname, '../nora/client/cli.js');
  const execute = (args, env = process.env) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000, env });

  test('prepare prints candidates and leaves the request file unchanged', t => {
    const { input, inputFile } = setup(t);
    const result = execute(['prepare', inputFile, input.project_id]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.candidates.length, 1);
    assert.equal(output.candidates[0].critical_change, true);
    assert.deepEqual(JSON.parse(fs.readFileSync(inputFile, 'utf8')), input);
  });

  test('validate-review rejects the actual failed run with a nonzero exit and no success output', t => {
    const { input, inputFile } = setup(t);
    const result = execute(['validate-review', inputFile, input.project_id, path.join(__dirname, '../nora/flow/failed-run.json'), 'ains-sism-change-review-v1']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const error = JSON.parse(result.stderr).error;
    assert.equal(error.code, 'FLOW_RUN_NOT_SUCCEEDED');
    assert.equal(error.traceId, observedFailedFlow().run.traceId);
  });

  test('validate-review accepts the recorded OpenAI result', t => {
    const { input, inputFile } = setup(t);
    const result = execute(['validate-review', inputFile, input.project_id,
      path.join(__dirname, '../nora/flow/acceptance-runs/numeric-5-to-50.json'), 'ains-sism-change-review-openai-v1']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).review.changes[0].risk, 'high');
  });

  test('wrong project and missing response path fail with structured errors', t => {
    const { input, inputFile } = setup(t);
    const wrongProject = execute(['prepare', inputFile, 'wrong-project']);
    assert.equal(wrongProject.status, 1);
    assert.equal(JSON.parse(wrongProject.stderr).error.code, 'PROJECT_MISMATCH');
    const missingResponse = execute(['validate-review', inputFile, input.project_id]);
    assert.equal(missingResponse.status, 1);
    assert.equal(JSON.parse(missingResponse.stderr).error.code, 'USAGE');
  });

  test('review refuses a permissive secret file before network access', t => {
    const { directory, input, inputFile } = setup(t);
    const secretFile = path.join(directory, 'flow-secret.json');
    fs.writeFileSync(secretFile, JSON.stringify({ token: fakeToken }), { mode: 0o644 });
    fs.chmodSync(secretFile, 0o644);
    const result = execute(['review', inputFile, input.project_id], {
      ...process.env, NORA_FLOW_TOKEN: '', NORA_FLOW_SECRET_FILE: secretFile,
    });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'FLOW_SECRET_PERMISSIONS');
    assert.equal(result.stderr.includes(fakeToken), false);
  });

  test('review-documents validates project identity before loading tokens or sending requests', t => {
    const { inputFile } = setup(t);
    const result = execute(['review-documents', inputFile, 'unauthorized-project']);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'PROJECT_MISMATCH');
  });

  test('malformed private secret contents are never echoed in diagnostics', t => {
    const { directory, input, inputFile } = setup(t);
    const secretFile = path.join(directory, 'malformed-secret.json');
    fs.writeFileSync(secretFile, fakeToken, { mode: 0o600 });
    const result = execute(['review', inputFile, input.project_id], {
      ...process.env, NORA_FLOW_TOKEN: '', NORA_FLOW_SECRET_FILE: secretFile,
    });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, 'FLOW_SECRET_INVALID');
    assert.equal(result.stderr.includes(fakeToken), false);
  });
});

describe('published flow HTTP contract', () => {
  test('the actual published response validates with raw token and multipart fields', async () => {
    const input = request();
    const original = structuredClone(input);
    const observed = observedPublishedFlow();
    const observedOriginal = structuredClone(observed);
    let calls = 0;
    const result = await runPublishedChangeReview(input, { expectedProjectId: input.project_id, token: fakeToken,
      fetchImpl: async (url, options) => {
        calls++;
        assert.equal(url, FLOW_URL);
        assert.equal(options.method, 'POST');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, fakeToken);
        assert.equal(options.headers['Content-Type'], undefined);
        assert.ok(options.body instanceof FormData);
        assert.deepEqual([...options.body.keys()], ['input', 'variables']);
        assert.deepEqual(JSON.parse(options.body.get('input')), original);
        assert.deepEqual(JSON.parse(options.body.get('variables')), { review_request: original });
        return { ok: true, status: 200, json: async () => observed };
      } });
    assert.equal(calls, 1);
    assert.equal(result.traceId, observed.traceId);
    assert.equal(result.review.changes[0].risk, 'high');
    assert.deepEqual(input, original);
    assert.deepEqual(observed, observedOriginal);
    assert.equal(JSON.stringify(result).includes(fakeToken), false);
  });

  for (const [name, mutate, code] of [
    ['missing status', response => { delete response.status; }, 'FLOW_RUN_NOT_SUCCEEDED'],
    ['partial execution', response => { response.status = 'partial'; }, 'FLOW_RUN_NOT_SUCCEEDED'],
    ['success carrying an error', response => { response.error = 'provider failed'; }, 'FLOW_RUN_NOT_SUCCEEDED'],
    ['missing completion state', response => { delete response.rawStatus; }, 'FLOW_OUTPUTS_INCOMPLETE'],
    ['missing agent output', response => { response.outputs.pop(); }, 'FLOW_OUTPUTS_INCOMPLETE'],
    ['wrong agent order', response => { response.outputs.reverse(); }, 'FLOW_OUTPUTS_INCOMPLETE'],
    ['final agent contradicts output', response => {
      const final = JSON.parse(response.outputs.at(-1).text);
      final.warnings.push('different output');
      response.outputs.at(-1).text = JSON.stringify(final);
    }, 'FLOW_OUTPUT_MISMATCH'],
  ]) {
    test(`${name} is rejected despite HTTP success`, () => {
      const input = request();
      const response = observedPublishedFlow();
      mutate(response);
      assert.throws(() => validatePublishedFlowResponse(response, input, input.project_id), { code });
    });
  }

  test('final agent JSON property ordering is immaterial', () => {
    const input = request();
    const response = observedPublishedFlow();
    const final = JSON.parse(response.outputs.at(-1).text);
    response.outputs.at(-1).text = JSON.stringify(Object.fromEntries(Object.entries(final).reverse()));
    assert.equal(validatePublishedFlowResponse(response, input, input.project_id).traceId, response.traceId);
  });

  test('missing flow token is rejected before fetch', async () => {
    const input = request();
    let calls = 0;
    await rejectsCode(runPublishedChangeReview(input, { expectedProjectId: input.project_id, fetchImpl: async () => { calls++; } }), 'FLOW_AUTH_REQUIRED');
    assert.equal(calls, 0);
  });

  test('HTTP errors, non-JSON, and transport uncertainty are rejected without replay or credential disclosure', async () => {
    const input = request();
    for (const status of [401, 302, 500]) {
      await rejectsCode(runPublishedChangeReview(input, { expectedProjectId: input.project_id, token: fakeToken,
        fetchImpl: async () => ({ ok: false, status }) }), 'FLOW_HTTP_' + status);
    }
    await rejectsCode(runPublishedChangeReview(input, { expectedProjectId: input.project_id, token: fakeToken,
      fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }) }), 'FLOW_RESPONSE_INVALID');
    let calls = 0;
    await assert.rejects(runPublishedChangeReview(input, { expectedProjectId: input.project_id, token: fakeToken,
      fetchImpl: async () => { calls++; throw new Error('network ' + fakeToken); } }), error => {
      assert.equal(error.code, 'FLOW_TRANSPORT_UNKNOWN');
      assert.equal(error.message.includes(fakeToken), false);
      return true;
    });
    assert.equal(calls, 1);
  });
});

describe('two-document pipeline to published review integration', () => {
  // Adapt the recorded envelope only for this synthetic, already whitespace-
  // normalized fixture. This mock is not evidence of another live execution.
  function pipelineResponse(document) {
    const response = observedHttpResponse();
    response.runId = 'mock-' + document.revision_id;
    const normalized = structuredClone(document);
    normalized.segments.forEach(segment => { segment.normalized_text = segment.text; });
    normalized.normalization = { status: 'ready', warnings: [], segment_count: normalized.segments.length };
    response.report.final_output = JSON.stringify(normalized);
    return response;
  }

  test('validates both original documents before reviewing normalized copies in sequence', async () => {
    const input = request();
    const original = structuredClone(input);
    const calls = [];
    const result = await runDocumentReview(input, { expectedProjectId: input.project_id,
      pipelineToken: 'pipeline-test-token', flowToken: fakeToken, fetchImpl: async (url, init) => {
        calls.push(url);
        if (url === PIPELINE_URL) {
          const document = JSON.parse(init.body).input;
          assert.equal(init.headers.Authorization, 'Bearer pipeline-test-token');
          assert.deepEqual(document, calls.length === 1 ? original.baseline : original.current);
          return { ok: true, status: 200, json: async () => pipelineResponse(document) };
        }
        assert.equal(url, FLOW_URL);
        const normalized = JSON.parse(init.body.get('variables')).review_request;
        for (const side of ['baseline', 'current']) {
          assert.equal(normalized[side].normalization.status, 'ready');
          assert.equal(normalized[side].segments[0].text, original[side].segments[0].text);
          assert.deepEqual(normalized[side].source, original[side].source);
        }
        return { ok: true, status: 200, json: async () => observedPublishedFlow() };
      } });
    assert.deepEqual(calls, [PIPELINE_URL, PIPELINE_URL, FLOW_URL]);
    assert.deepEqual(result.pipelineRuns, { baseline: 'mock-rev-001', current: 'mock-rev-002' });
    assert.equal(result.review.changes[0].before.text, original.baseline.segments[0].text);
    assert.deepEqual(input, original);
  });

  for (const failureAt of [1, 2]) {
    test(`pipeline ${failureAt} record failure stops execution before any flow request`, async () => {
      const input = request();
      let calls = 0;
      await rejectsCode(runDocumentReview(input, { expectedProjectId: input.project_id,
        pipelineToken: fakeToken, flowToken: fakeToken, fetchImpl: async (url, init) => {
          assert.equal(url, PIPELINE_URL);
          calls++;
          const response = pipelineResponse(JSON.parse(init.body).input);
          if (calls === failureAt) response.report.stages[0].artifacts.failed = 1;
          return { ok: true, status: 200, json: async () => response };
        } }), 'PIPELINE_RECORD_FAILED');
      assert.equal(calls, failureAt);
    });
  }

  test('invalid cross-document identity and missing flow credentials cause no pipeline costs', async () => {
    const input = request();
    let calls = 0;
    const options = { expectedProjectId: input.project_id, pipelineToken: fakeToken, flowToken: fakeToken,
      fetchImpl: async () => { calls++; } };
    input.current.project_id = 'different-project';
    await rejectsCode(runDocumentReview(input, options), 'PROJECT_MISMATCH');
    await rejectsCode(runDocumentReview(request(), { ...options, flowToken: undefined }), 'FLOW_AUTH_REQUIRED');
    assert.equal(calls, 0);
  });
});
