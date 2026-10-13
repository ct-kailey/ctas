'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { extractDocument, validateExtractedDocument } = require('../server/extractor');

function source(text = '검체 등록은 5초 이내에 완료한다.') {
  const content = Buffer.from(text);
  return { id: randomUUID(), project_id: 'extractor-test', document_id: randomUUID(),
    filename: '요구사항.txt', mime_type: 'text/plain', content,
    sha256: createHash('sha256').update(content).digest('hex') };
}
function document(revision) {
  return { schema_version: '1.0', project_id: revision.project_id, document_id: revision.document_id,
    revision_id: revision.id, source: { filename: 'source.txt', mime_type: revision.mime_type, sha256: revision.sha256 },
    segments: [{ segment_id: 'seg-0001', requirement_key: null, text: revision.content.toString(),
      locator: { kind: 'text', label: 'full text' }, extraction_status: 'ok' }],
    extraction: { complete: true, warnings: [] } };
}

test('real Python text adapter retains exact bytes, location, metadata and warnings', async () => {
  const revision = source('조건: 5 이상\r\n원본\t문자열');
  const result = await extractDocument(revision);
  assert.equal(result.source.sha256, revision.sha256);
  assert.equal(result.source.filename, revision.filename);
  assert.equal(result.segments[0].text, revision.content.toString());
  assert.deepEqual(result.segments[0].locator, { kind: 'text', label: 'full text' });
  assert.ok(result.extraction.warnings.some(value => value.startsWith('CONTENT_IS_UNTRUSTED')));
});

test('private temporary files are removed after a successful extraction', async () => {
  const revision = source();
  let temporary;
  const result = await extractDocument(revision, { execFileImpl: async (_python, args) => {
    const input = args[1];
    temporary = path.dirname(input);
    assert.equal((await fs.stat(temporary)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(input)).mode & 0o777, 0o600);
    assert.deepEqual(await fs.readFile(input), revision.content);
    await fs.writeFile(args[args.indexOf('--output') + 1], JSON.stringify(document(revision)));
  } });
  assert.equal(result.source.filename, revision.filename);
  await assert.rejects(fs.stat(temporary), { code: 'ENOENT' });
});

test('source hash mismatch fails before invoking Python', async () => {
  let calls = 0;
  const revision = { ...source(), sha256: '0'.repeat(64) };
  await assert.rejects(extractDocument(revision, { execFileImpl: async () => { calls++; } }), { code: 'SOURCE_HASH_MISMATCH' });
  assert.equal(calls, 0);
});

test('MIME mismatch and source limits fail before extraction', async () => {
  await assert.rejects(extractDocument({ ...source(), mime_type: 'application/pdf' }), { code: 'SOURCE_MIME_MISMATCH' });
  await assert.rejects(extractDocument({ ...source(), content: Buffer.alloc(20 * 1024 * 1024 + 1) }), { code: 'FILE_LIMIT' });
  await assert.rejects(extractDocument(source('')), { code: 'EMPTY_EXTRACTION' });
});

test('known parser failure is returned as a safe code and temp files are removed', async () => {
  let temporary;
  await assert.rejects(extractDocument(source(), { execFileImpl: async (_python, args) => {
    temporary = path.dirname(args[1]);
    throw Object.assign(new Error('private path and text must not escape'), {
      stderr: 'Parser warning with source data\n' + JSON.stringify({ ok: false, code: 'EMPTY_EXTRACTION', message: 'sensitive' }),
    });
  } }), error => error.code === 'EMPTY_EXTRACTION' && error.message === 'EMPTY_EXTRACTION');
  await assert.rejects(fs.stat(temporary), { code: 'ENOENT' });
});

test('unknown Python errors and timeouts never reveal stderr', async () => {
  await assert.rejects(extractDocument(source(), { execFileImpl: async () => {
    throw Object.assign(new Error('secret'), { stderr: '{"ok":false,"code":"UNTRUSTED_SECRET","message":"secret"}' });
  } }), error => error.code === 'EXTRACTION_FAILED' && error.message === 'EXTRACTION_FAILED');
  await assert.rejects(extractDocument(source(), { execFileImpl: async () => {
    throw Object.assign(new Error('secret'), { killed: true });
  } }), { code: 'EXTRACTION_TIMEOUT' });
});

test('adapter identity corruption cannot be persisted', async () => {
  const revision = source();
  await assert.rejects(extractDocument(revision, { execFileImpl: async (_python, args) => {
    await fs.writeFile(args[args.indexOf('--output') + 1], JSON.stringify({ ...document(revision), revision_id: randomUUID() }));
  } }), { code: 'EXTRACTION_IDENTITY_MISMATCH' });
  assert.throws(() => validateExtractedDocument({ ...document(revision), project_id: 'other-project' }, revision),
    { code: 'PROJECT_MISMATCH' });
});

test('malformed adapter output is rejected', async () => {
  await assert.rejects(extractDocument(source(), { execFileImpl: async (_python, args) => {
    await fs.writeFile(args[args.indexOf('--output') + 1], 'not JSON');
  } }), { code: 'EXTRACTION_OUTPUT_INVALID' });
});
