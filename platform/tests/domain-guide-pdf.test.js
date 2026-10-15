'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { renderDomainGuidePdf, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } = require('../server/domain-guide-pdf');
const run = promisify(execFile), python = process.env.PYTHON_BIN || 'python3';

function fixture({ long = false, published = false } = {}) {
  const sources = [{ id: 'private-source-uuid', title: '업무 요청 관리 기획 v2', body: '원문 전체 비공개 센티널', authority: 'confirmed', domain_name: '업무 요청 관리', occurred_at: '2026-10-14T03:00:00.000Z', source_url: 'https://private.invalid?token=secret-do-not-print' }, { id: 'private-source-uuid-2', title: '고객 변경 요청 회의록', authority: 'reference', occurred_at: '2026-10-15T01:00:00.000Z' }];
  const refs = [sources[0].id], nodeCount = long ? 12 : 5;
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: 'step-' + i, label: i === 0 ? '요청 내용을 등록합니다' : i === nodeCount - 1 ? '최종 승인된 결과 리포트를 제공합니다' : i === 2 ? '담당자가 요청을 승인했나요?' : i === 3 ? '<기호 그대로> & 첨부 자료와 범위를 확인합니다' : `업무 단계 ${i + 1}: 요청, 검토 결과, 담당자, 완료 조건과 고객 답변을 확인합니다`, kind: i === 0 ? 'start' : i === nodeCount - 1 ? 'end' : i === 2 ? 'decision' : 'process', evidence_ids: refs }));
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id, label: i === 2 ? 'Yes' : '' }));
  edges.push({ from: nodes[2].id, to: nodes[0].id, label: 'No' });
  const guide = { schema_version: '1.0', project_id: 'private-project-id', title: '씨젠 Semi-auto 도메인 가이드', summary: '요청 등록부터 승인, 진행 상태, 결과 리포트까지의 업무 맥락과 정책을 정리합니다. 확정된 기준은 PDF이며 Excel 추가 요청은 검토 중입니다.', summary_evidence_ids: refs,
    sections: [{ id: 'private-section-id', title: '요청과 승인 정책', body: Array.from({ length: long ? 38 : 2 }, (_, i) => `정책 설명 ${i + 1}: 승인 전에는 작업을 실행하지 않습니다. 요청의 근거와 고객 답변을 확인하고, 변경되는 범위와 일정은 담당자가 최종 검토합니다.`).join('\n'), status: 'confirmed', evidence_ids: refs }, { id: 's2', title: '추가 확인할 요청', body: 'Excel 양식으로 결과를 내려받는 기능은 아직 확정되지 않았습니다. <img src="https://example.invalid/tracker"/>는 문서 내용 그대로 표시합니다.', status: 'needs_confirmation', evidence_ids: [sources[1].id] }],
    glossary: Array.from({ length: long ? 20 : 3 }, (_, i) => ({ term: `업무 용어 ${i + 1}`, definition: '업무 범위, 승인 기준, 결과물을 이해할 때 사용하는 용어입니다. '.repeat(long ? 7 : 1), evidence_ids: refs })),
    workflows: [{ title: '요청 등록과 승인 흐름', nodes, edges, evidence_ids: refs }], changes: [{ summary: 'PDF 결과 리포트에 XLSX 내보내기 추가가 요청되었습니다. 범위와 비용은 검토 중입니다.', evidence_ids: [sources[1].id] }], questions: [{ question: 'XLSX 양식과 필수 출력 항목은 확정되었나요?', reason: '양식이 확정되어야 작업 범위와 검증 기준을 결정할 수 있습니다.', evidence_ids: [sources[1].id] }] };
  return { project: { name: '씨젠 Semi-auto', goal: '고객 업무의 자동화' }, version: { id: 'private-version-id', version_number: 3, status: published ? 'published' : 'draft', guide, snapshot: { sources }, created_at: '2026-10-15T02:00:00.000Z', published_at: published ? '2026-10-15T03:00:00.000Z' : null } };
}

test('domain guide PDF rejects malformed graphs, unknown evidence and excessive input before rendering', async () => {
  const options = { execFileImpl: async () => assert.fail('must not invoke Python') };
  const graph = fixture(); graph.version.guide.workflows[0].edges[0].to = 'missing';
  await assert.rejects(renderDomainGuidePdf(graph, options), { code: 'DOMAIN_GUIDE_PDF_INPUT_INVALID' });
  const evidence = fixture(); evidence.version.guide.summary_evidence_ids = ['missing'];
  await assert.rejects(renderDomainGuidePdf(evidence, options), { code: 'DOMAIN_GUIDE_PDF_INPUT_INVALID' });
  const tooMany = fixture(); tooMany.version.guide.workflows[0].nodes = Array(13).fill(tooMany.version.guide.workflows[0].nodes[0]);
  await assert.rejects(renderDomainGuidePdf(tooMany, options), { code: 'DOMAIN_GUIDE_PDF_INPUT_LIMIT' });
  const large = fixture(); large.version.guide.summary = 'x'.repeat(MAX_INPUT_BYTES);
  await assert.rejects(renderDomainGuidePdf(large, options), { code: 'DOMAIN_GUIDE_PDF_INPUT_LIMIT' });
});

test('renderer receives private fixed paths and a projected snapshot without source bodies or URLs', async () => {
  let folder;
  const value = fixture(); value.version.guide.title = '../$(do-not-run)';
  const buffer = await renderDomainGuidePdf(value, { python: '/trusted/python', execFileImpl: async (binary, args, options) => {
    assert.equal(binary, '/trusted/python'); assert.equal(args.length, 3); assert.equal(options.shell, undefined);
    assert.ok(options.timeout <= 60000); assert.equal(options.killSignal, 'SIGKILL');
    folder = path.dirname(args[1]); assert.equal((await fs.stat(folder)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(args[1])).mode & 0o777, 0o600);
    const input = await fs.readFile(args[1], 'utf8');
    assert.doesNotMatch(input, /원문 전체 비공개 센티널|secret-do-not-print|private-version-id/);
    await fs.writeFile(args[2], '%PDF-1.7\n' + 'x'.repeat(120) + '\n%%EOF');
  } });
  assert.ok(Buffer.isBuffer(buffer)); await assert.rejects(fs.stat(folder), { code: 'ENOENT' });
});

test('PDF process failures are sanitized and the private input is removed', async () => {
  let folder;
  await assert.rejects(renderDomainGuidePdf(fixture(), { execFileImpl: async (_, args) => {
    folder = path.dirname(args[1]); throw Object.assign(new Error('sensitive content'), { stderr: 'sensitive content' });
  } }), error => error.code === 'DOMAIN_GUIDE_PDF_FAILED' && !error.message.includes('sensitive'));
  await assert.rejects(fs.stat(folder), { code: 'ENOENT' });
  await assert.rejects(renderDomainGuidePdf(fixture(), { execFileImpl: async () => { throw { killed: true }; } }), { code: 'DOMAIN_GUIDE_PDF_TIMEOUT' });
  await assert.rejects(renderDomainGuidePdf(fixture(), { execFileImpl: async () => { throw { stderr: '{"code":"KOREAN_FONT_MISSING"}' }; } }), { code: 'DOMAIN_GUIDE_PDF_UNAVAILABLE' });
});

test('unsafe or oversized renderer output is rejected', async () => {
  await assert.rejects(renderDomainGuidePdf(fixture(), { execFileImpl: async (_, args) => fs.symlink(args[1], args[2]) }), { code: 'DOMAIN_GUIDE_PDF_OUTPUT_INVALID' });
  await assert.rejects(renderDomainGuidePdf(fixture(), { execFileImpl: async (_, args) => fs.writeFile(args[2], '%PDF-1.7\n' + 'x'.repeat(120)) }), { code: 'DOMAIN_GUIDE_PDF_OUTPUT_INVALID' });
  await assert.rejects(renderDomainGuidePdf(fixture(), { execFileImpl: async (_, args) => { const file = await fs.open(args[2], 'w'); await file.truncate(MAX_OUTPUT_BYTES + 1); await file.close(); } }), { code: 'DOMAIN_GUIDE_PDF_OUTPUT_LIMIT' });
});

test('real Korean draft PDF paginates sections, glossary and branched flow without losing final content', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-guide-pdf-test-'));
  try {
    const buffer = await renderDomainGuidePdf(fixture({ long: true }), { python });
    const output = path.join(directory, 'guide.pdf'); await fs.writeFile(output, buffer);
    const { stdout } = await run(python, ['-c', 'import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({"pages":len(r.pages),"text":"\\n".join(p.extract_text() for p in r.pages)},ensure_ascii=False))', output]);
    const result = JSON.parse(stdout);
    assert.ok(result.pages >= 5); assert.ok(result.pages < 20);
    for (const value of ['정책 설명 38', '업무 용어 20', '최종 승인된 결과 리포트', 'No', 'XLSX', '<기호 그대로>', '<img src=', 'DRAFT', '업무 요청 관리 기획 v2', '[1]', 'v3']) assert.ok(result.text.replace(/\s+/g, ' ').includes(value), value);
    assert.doesNotMatch(result.text, /private-source-uuid|private-project-id|private-version-id|secret-do-not-print|원문 전체 비공개 센티널/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('legacy published PDF identifies its reviewed status without a draft marker', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-guide-pdf-test-'));
  try {
    const output = path.join(directory, 'guide.pdf'); await fs.writeFile(output, await renderDomainGuidePdf(fixture({ published: true }), { python }));
    const { stdout } = await run(python, ['-c', 'import sys; from pypdf import PdfReader; print("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', output]);
    assert.match(stdout, /APPROVED/); assert.match(stdout, /검토 승인본/); assert.doesNotMatch(stdout, /DRAFT/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('canonical approved v2 PDF uses number and reviewed_at and visibly flags stale evidence', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-guide-pdf-test-'));
  try {
    const data = fixture();
    data.version = { ...data.version, number: 2, status: 'approved', reviewed_at: '2026-10-15T04:15:00.000Z', stale: true };
    // Canonical fields take precedence over legacy values if both are present.
    data.version.version_number = 99; data.version.published_at = '2025-01-01T00:00:00.000Z';
    const output = path.join(directory, 'guide.pdf'); await fs.writeFile(output, await renderDomainGuidePdf(data, { python }));
    const { stdout } = await run(python, ['-c', 'import sys; from pypdf import PdfReader; print("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', output]);
    assert.match(stdout, /v2/); assert.match(stdout, /APPROVED/); assert.match(stdout, /검토 승인본/);
    assert.match(stdout, /2026\.10\.15 13:15/); assert.match(stdout, /근거 최신성 재확인 필요/); assert.match(stdout, /근거 재확인/);
    assert.doesNotMatch(stdout, /v1\b|v99|DRAFT|2025\.01\.01/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('canonical draft version number is preserved without being presented as approved', async () => {
  let captured;
  const data = fixture(); delete data.version.version_number; delete data.version.published_at;
  Object.assign(data.version, { number: 4, status: 'draft', reviewed_at: null, stale: false });
  await renderDomainGuidePdf(data, { execFileImpl: async (_, args) => {
    captured = JSON.parse(await fs.readFile(args[1], 'utf8'));
    await fs.writeFile(args[2], '%PDF-1.7\n' + 'x'.repeat(120) + '\n%%EOF');
  } });
  assert.equal(captured.version.number, 4); assert.equal(captured.version.status, 'draft');
  assert.equal(captured.version.reviewed_at, null); assert.equal(captured.version.stale, false);
});

test('known inline source IDs become numbered evidence in PDF text without mutating the saved guide', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-guide-pdf-test-'));
  try {
    const data = fixture(), originalId = data.version.snapshot.sources[0].id, sourceId = 'record:smoke-policy';
    // Replace the source identity and all references, then insert the common
    // Nora inline citation form into several display fields.
    const version = JSON.parse(JSON.stringify(data.version).replaceAll(originalId, sourceId));
    data.version = version;
    version.guide.summary += ` [${sourceId}]`;
    version.guide.sections[0].body += `\n정책 원문 근거: [${sourceId}]`;
    version.guide.questions[0].reason += ` 기준 정책 ${sourceId} 확인 필요.`;
    version.guide.workflows[0].nodes[0].label += ` [${sourceId}]`;
    const original = JSON.stringify(data);
    const output = path.join(directory, 'guide.pdf'); await fs.writeFile(output, await renderDomainGuidePdf(data, { python }));
    const { stdout } = await run(python, ['-c', 'import sys; from pypdf import PdfReader; print("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))', output]);
    assert.match(stdout, /근거 1/); assert.match(stdout, /정책 원문 근거/);
    assert.doesNotMatch(stdout, /record:smoke-policy|private-source-uuid/);
    assert.equal(JSON.stringify(data), original, 'snapshot and saved guide must remain unchanged');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

module.exports = { fixture };
