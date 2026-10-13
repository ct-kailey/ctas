'use strict';
// Bootstrap preparation records only. Business decisions and baselines remain human actions.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const contract = require('../platform/server/record-contract');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'cases/rondo');
const sha = text => createHash('sha256').update(text).digest('hex');
// Default preserves the private, locally supplied case import. Tests inject an
// authored synthetic bundle instead of depending on customer records.
function loadBundle(caseDirectory = dir) {
  const bundleDir = path.resolve(caseDirectory);
  const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'archive-manifest.json'), 'utf8'));
  const ids = new Set();
  const records = manifest.records.map(item => {
    if (ids.has(item.history.external_id)) throw Error('Duplicate external_id');
    ids.add(item.history.external_id);
    if (!manifest.domains.some(d => d.key === item.domain_key)) throw Error('Unknown domain');
    if (!['note', 'conversation'].includes(item.record_kind)) throw Error('Preparation records cannot be decisions or specifications');
    const text = item.files.map(file => {
      const absolute = path.resolve(bundleDir, file);
      if (!absolute.startsWith(bundleDir + path.sep)) throw Error('Source outside case directory');
      return fs.readFileSync(absolute, 'utf8');
    }).join('\n\n');
    contract.editorText(text);
    const history = contract.history(item.history);
    if (history.decided_on !== null) throw Error('Preparation cannot have a decision date');
    return { ...item, history, text, sha256: sha(text) };
  });
  return { manifest, records };
}
function findRecord(documents, item, domainId) {
  const matches = documents.flatMap(doc => doc.revisions
    .filter(rev => rev.history?.external_id === item.history.external_id)
    .map(rev => ({ doc, rev })));
  if (matches.length > 1) throw Error(`Multiple revisions for ${item.key}; inspect before proceeding`);
  if (!matches.length) return null;
  const { doc, rev } = matches[0];
  if (doc.title !== item.title || doc.domain_id !== domainId || doc.record_kind !== item.record_kind ||
      rev.sha256 !== item.sha256 || !isDeepStrictEqual(rev.history, item.history)) {
    throw Error(`Existing record differs: ${item.key}. Use an explicit new revision, not bootstrap overwrite.`);
  }
  return { document_id: doc.id, revision_id: rev.id };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => !['--apply', '--verify'].includes(a)) || args.length > 1) throw Error('Use no arguments (dry run), --apply, or --verify');
  const { manifest, records } = loadBundle();
  if (!args.length) {
    console.log(JSON.stringify({ mode: 'validated_only', project: manifest.project_name, domains: manifest.domains.map(d => d.name), records: records.map(r => ({ key: r.key, kind: r.record_kind, bytes: Buffer.byteLength(r.text), sha256: r.sha256 })), approved_policies: 0, network_writes: 0 }, null, 2));
    return;
  }
  const apply = args[0] === '--apply';
  const stateDir = path.join(root, '.local');
  fs.mkdirSync(stateDir, { recursive: true });
  const lockPath = path.join(stateDir, 'rondo-case.lock');
  const lock = fs.openSync(lockPath, 'wx', 0o600);
  let cookie, csrf, base;
  const journalPath = path.join(stateDir, 'rondo-case-import.json');
  let journal;
  function saveJournal() { fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 }); }
  async function call(route, method = 'GET', body) {
    const res = await fetch(base + route, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { Origin: base, 'X-CSRF-Token': csrf || '', 'Content-Type': 'application/json' } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    if (!res.ok) throw Error(`${method} ${route}: HTTP ${res.status}`);
    return res.json();
  }
  async function write(key, route, body) {
    if (journal.pending[key]) throw Error(`Uncertain prior write ${key}. Reconcile the server result; no automatic resend.`);
    journal.pending[key] = { route, at: new Date().toISOString() }; saveJournal();
    const result = await call(route, 'POST', body);
    delete journal.pending[key]; saveJournal();
    return result;
  }
  function reconciled(key) { if (journal.pending[key]) { delete journal.pending[key]; saveJournal(); } }
  try {
    const access = JSON.parse(fs.readFileSync(path.join(stateDir, 'production-access.json'), 'utf8'));
    base = access.url.replace(/\/$/, '');
    if (base !== 'https://ains-workspace-production.up.railway.app') throw Error('Unexpected credential destination');
    journal = fs.existsSync(journalPath) ? JSON.parse(fs.readFileSync(journalPath, 'utf8')) : { base, pending: {}, project_id: null };
    if (journal.base !== base) throw Error('Journal destination differs');
    const login = await call('/api/auth/login', 'POST', { email: access.email, password: access.password });
    csrf = login.csrfToken;
    const projects = (await call('/api/projects')).projects.filter(p => p.name === manifest.project_name);
    if (projects.length > 1) throw Error('Multiple Rondo projects; choose explicitly before importing');
    let project = projects[0];
    if (!project) {
      if (!apply) throw Error('Rondo project has not been registered');
      project = (await write('project', '/api/projects', { name: manifest.project_name })).project;
    } else reconciled('project');
    if (journal.project_id && journal.project_id !== project.id) throw Error('Project identity changed');
    journal.project_id = project.id; saveJournal();
    const prefix = '/api/projects/' + encodeURIComponent(project.id);
    const domains = (await call(prefix + '/domains')).domains;
    const domainMap = {};
    for (const d of manifest.domains) {
      let found = domains.find(x => x.name === d.name);
      if (!found) {
        if (!apply) throw Error(`Missing domain: ${d.name}`);
        found = (await write('domain:' + d.key, prefix + '/domains', { name: d.name, description: d.description })).domain;
      } else reconciled('domain:' + d.key);
      domainMap[d.key] = found.id;
    }
    let documents = (await call(prefix + '/documents')).documents;
    const report = { verified_at: new Date().toISOString(), url: base, project_id: project.id, project_name: project.name, nora_workspace_id: manifest.nora_workspace_id, domains: domainMap, records: [], all_ready: false, preparation_baselines: 0, automatic_policy_approval: false };
    for (const item of records) {
      const domainId = domainMap[item.domain_key];
      let result = findRecord(documents, item, domainId);
      if (!result) {
        if (!apply) throw Error(`Missing record: ${item.key}`);
        result = await write('record:' + item.key, prefix + '/records', { title: item.title, text: item.text, record_kind: item.record_kind, domain_id: domainId, history: item.history });
        documents = (await call(prefix + '/documents')).documents;
      } else reconciled('record:' + item.key);
      const { revision } = await call(prefix + '/revisions/' + result.revision_id);
      if (revision.source_text !== item.text || revision.sha256 !== item.sha256 || !isDeepStrictEqual(revision.history, item.history)) throw Error('Source readback mismatch: ' + item.key);
      const doc = documents.find(d => d.id === result.document_id);
      if (doc.baseline_revision_id) report.preparation_baselines++;
      report.records.push({ key: item.key, title: item.title, record_kind: item.record_kind, external_id: item.history.external_id, document_id: result.document_id, revision_id: result.revision_id, status: revision.status, error_code: revision.error_code, sha256: revision.sha256, source_and_history_verified: true });
      report.all_ready = report.records.length === records.length && report.records.every(r => r.status === 'ready');
      fs.writeFileSync(path.join(dir, 'registration.json'), JSON.stringify(report, null, 2) + '\n');
      console.log(`${item.key}: ${revision.status} (source and history verified)`);
    }
    console.log(JSON.stringify({ project_id: project.id, count: report.records.length, all_ready: report.all_ready, preparation_baselines: report.preparation_baselines }));
  } finally {
    if (cookie && csrf) await call('/api/auth/logout', 'POST', {}).catch(() => {});
    fs.closeSync(lock); fs.unlinkSync(lockPath);
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { loadBundle, findRecord };
