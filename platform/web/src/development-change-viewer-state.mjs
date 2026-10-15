import { automationPreviewUrl } from './task-automation-state.mjs';

export const CHANGE_AREAS = [
  { id: 'screen', label: '화면' }, { id: 'server', label: '서버' },
  { id: 'database', label: 'DB' }, { id: 'other', label: '공통·기타' },
];
export const CHANGE_LIMITS = Object.freeze({ characters: 1_000_000, files: 200, rows: 160, lineCharacters: 1600, rawCharacters: 80_000 });

// This is a navigation hint based on filenames, not an analysis of execution impact.
export function changeFileArea(path) {
  const value = String(path || '').toLowerCase().replaceAll('\\', '/');
  if (/(^|\/)(migrations?|schemas?|prisma|database|db)(\/|\.)/.test(value) || /\.(sql|prisma)$/.test(value)) return 'database';
  if (/(^|\/)(server|api|routes?|controllers?|handlers?|services?)(\/|\.)/.test(value)) return 'server';
  if (/\.(jsx|tsx|vue|svelte|css|scss|sass|less|html)$/.test(value) || /(^|\/)(components?|pages?|views?|styles?|web|frontend)(\/|\.)/.test(value)) return 'screen';
  return 'other';
}

function gitPath(raw, stripPrefix = true) {
  let value = String(raw || '').trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    // Git quotes non-ASCII paths as UTF-8 octal bytes. Keep text as text throughout.
    const encoded = value.slice(1, -1), bytes = [], encoder = new TextEncoder();
    for (let i = 0; i < encoded.length;) {
      if (encoded[i] === '\\') {
        const octal = /^[0-7]{1,3}/.exec(encoded.slice(i + 1));
        if (octal) { bytes.push(parseInt(octal[0], 8)); i += octal[0].length + 1; continue; }
        const escaped = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"' }[encoded[i + 1]];
        bytes.push(...encoder.encode(escaped ?? encoded[i + 1] ?? '\\')); i += 2; continue;
      }
      const character = String.fromCodePoint(encoded.codePointAt(i));
      bytes.push(...encoder.encode(character)); i += character.length;
    }
    value = new TextDecoder().decode(new Uint8Array(bytes));
  }
  if (value === '/dev/null') return null;
  return stripPrefix ? value.replace(/^[ab]\//, '') : value;
}

function headerPaths(line) {
  const pair = /^("(?:[^"\\]|\\.)*"|a\/.*?) ("(?:[^"\\]|\\.)*"|b\/.*)$/.exec(line.slice(11));
  return pair ? [gitPath(pair[1]), gitPath(pair[2])] : [null, null];
}

function alignedRows(lines) {
  const result = [], removed = [], added = [];
  const flush = () => {
    for (let i = 0; i < Math.max(removed.length, added.length); i++) result.push({ before: removed[i] || null, after: added[i] || null });
    removed.length = 0; added.length = 0;
  };
  for (const line of lines) {
    if (line.kind === 'context') { flush(); result.push({ before: line.before, after: line.after }); }
    else if (line.kind === 'removed') { if (added.length) flush(); removed.push(line.before); }
    else added.push(line.after);
  }
  flush();
  return result;
}

/** Parse bounded unified Git diffs. No content is executed or interpreted as HTML. */
export function parseDevelopmentDiff(diff, changedFiles = []) {
  const source = typeof diff === 'string' ? diff : '';
  const sourceLimited = source.length > CHANGE_LIMITS.characters;
  let bounded = source.slice(0, CHANGE_LIMITS.characters);
  if (sourceLimited) bounded = bounded.slice(0, Math.max(0, bounded.lastIndexOf('\n')));
  const lines = bounded.replaceAll('\r\n', '\n').split('\n'), files = [];
  let file = null, hunk = null, fileLimitReached = false, invalid = false;
  const finishHunk = () => {
    if (!hunk || !file) return;
    if (hunk.oldSeen < hunk.oldCount || hunk.newSeen < hunk.newCount) file.incomplete = true;
    if (hunk.oldSeen > hunk.oldCount || hunk.newSeen > hunk.newCount) file.invalid = true;
    const remaining = Math.max(0, CHANGE_LIMITS.rows - file.rows.length);
    const rows = alignedRows(hunk.lines);
    if (remaining > 0) file.rows.push({ header: hunk.label }, ...rows.slice(0, remaining - 1));
    if (rows.length + 1 > remaining || hunk.linesOmitted) file.excerpted = true;
    hunk = null;
  };
  const finishFile = () => {
    finishHunk();
    if (!file) return;
    file.path = file.newPath || file.oldPath || `경로 확인 필요 · ${files.length + 1}`;
    file.area = changeFileArea(file.path);
    if (file.oldPath && file.newPath && file.oldPath !== file.newPath) file.status = 'renamed';
    files.push(file); file = null;
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('diff --git ')) {
      finishFile();
      if (files.length >= CHANGE_LIMITS.files) { fileLimitReached = true; break; }
      const [oldPath, newPath] = headerPaths(line);
      file = { oldPath, newPath, status: 'modified', rows: [], additions: 0, deletions: 0, binary: false, incomplete: false, invalid: !oldPath && !newPath, excerpted: false, hunks: 0, metadata: [] };
      continue;
    }
    if (!file) { if (line.trim()) invalid = true; continue; }
    if (line.startsWith('@@')) {
      finishHunk();
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
      if (!match) { file.invalid = true; continue; }
      const oldStart = Number(match[1]), oldCount = Number(match[2] ?? 1), newStart = Number(match[3]), newCount = Number(match[4] ?? 1);
      if (![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger)) { file.invalid = true; continue; }
      file.hunks++;
      hunk = { label: `변경 전 ${oldStart}줄부터 ${oldCount}줄 → 변경 후 ${newStart}줄부터 ${newCount}줄`, oldLine: oldStart, newLine: newStart, oldCount, newCount, oldSeen: 0, newSeen: 0, lines: [], linesOmitted: false };
      continue;
    }
    if (hunk) {
      if (line === '\\ No newline at end of file') continue;
      if (!line && index === lines.length - 1) continue;
      const prefix = line[0];
      if (![' ', '+', '-'].includes(prefix)) { file.invalid = true; continue; }
      const fullText = line.slice(1), text = fullText.slice(0, CHANGE_LIMITS.lineCharacters);
      if (text.length < fullText.length) file.excerpted = true;
      const displayText = text.length < fullText.length ? `${text} … [긴 줄 생략]` : text;
      const before = prefix !== '+' ? { number: hunk.oldLine++, text: displayText, changed: prefix === '-' } : null;
      const after = prefix !== '-' ? { number: hunk.newLine++, text: displayText, changed: prefix === '+' } : null;
      if (before) hunk.oldSeen++;
      if (after) hunk.newSeen++;
      if (prefix === '-') file.deletions++;
      if (prefix === '+') file.additions++;
      if (hunk.lines.length < CHANGE_LIMITS.rows * 2 && file.rows.length < CHANGE_LIMITS.rows) hunk.lines.push({ kind: prefix === ' ' ? 'context' : prefix === '-' ? 'removed' : 'added', before, after });
      else hunk.linesOmitted = true;
      continue;
    }
    if (line.startsWith('--- ')) { file.oldPath = gitPath(line.slice(4)); if (!file.oldPath) file.status = 'added'; }
    else if (line.startsWith('+++ ')) { file.newPath = gitPath(line.slice(4)); if (!file.newPath) file.status = 'deleted'; }
    else if (line.startsWith('new file mode ')) file.status = 'added';
    else if (line.startsWith('deleted file mode ')) file.status = 'deleted';
    else if (line.startsWith('rename from ')) { file.oldPath = gitPath(line.slice(12), false); file.status = 'renamed'; }
    else if (line.startsWith('rename to ')) { file.newPath = gitPath(line.slice(10), false); file.status = 'renamed'; }
    else if (/^(Binary files |GIT binary patch)/.test(line)) file.binary = true;
    else if (/^(old mode |new mode |similarity index |dissimilarity index )/.test(line)) file.metadata.push(line);
  }
  finishFile();
  if (sourceLimited && files.length) files.at(-1).incomplete = true;
  const paths = new Set(files.flatMap(item => [item.oldPath, item.newPath].filter(Boolean)));
  for (const path of Array.isArray(changedFiles) ? changedFiles : []) {
    if (typeof path !== 'string' || !path.trim() || paths.has(path)) continue;
    if (files.length >= CHANGE_LIMITS.files) { fileLimitReached = true; break; }
    files.push({ path, oldPath: null, newPath: path, area: changeFileArea(path), status: 'reported', rows: [], additions: 0, deletions: 0, hunks: 0, binary: false, incomplete: false, invalid: false, excerpted: false, metadata: [] });
    paths.add(path);
  }
  return {
    files, additions: files.reduce((sum, item) => sum + item.additions, 0), deletions: files.reduce((sum, item) => sum + item.deletions, 0),
    incomplete: sourceLimited || fileLimitReached || files.some(item => item.incomplete), invalid: invalid || files.some(item => item.invalid),
    raw: source.slice(0, CHANGE_LIMITS.rawCharacters), rawTruncated: source.length > CHANGE_LIMITS.rawCharacters,
  };
}

export function developmentPreviewFramePath(value) {
  // An authenticated, script-free same-origin wrapper controls the sole external frame origin.
  return typeof value === 'string' && /^\/api\/projects\/[a-zA-Z0-9_-]{1,128}\/task-automation\/tasks\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/preview-frame$/i.test(value) ? value : null;
}

export function developmentPreviewState({ artifact, previewOrigins = [], previewFramePath, appOrigin, sharedView = false }) {
  if (sharedView) return { url: null, framePath: null, reason: 'shared', origin: null };
  const url = automationPreviewUrl(artifact?.preview_url, Array.isArray(previewOrigins) ? previewOrigins : []);
  if (!url) return { url: null, framePath: null, reason: artifact?.preview_url ? 'not_allowed' : 'missing', origin: null };
  const origin = new URL(url).origin;
  let application;
  try { application = new URL(appOrigin); } catch { return { url: null, framePath: null, reason: 'unknown_app', origin: null }; }
  // Cookies are not port-isolated. A different port on the AINS host is unsafe too.
  if (new URL(url).hostname === application.hostname) return { url: null, framePath: null, reason: 'same_host', origin: null };
  const framePath = developmentPreviewFramePath(previewFramePath);
  return { url, framePath, reason: framePath ? null : 'no_wrapper', origin };
}

export function developmentEvidence(artifact) {
  const kind = artifact?.kind || artifact?.artifact_type;
  if (kind === 'local_patch' || artifact?.evidence_status === 'unverified') return { label: 'AI 변경안 · 근거 확인 필요', tone: 'amber' };
  if (artifact?.evidence_status === 'verified' && /^[a-f0-9]{40}$/i.test(artifact?.head_sha || '') && /^[a-f0-9]{40}$/i.test(artifact?.base_sha || '')) return { label: '저장소 코드 근거 확인됨', tone: 'green' };
  return { label: '코드 근거 확인 상태 미제공', tone: 'quiet' };
}
