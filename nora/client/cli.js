#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { runDocumentPipeline, runPublishedChangeReview, runDocumentReview, checkRequest, validateFlowResponse } = require('./nora-client');
const { prepareReview } = require('../flow/review-core');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function privateToken(kind) {
  const prefix = 'NORA_' + kind.toUpperCase();
  if (process.env[prefix + '_TOKEN']) return process.env[prefix + '_TOKEN'];
  const file = process.env[prefix + '_SECRET_FILE'] || path.join(__dirname, '../.secrets/' + kind + '-secret.json');
  if (!fs.existsSync(file)) return undefined;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) {
      throw Object.assign(new Error('Secret file must be a regular file with permissions 0600'), { code: kind.toUpperCase() + '_SECRET_PERMISSIONS' });
    }
    try { return JSON.parse(fs.readFileSync(fd, 'utf8')).token; }
    catch {
      // JSON parse diagnostics can quote the secret payload. Keep them private.
      throw Object.assign(new Error('Secret file must contain a JSON object with a token'), { code: kind.toUpperCase() + '_SECRET_INVALID' });
    }
  } finally { fs.closeSync(fd); }
}

async function main() {
  const [command, inputPath, projectId, responsePath, expectedFlowSlug] = process.argv.slice(2);
  if (!command || !inputPath || !projectId) throw Object.assign(new Error('Usage: node nora/client/cli.js pipeline|review|review-documents|prepare|validate-review input.json trusted-project-id [mcp-run-response.json [expected-flow-slug]]'), {code:'USAGE'});
  const input = read(inputPath);
  let result;
  if (command === 'pipeline') {
    result = await runDocumentPipeline(input, { expectedProjectId: projectId, token: privateToken('pipeline') });
  } else if (command === 'review') {
    checkRequest(input, projectId);
    result = await runPublishedChangeReview(input, { expectedProjectId: projectId, token: privateToken('flow') });
  } else if (command === 'review-documents') {
    checkRequest(input, projectId);
    result = await runDocumentReview(input, { expectedProjectId: projectId,
      pipelineToken: privateToken('pipeline'), flowToken: privateToken('flow') });
  } else if (command === 'prepare') {
    checkRequest(input, projectId); result = prepareReview(input);
  } else if (command === 'validate-review') {
    if (!responsePath) throw Object.assign(new Error('mcp-run-response.json is required'), {code:'USAGE'});
    result = validateFlowResponse(read(responsePath), input, projectId, { expectedFlowSlug });
  } else throw Object.assign(new Error('Unknown command'), {code:'USAGE'});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(JSON.stringify({error:{code:error.code || 'CLIENT_ERROR', message:error.message, traceId:error.traceId}}) + '\n'); process.exitCode = 1; });
