'use strict';

// Explicit operator command after real publication. Synthetic inputs only;
// never save credentials or the full transport response in the report.
const fs = require('node:fs');
const path = require('node:path');
const { runRegistrationSuggestion } = require('../client/registration-client');
const manifest = require('./manifest.json');
const cases = require('./acceptance-cases.json').cases;

async function main() {
  if (process.env.REGISTRATION_ALLOW_LIVE_NORA !== '1') throw Object.assign(new Error('Set REGISTRATION_ALLOW_LIVE_NORA=1 to run synthetic live acceptance cases'), {code:'LIVE_RUN_NOT_ENABLED'});
  if (manifest.publication_status !== 'published') throw Object.assign(new Error('Publish and verify the actual Nora definition first'), {code:'REGISTRATION_NOT_PUBLISHED'});
  const secretPath = path.resolve(__dirname, '../.secrets/registration-secret.json');
  const fd = fs.openSync(secretPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let token;
  try {
    const stats = fs.fstatSync(fd);
    if (!stats.isFile() || (stats.mode & 0o077) !== 0) throw Object.assign(new Error('Registration credential file must be private'), {code:'REGISTRATION_SECRET_PERMISSIONS'});
    token = JSON.parse(fs.readFileSync(fd, 'utf8')).token;
  } finally { fs.closeSync(fd); }
  const results = [];
  for (const item of cases) {
    try {
      const result = await runRegistrationSuggestion(item.request, { expectedProjectId:item.request.project_id, token });
      const mismatch = Object.entries(item.expected).find(([key,value]) => key === 'max_confidence' ? result.suggestion.confidence > value : result.suggestion[key] !== value);
      results.push({id:item.id,passed:!mismatch,trace_id:result.traceId,suggestion:result.suggestion,...(mismatch ? {error_code:'EXPECTED_ROUTING_MISMATCH',field:mismatch[0]} : {})});
    } catch (error) {
      results.push({id:item.id,passed:false,error_code:error.code || 'CLIENT_ERROR',...(error.traceId ? {trace_id:error.traceId} : {})});
      break; // A failed/uncertain remote execution is never automatically replayed.
    }
  }
  const report = {schema_version:'1.0',synthetic:true,verified_at:new Date().toISOString(),workspace_id:manifest.workspace_id,slug:manifest.slug,
    publication_version:manifest.publication_version,published_version_id:manifest.published_version_id,
    expected_cases:cases.length,completed_cases:results.length,passed:results.filter(result=>result.passed).length,
    trace_tool_inspection_required:true,results};
  fs.writeFileSync(path.join(__dirname,'acceptance-results.json'),JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({completed:report.completed_cases,passed:report.passed,total:report.expected_cases,report:'nora/registration/acceptance-results.json'})+'\n');
  if (report.passed !== cases.length) process.exitCode=1;
}
main().catch(error=>{process.stderr.write(JSON.stringify({error_code:error.code || 'REGISTRATION_ACCEPTANCE_FAILED'})+'\n');process.exitCode=1;});
