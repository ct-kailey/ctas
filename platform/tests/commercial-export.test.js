'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { exportCommercial, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } = require('../server/commercial-export');
const run = promisify(execFile);
const python = process.env.PYTHON_BIN || 'python3';

function fixture() {
  return { title: '프로젝트 요구사항 검토', kind: 'requirements',
    template: { company_name: '테스트 기업', name: '업무 표준', footer: '담당자 검토 필요', is_sample: true },
    project: { name: '신규 업무 시스템' }, revision_label: 'v3', approved: false,
    content: { sections: [{ id: 's1', title: '구현 범위', body: '검토한 요구사항을 기능 단위로 관리합니다.\n<문자 그대로> & URL https://example.invalid 만 보존합니다.' }],
      tables: [{ id: 't1', title: '기능 목록', columns: ['번호', '기능', '완료 기준'], rows: [['1', '담당자 배정', '담당자가 현재 작업과 변경 사유를 확인할 수 있다.']] }] } };
}

test('export format, schema and bounded content are validated before Python starts', async () => {
  const options = { execFileImpl: async () => assert.fail('Python must not run') };
  await assert.rejects(exportCommercial(fixture(), { ...options, format: '../pdf' }), { code: 'COMMERCIAL_EXPORT_FORMAT_INVALID' });
  await assert.rejects(exportCommercial({ ...fixture(), content: {} }, options), { code: 'COMMERCIAL_EXPORT_INPUT_INVALID' });
  const invalid = fixture(); invalid.content.tables[0].rows.push(['one column']);
  await assert.rejects(exportCommercial(invalid, options), { code: 'COMMERCIAL_EXPORT_INPUT_INVALID' });
  const huge = fixture(); huge.content.sections[0].body = 'x'.repeat(MAX_INPUT_BYTES);
  await assert.rejects(exportCommercial(huge, options), { code: 'COMMERCIAL_EXPORT_INPUT_LIMIT' });
});

test('export uses private paths, executable arguments and cleanup, independent of document title', async () => {
  let temporary;
  const data = fixture(); data.title = '../a\n$(do-not-run)';
  const result = await exportCommercial(data, { format: 'pdf', python: '/trusted/python', execFileImpl: async (binary, args, options) => {
    assert.equal(binary, '/trusted/python');
    assert.equal(args.length, 4);
    assert.equal(args[3], 'pdf');
    assert.equal(options.shell, undefined);
    assert.ok(options.timeout <= 60000);
    temporary = path.dirname(args[1]);
    assert.equal((await fs.stat(temporary)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(args[1])).mode & 0o777, 0o600);
    assert.equal(path.basename(args[1]), 'input.json');
    assert.equal(JSON.parse(await fs.readFile(args[1], 'utf8')).title, data.title);
    await fs.writeFile(args[2], '%PDF-1.7\nmock');
  } });
  assert.equal(result.mime, 'application/pdf');
  assert.ok(!/[\r\n/\\]/.test(result.filename));
  await assert.rejects(fs.stat(temporary), { code: 'ENOENT' });
});

test('process errors, missing dependencies and timeout expose safe errors and clean up input', async () => {
  let temporary;
  await assert.rejects(exportCommercial(fixture(), { execFileImpl: async (_, args) => {
    temporary = path.dirname(args[1]);
    throw Object.assign(new Error('private content'), { stderr: 'private content' });
  } }), (error) => error.code === 'COMMERCIAL_EXPORT_FAILED' && !error.message.includes('private'));
  await assert.rejects(fs.stat(temporary), { code: 'ENOENT' });
  await assert.rejects(exportCommercial(fixture(), { execFileImpl: async () => { throw { killed: true }; } }), { code: 'COMMERCIAL_EXPORT_TIMEOUT' });
  await assert.rejects(exportCommercial(fixture(), { execFileImpl: async () => { throw { stderr: '{"code": "DEPENDENCY_MISSING"}' }; } }), { code: 'COMMERCIAL_EXPORT_UNAVAILABLE' });
});

test('missing, excessive and mismatched output are rejected', async () => {
  await assert.rejects(exportCommercial(fixture(), { execFileImpl: async () => {} }), { code: 'COMMERCIAL_EXPORT_OUTPUT_INVALID' });
  await assert.rejects(exportCommercial(fixture(), { execFileImpl: async (_, args) => fs.writeFile(args[2], '%PDF-1.7') }), { code: 'COMMERCIAL_EXPORT_OUTPUT_INVALID' });
  await assert.rejects(exportCommercial(fixture(), { execFileImpl: async (_, args) => {
    const handle = await fs.open(args[2], 'w');
    await handle.truncate(MAX_OUTPUT_BYTES + 1); await handle.close();
  } }), { code: 'COMMERCIAL_EXPORT_OUTPUT_LIMIT' });
});

test('symlink output cannot read an unrelated file', async () => {
  await assert.rejects(exportCommercial(fixture(), { format: 'pdf', execFileImpl: async (_, args) => {
    await fs.symlink(args[1], args[2]);
  } }), { code: 'COMMERCIAL_EXPORT_OUTPUT_INVALID' });
});

test('real Korean DOCX preserves sections, table values, revision and draft/sample markers', async () => {
  const result = await exportCommercial(fixture(), { format: 'docx', python });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-export-test-'));
  try {
    const output = path.join(directory, 'result.docx'); await fs.writeFile(output, result.buffer);
    const { stdout } = await run(python, ['-c', 'import json,sys; from docx import Document; d=Document(sys.argv[1]); print(json.dumps({"body":[p.text for p in d.paragraphs],"header":d.sections[0].header.paragraphs[0].text,"footer":d.sections[0].footer.paragraphs[0].text,"rows":[[c.text for c in r.cells] for r in d.tables[0].rows]},ensure_ascii=False))', output]);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.body.includes(fixture().content.sections[0].body.split('\n')[1]));
    assert.match(parsed.header, /검토 전 초안.*샘플 양식/);
    assert.match(parsed.footer, /v3/);
    assert.deepEqual(parsed.rows[1], fixture().content.tables[0].rows[0]);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('real Korean PDF paginates long content and table rows without dropping text', async () => {
  const data = fixture(); data.approved = true; data.template.is_sample = false;
  data.content.sections[0].body = Array.from({ length: 35 }, (_, index) => `문단 ${index + 1}: 기능 구현 전 계약 범위와 요구사항을 확인하고 변경 사항은 검토 기록에 남깁니다.`).join('\n');
  data.content.tables[0].rows = Array.from({ length: 45 }, (_, index) => [String(index + 1), `기능 ${index + 1}`, '검증 결과와 관련 근거를 확인하고 최종 검토자가 완료를 확정합니다.']);
  const result = await exportCommercial(data, { format: 'pdf', python });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-export-test-'));
  try {
    const output = path.join(directory, 'result.pdf'); await fs.writeFile(output, result.buffer);
    const { stdout } = await run(python, ['-c', 'import json,sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print(json.dumps({"pages":len(r.pages),"text":"\\n".join(p.extract_text() for p in r.pages)},ensure_ascii=False))', output]);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.pages >= 3);
    assert.match(parsed.text, /문단 35/); assert.match(parsed.text, /기능 45/);
    assert.match(parsed.text, /검토 승인본/); assert.doesNotMatch(parsed.text, /샘플 양식|검토 전 초안/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
