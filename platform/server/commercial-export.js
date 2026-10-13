'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const runFile = promisify(execFile);
const SCRIPT = path.join(__dirname, 'export_commercial.py');
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MIMES = Object.freeze({ docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf' });
const MESSAGES = {
  COMMERCIAL_EXPORT_FORMAT_INVALID: '지원하지 않는 문서 형식입니다.',
  COMMERCIAL_EXPORT_INPUT_INVALID: '내보낼 문서의 구조를 확인해 주세요.',
  COMMERCIAL_EXPORT_INPUT_LIMIT: '내보낼 문서의 용량이 허용 범위를 초과했습니다.',
  COMMERCIAL_EXPORT_TIMEOUT: '문서 생성 시간이 초과되었습니다. 문서 분량을 확인해 주세요.',
  COMMERCIAL_EXPORT_UNAVAILABLE: '문서 생성 도구가 준비되지 않았습니다.',
  COMMERCIAL_EXPORT_FAILED: '문서를 생성하지 못했습니다. 다시 시도해 주세요.',
  COMMERCIAL_EXPORT_OUTPUT_INVALID: '생성된 문서 형식을 확인하지 못했습니다.',
  COMMERCIAL_EXPORT_OUTPUT_LIMIT: '생성된 문서의 용량이 허용 범위를 초과했습니다.',
};
function fail(code) {
  const status = ['COMMERCIAL_EXPORT_FORMAT_INVALID', 'COMMERCIAL_EXPORT_INPUT_INVALID'].includes(code) ? 400
    : code.endsWith('_LIMIT') ? 413 : ['COMMERCIAL_EXPORT_TIMEOUT', 'COMMERCIAL_EXPORT_UNAVAILABLE'].includes(code) ? 503 : 500;
  throw Object.assign(new Error(MESSAGES[code]), { code, status });
}
function validate(data) {
  if (!data || typeof data !== 'object' || typeof data.title !== 'string' || !data.title.trim() ||
      !data.content || !Array.isArray(data.content.sections) || !Array.isArray(data.content.tables)) fail('COMMERCIAL_EXPORT_INPUT_INVALID');
  if (data.content.sections.length > 200 || data.content.tables.length > 100) fail('COMMERCIAL_EXPORT_INPUT_LIMIT');
  for (const section of data.content.sections) {
    if (!section || typeof section.title !== 'string' || typeof section.body !== 'string') fail('COMMERCIAL_EXPORT_INPUT_INVALID');
  }
  let rows = 0;
  for (const table of data.content.tables) {
    if (!table || typeof table.title !== 'string' || !Array.isArray(table.columns) || !table.columns.length ||
        table.columns.length > 12 || !table.columns.every((cell) => typeof cell === 'string') || !Array.isArray(table.rows)) fail('COMMERCIAL_EXPORT_INPUT_INVALID');
    rows += table.rows.length;
    if (rows > 2000) fail('COMMERCIAL_EXPORT_INPUT_LIMIT');
    if (!table.rows.every((row) => Array.isArray(row) && row.length === table.columns.length && row.every((cell) => typeof cell === 'string'))) fail('COMMERCIAL_EXPORT_INPUT_INVALID');
  }
  let json;
  try { json = JSON.stringify(data); } catch { fail('COMMERCIAL_EXPORT_INPUT_INVALID'); }
  if (Buffer.byteLength(json) > MAX_INPUT_BYTES) fail('COMMERCIAL_EXPORT_INPUT_LIMIT');
  return json;
}

/** Source values are plain text; no template code, URLs, or user-controlled paths execute. */
async function exportCommercial(data, { format = 'docx', python = process.env.PYTHON_BIN || 'python3', timeoutMs = 60000, execFileImpl = runFile } = {}) {
  if (!Object.hasOwn(MIMES, format)) fail('COMMERCIAL_EXPORT_FORMAT_INVALID');
  const json = validate(data);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-commercial-export-'));
  try {
    await fs.chmod(temporary, 0o700);
    const input = path.join(temporary, 'input.json'), output = path.join(temporary, `output.${format}`);
    await fs.writeFile(input, json, { mode: 0o600, flag: 'wx' });
    try {
      await execFileImpl(python, [SCRIPT, input, output, format], {
        timeout: Math.min(60000, Math.max(100, Number(timeoutMs) || 60000)),
        maxBuffer: 128 * 1024, killSignal: 'SIGKILL', windowsHide: true,
      });
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT') fail('COMMERCIAL_EXPORT_TIMEOUT');
      if (error.code === 'ENOENT' || String(error.stderr || '').includes('"code": "DEPENDENCY_MISSING"')) fail('COMMERCIAL_EXPORT_UNAVAILABLE');
      fail('COMMERCIAL_EXPORT_FAILED');
    }
    let handle;
    try {
      handle = await fs.open(output, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size) fail('COMMERCIAL_EXPORT_OUTPUT_INVALID');
      if (stat.size > MAX_OUTPUT_BYTES) fail('COMMERCIAL_EXPORT_OUTPUT_LIMIT');
      const buffer = await handle.readFile();
      if (buffer.length > MAX_OUTPUT_BYTES) fail('COMMERCIAL_EXPORT_OUTPUT_LIMIT');
      if (!(format === 'pdf' ? buffer.subarray(0, 5).equals(Buffer.from('%PDF-')) : buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])))) fail('COMMERCIAL_EXPORT_OUTPUT_INVALID');
      const title = data.title.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '_').replace(/^\.+|\.+$/g, '').trim().slice(0, 100) || 'document';
      return { buffer, mime: MIMES[format], filename: `${title}.${format}` };
    } catch (error) {
      if (MESSAGES[error.code]) throw error;
      fail('COMMERCIAL_EXPORT_OUTPUT_INVALID');
    } finally { await handle?.close(); }
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

module.exports = { exportCommercial, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES };
