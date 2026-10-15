'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/development-change-viewer-state.mjs');

test('unified changes preserve exact text, original line numbers and aligned replacements', async () => {
  const { parseDevelopmentDiff } = await state();
  const parsed = parseDevelopmentDiff('diff --git a/src/Page.tsx b/src/Page.tsx\n--- a/src/Page.tsx\n+++ b/src/Page.tsx\n@@ -10,3 +10,4 @@\n unchanged\n-old\n+new\n+<script>alert(1)</script>\n tail\n');
  assert.equal(parsed.invalid, false); assert.equal(parsed.incomplete, false);
  assert.equal(parsed.additions, 2); assert.equal(parsed.deletions, 1);
  assert.equal(parsed.files[0].area, 'screen');
  const rows = parsed.files[0].rows.filter(row => !row.header);
  assert.deepEqual(rows.map(row => [row.before?.number, row.after?.number]), [[10, 10], [11, 11], [undefined, 12], [12, 13]]);
  assert.equal(rows[2].after.text, '<script>alert(1)</script>');
  assert.equal(rows[2].before, null);
});

test('code that resembles file headers stays hunk content and zero-line additions parse', async () => {
  const { parseDevelopmentDiff } = await state();
  const parsed = parseDevelopmentDiff('diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+-- a/not-a-file\n+++ b/not-a-file\n\\ No newline at end of file\n');
  assert.equal(parsed.files[0].status, 'added'); assert.equal(parsed.files[0].path, 'new.txt');
  assert.equal(parsed.files[0].rows[2].after.text, '++ b/not-a-file');
  assert.equal(parsed.invalid, false); assert.equal(parsed.incomplete, false);
});

test('deleted files, rename-only changes, binary and permission changes retain their own evidence', async () => {
  const { parseDevelopmentDiff } = await state();
  const parsed = parseDevelopmentDiff([
    'diff --git a/a.sql b/a.sql', 'deleted file mode 100644', '--- a/a.sql', '+++ /dev/null', '@@ -1 +0,0 @@', '-drop me',
    'diff --git a/old name.txt b/new name.txt', 'similarity index 100%', 'rename from old name.txt', 'rename to new name.txt',
    'diff --git a/image.png b/image.png', 'Binary files a/image.png and b/image.png differ',
    'diff --git a/run.sh b/run.sh', 'old mode 100644', 'new mode 100755', '',
  ].join('\n'));
  assert.deepEqual(parsed.files.map(file => [file.path, file.status, file.binary]), [['a.sql', 'deleted', false], ['new name.txt', 'renamed', false], ['image.png', 'modified', true], ['run.sh', 'modified', false]]);
  assert.equal(parsed.files[1].oldPath, 'old name.txt');
  assert.deepEqual(parsed.files[3].metadata, ['old mode 100644', 'new mode 100755']);
  assert.equal(parsed.incomplete, false); assert.equal(parsed.invalid, false);
});

test('Git C-quoted Korean paths and escaped quotes decode without changing content', async () => {
  const { parseDevelopmentDiff } = await state();
  const parsed = parseDevelopmentDiff('diff --git "a/\\355\\225\\234\\352\\270\\200 \\"name\\".txt" "b/\\355\\225\\234\\352\\270\\200 \\"name\\".txt"\n@@ -1 +1 @@\n-before\n+after\n');
  assert.equal(parsed.files[0].path, '한글 "name".txt');
  assert.equal(parsed.invalid, false);
});

test('missing and overrun hunk lines are marked partial or invalid instead of presented as full changes', async () => {
  const { parseDevelopmentDiff } = await state();
  const missing = parseDevelopmentDiff('diff --git a/x b/x\n@@ -1,3 +1,3 @@\n-one\n+two\n');
  assert.equal(missing.incomplete, true); assert.equal(missing.files[0].incomplete, true);
  const overrun = parseDevelopmentDiff('diff --git a/x b/x\n@@ -1 +1 @@\n-a\n-b\n+c\n');
  assert.equal(overrun.invalid, true);
  const malformed = parseDevelopmentDiff('diff --git a/x b/x\n@@ unknown @@\n<script>no</script>\n');
  assert.equal(malformed.invalid, true); assert.equal(malformed.files[0].rows.length, 0);
});

test('multiple hunks keep distinct line ranges and context is not counted as a change', async () => {
  const { parseDevelopmentDiff } = await state();
  const parsed = parseDevelopmentDiff('diff --git a/server/run.js b/server/run.js\n@@ -1 +1 @@\n same\n@@ -50,2 +50,2 @@\n-old\n+new\n next\n');
  assert.equal(parsed.files[0].hunks, 2); assert.equal(parsed.additions, 1); assert.equal(parsed.deletions, 1);
  assert.equal(parsed.files[0].rows[3].before.number, 50);
  assert.equal(parsed.files[0].area, 'server');
});

test('reported files never manufacture code, ignore non-string data and deduplicate paths', async () => {
  const { parseDevelopmentDiff } = await state();
  const parsed = parseDevelopmentDiff(null, ['src/view.tsx', 'src/view.tsx', 'db/schema.sql', null, { filename: 'no' }]);
  assert.equal(parsed.files.length, 2); assert.equal(parsed.additions, 0);
  assert.ok(parsed.files.every(file => file.status === 'reported' && !file.rows.length));
  const invalid = parseDevelopmentDiff('not a unified diff', ['file.txt']);
  assert.equal(invalid.invalid, true); assert.equal(invalid.files[0].status, 'reported');
});

test('long diff, raw text, file counts and excerpt lines are bounded and disclose omitted data', async () => {
  const { parseDevelopmentDiff, CHANGE_LIMITS } = await state();
  const count = 400;
  const parsed = parseDevelopmentDiff(`diff --git a/x b/x\n@@ -0,0 +1,${count} @@\n${Array.from({ length: count }, (_, i) => `+line ${i}`).join('\n')}\n`);
  assert.ok(parsed.files[0].rows.length <= CHANGE_LIMITS.rows);
  assert.equal(parsed.files[0].excerpted, true); assert.equal(parsed.additions, count); assert.equal(parsed.incomplete, false);
  const huge = parseDevelopmentDiff('diff --git a/x b/x\n@@ -0,0 +1,2 @@\n+' + 'x'.repeat(CHANGE_LIMITS.characters) + '\n+tail\n');
  assert.equal(huge.incomplete, true); assert.equal(huge.rawTruncated, true); assert.equal(huge.raw.length, CHANGE_LIMITS.rawCharacters);
  const files = parseDevelopmentDiff('', Array.from({ length: 300 }, (_, index) => `file-${index}.txt`));
  assert.equal(files.files.length, CHANGE_LIMITS.files); assert.equal(files.incomplete, true);
});

test('classification is a deterministic filename hint with database and server precedence', async () => {
  const { changeFileArea } = await state();
  for (const [path, area] of [['server/migrations/01.sql', 'database'], ['prisma/schema.prisma', 'database'], ['app/api/report/route.ts', 'server'], ['src/components/Card.tsx', 'screen'], ['web/index.js', 'screen'], ['docs/architecture.md', 'other'], ['package.json', 'other']]) assert.equal(changeFileArea(path), area);
});

test('preview only accepts the authenticated relative wrapper route without queries or path tricks', async () => {
  const { developmentPreviewFramePath } = await state();
  const valid = '/api/projects/ains-sism/task-automation/tasks/12345678-1234-1234-1234-123456789abc/preview-frame';
  assert.equal(developmentPreviewFramePath(valid), valid);
  for (const value of [`https://example.com${valid}`, `/${valid}`, `${valid}?url=https://evil.test`, `${valid}#fragment`, valid.replace('ains-sism', '..'), valid.replace('ains-sism', 'a%2Fb'), valid.replace('12345678-1234', '123456781234'), valid.replace('preview-frame', 'approve-merge'), null]) assert.equal(developmentPreviewFramePath(value), null);
});

test('preview honors origin allowlist and blocks embedded same-origin or unwrapped URLs', async () => {
  const { developmentPreviewState } = await state();
  const args = { artifact: { preview_url: 'https://preview.example.test/path' }, previewOrigins: ['https://preview.example.test'], appOrigin: 'https://ains.example.test', previewFramePath: '/api/projects/p/task-automation/tasks/12345678-1234-1234-1234-123456789abc/preview-frame' };
  assert.equal(developmentPreviewState(args).framePath, args.previewFramePath);
  assert.equal(developmentPreviewState({ ...args, previewFramePath: 'https://evil.test' }).reason, 'no_wrapper');
  assert.equal(developmentPreviewState({ ...args, appOrigin: 'https://preview.example.test' }).framePath, null);
  assert.equal(developmentPreviewState({ ...args, appOrigin: 'https://preview.example.test:8443' }).url, null);
  assert.equal(developmentPreviewState({ ...args, appOrigin: 'https://preview.example.test:8443' }).reason, 'same_host');
  assert.equal(developmentPreviewState({ ...args, appOrigin: undefined }).framePath, null);
  for (const url of ['https://evil.test/', 'https://preview.example.test.evil.test/', 'http://preview.example.test', 'javascript:alert(1)', 'https://user:password@preview.example.test/']) assert.equal(developmentPreviewState({ ...args, artifact: { preview_url: url } }).url, null);
});

test('shared preview state exposes neither URL nor frame even when caller has full private artifact', async () => {
  const { developmentPreviewState } = await state();
  const result = developmentPreviewState({ artifact: { preview_url: 'https://preview.example.test/private' }, previewOrigins: ['https://preview.example.test'], previewFramePath: '/api/projects/p/task-automation/tasks/12345678-1234-1234-1234-123456789abc/preview-frame', appOrigin: 'https://ains.example.test', sharedView: true });
  assert.deepEqual(result, { url: null, framePath: null, reason: 'shared', origin: null });
});

test('evidence badge requires recorded verification and commit evidence, never infers success from diff', async () => {
  const { developmentEvidence } = await state();
  assert.equal(developmentEvidence({ diff: '+fixed' }).tone, 'quiet');
  assert.equal(developmentEvidence({ evidence_status: 'verified' }).tone, 'quiet');
  const complete = { evidence_status: 'verified', head_sha: 'a'.repeat(40), base_sha: 'b'.repeat(40) };
  assert.equal(developmentEvidence(complete).tone, 'green');
  assert.equal(developmentEvidence({ ...complete, kind: 'local_patch' }).tone, 'amber');
  assert.equal(developmentEvidence({ ...complete, evidence_status: 'unverified' }).tone, 'amber');
});
