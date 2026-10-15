'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runFile = promisify(execFile);
const SCRIPT = path.resolve(__dirname, '../../scripts/render-domain-guide.py');
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MESSAGES = {
  DOMAIN_GUIDE_PDF_INPUT_INVALID: '도메인 가이드의 문서 구조를 확인해 주세요.',
  DOMAIN_GUIDE_PDF_INPUT_LIMIT: '도메인 가이드의 내용이 PDF 생성 한도를 초과했습니다.',
  DOMAIN_GUIDE_PDF_UNAVAILABLE: 'PDF 생성 도구 또는 한글 글꼴이 준비되지 않았습니다.',
  DOMAIN_GUIDE_PDF_TIMEOUT: 'PDF 생성 시간이 초과되었습니다. 다시 시도해 주세요.',
  DOMAIN_GUIDE_PDF_FAILED: '도메인 가이드 PDF를 생성하지 못했습니다.',
  DOMAIN_GUIDE_PDF_OUTPUT_INVALID: '생성된 PDF 형식을 확인하지 못했습니다.',
  DOMAIN_GUIDE_PDF_OUTPUT_LIMIT: '생성된 PDF가 다운로드 한도를 초과했습니다.',
};
function fail(code) {
  throw Object.assign(new Error(MESSAGES[code]), { code, status: code.endsWith('_LIMIT') ? 413 : code.endsWith('_INPUT_INVALID') ? 400 : ['DOMAIN_GUIDE_PDF_UNAVAILABLE', 'DOMAIN_GUIDE_PDF_TIMEOUT'].includes(code) ? 503 : 500 });
}
function inputJson({ version, project } = {}) {
  if (!version || typeof version !== 'object' || !version.guide || !Array.isArray(version.snapshot?.sources || version.sources)) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  const guide = version.guide, sources = version.snapshot?.sources || version.sources;
  if (typeof guide.title !== 'string' || !guide.title.trim() || typeof guide.summary !== 'string') fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  const string = v => typeof v === 'string';
  const refs = v => Array.isArray(v) && v.length <= 100 && v.every(string);
  for (const [key, limit] of Object.entries({ sections: 10, glossary: 20, workflows: 4, changes: 30, questions: 30 })) {
    if (!Array.isArray(guide[key])) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
    if (guide[key].length > limit) fail('DOMAIN_GUIDE_PDF_INPUT_LIMIT');
  }
  if (sources.length > 200) fail('DOMAIN_GUIDE_PDF_INPUT_LIMIT');
  if (!refs(guide.summary_evidence_ids) || !sources.every(s => s && string(s.id) && string(s.title))) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  const sourceIds = new Set(sources.map(s => s.id));
  const knownRefs = ids => refs(ids) && ids.every(sourceId => sourceIds.has(sourceId));
  if (!knownRefs(guide.summary_evidence_ids)) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  for (const section of guide.sections) if (!section || !string(section.title) || !string(section.body) || !['confirmed', 'reference', 'needs_confirmation'].includes(section.status) || !knownRefs(section.evidence_ids)) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  for (const term of guide.glossary) if (!term || !string(term.term) || !string(term.definition) || !knownRefs(term.evidence_ids)) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  for (const change of guide.changes) if (!change || !string(change.summary) || !knownRefs(change.evidence_ids)) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  for (const question of guide.questions) if (!question || !string(question.question) || !string(question.reason) || !knownRefs(question.evidence_ids)) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  for (const flow of guide.workflows) {
    if (!flow || !string(flow.title) || !Array.isArray(flow.nodes) || !flow.nodes.length || !Array.isArray(flow.edges) || !knownRefs(flow.evidence_ids)) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
    if (flow.nodes.length > 12 || flow.edges.length > 18) fail('DOMAIN_GUIDE_PDF_INPUT_LIMIT');
    if (!flow.nodes.every(n => n && string(n.id) && string(n.label) && ['start', 'process', 'decision', 'end'].includes(n.kind) && knownRefs(n.evidence_ids))) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
    const nodeIds = new Set(flow.nodes.map(n => n.id));
    if (nodeIds.size !== flow.nodes.length || !flow.edges.every(e => e && nodeIds.has(e.from) && nodeIds.has(e.to) && string(e.label))) fail('DOMAIN_GUIDE_PDF_INPUT_INVALID');
  }
  // Keep only fields required to render. Source bodies, IDs, private URLs and traces
  // never become PDF content, and no user value is used as a filesystem path.
  // LLMs sometimes include a citation ID in their plain-text prose as well as in
  // evidence_ids. Replace only known IDs in display text, leaving the immutable
  // guide and its graph/evidence identifiers intact for provenance validation.
  const labels = new Map(sources.map((s, index) => [s.id, `근거 ${index + 1}`]));
  const inlineIds = [...labels.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  const inlinePattern = inlineIds.length ? new RegExp(inlineIds.map(sourceId => sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const displayText = value => typeof value === 'string' && inlinePattern ? value.replace(inlinePattern, matched => labels.get(matched)) : value;
  const displayGuide = { ...guide, title: displayText(guide.title), summary: displayText(guide.summary),
    sections: guide.sections.map(s => ({ ...s, title: displayText(s.title), body: displayText(s.body) })),
    glossary: guide.glossary.map(s => ({ ...s, term: displayText(s.term), definition: displayText(s.definition) })),
    workflows: guide.workflows.map(flow => ({ ...flow, title: displayText(flow.title), nodes: flow.nodes.map(node => ({ ...node, label: displayText(node.label) })), edges: flow.edges.map(edge => ({ ...edge, label: displayText(edge.label) })) })),
    changes: guide.changes.map(s => ({ ...s, summary: displayText(s.summary) })),
    questions: guide.questions.map(s => ({ ...s, question: displayText(s.question), reason: displayText(s.reason) })),
  };
  const safeVersion = { number: version.number ?? version.version_number, status: version.status, created_at: version.created_at,
    reviewed_at: Object.hasOwn(version, 'reviewed_at') ? version.reviewed_at : version.published_at, stale: version.stale === true, guide: displayGuide,
    snapshot: { sources: sources.map(s => ({ id: s.id, kind: s.kind, title: displayText(s.title), authority: s.authority, domain_name: displayText(s.domain_name), occurred_at: s.occurred_at })) } };
  const sourceProject = project || version.snapshot?.project || {};
  let json;
  try { json = JSON.stringify({ version: safeVersion, project: { name: displayText(sourceProject.name || ''), goal: displayText(sourceProject.goal || '') } }); } catch { fail('DOMAIN_GUIDE_PDF_INPUT_INVALID'); }
  if (Buffer.byteLength(json) > MAX_INPUT_BYTES) fail('DOMAIN_GUIDE_PDF_INPUT_LIMIT');
  return json;
}

async function renderDomainGuidePdf(data, { python = process.env.PYTHON_BIN || 'python3', timeoutMs = 60000, execFileImpl = runFile } = {}) {
  const json = inputJson(data), temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-domain-guide-'));
  try {
    await fs.chmod(temporary, 0o700);
    const input = path.join(temporary, 'input.json'), output = path.join(temporary, 'guide.pdf');
    await fs.writeFile(input, json, { flag: 'wx', mode: 0o600 });
    try {
      await execFileImpl(python, [SCRIPT, input, output], { timeout: Math.min(60000, Math.max(100, Number(timeoutMs) || 60000)), maxBuffer: 128 * 1024, killSignal: 'SIGKILL', windowsHide: true });
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT') fail('DOMAIN_GUIDE_PDF_TIMEOUT');
      if (error.code === 'ENOENT' || /DEPENDENCY_MISSING|KOREAN_FONT_MISSING/.test(String(error.stderr || ''))) fail('DOMAIN_GUIDE_PDF_UNAVAILABLE');
      fail('DOMAIN_GUIDE_PDF_FAILED');
    }
    let handle;
    try {
      handle = await fs.open(output, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 100) fail('DOMAIN_GUIDE_PDF_OUTPUT_INVALID');
      if (stat.size > MAX_OUTPUT_BYTES) fail('DOMAIN_GUIDE_PDF_OUTPUT_LIMIT');
      const buffer = await handle.readFile();
      if (buffer.length > MAX_OUTPUT_BYTES) fail('DOMAIN_GUIDE_PDF_OUTPUT_LIMIT');
      if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) || !buffer.subarray(-1024).includes(Buffer.from('%%EOF'))) fail('DOMAIN_GUIDE_PDF_OUTPUT_INVALID');
      return buffer;
    } catch (error) {
      if (MESSAGES[error.code]) throw error;
      fail('DOMAIN_GUIDE_PDF_OUTPUT_INVALID');
    } finally { await handle?.close(); }
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
module.exports = { renderDomainGuidePdf, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES };
