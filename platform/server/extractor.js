'use strict';

const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { validateDocumentSchema } = require('../../nora/client/schema-validator');
const { validateDocument } = require('../../nora/flow/review-core');

const runFile = promisify(execFile);
const ADAPTER = path.resolve(__dirname, '../../nora/adapter/extract_document.py');
const MAX_BYTES = 20 * 1024 * 1024;
const MIMES = Object.freeze({
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.md': 'text/markdown',
});
const ADAPTER_CODES = new Set([
  'INVALID_IDENTIFIER', 'ARCHIVE_LIMIT', 'ENCRYPTED_DOCUMENT', 'INVALID_OFFICE_FILE',
  'REVISION_CONFLICT', 'ARCHIVE_INTEGRITY', 'PDF_EXTRACTION_FAILED', 'UNSUPPORTED_CELL_VALUE',
  'SHEET_DIMENSION_LIMIT', 'UNSUPPORTED_TYPE', 'SOURCE_READ_FAILED', 'FILE_LIMIT',
  'INVALID_UTF8', 'DEPENDENCY_MISSING', 'PARSE_FAILED', 'EMPTY_EXTRACTION', 'UNSAFE_OUTPUT',
  'STORAGE_FAILED', 'WARNING_LIMIT', 'SEGMENT_LIMIT', 'TEXT_LIMIT',
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function validateSource(revision) {
  if (!revision || !Buffer.isBuffer(revision.content)) fail('SOURCE_BYTES_REQUIRED');
  if (!revision.content.length) fail('EMPTY_EXTRACTION');
  if (revision.content.length > MAX_BYTES) fail('FILE_LIMIT');
  const extension = path.extname(String(revision.filename || '')).toLowerCase();
  if (!MIMES[extension]) fail('UNSUPPORTED_TYPE');
  if (revision.mime_type !== MIMES[extension]) fail('SOURCE_MIME_MISMATCH');
  if (createHash('sha256').update(revision.content).digest('hex') !== revision.sha256) fail('SOURCE_HASH_MISMATCH');
  return extension;
}

function validateExtractedDocument(document, revision) {
  validateDocumentSchema(document);
  validateDocument(document, revision.project_id);
  if (document.document_id !== revision.document_id || document.revision_id !== revision.id ||
      document.source.sha256 !== revision.sha256 || document.source.filename !== revision.filename ||
      document.source.mime_type !== revision.mime_type) fail('EXTRACTION_IDENTITY_MISMATCH');
  return document;
}

/** Source bytes already live in the private database; the adapter archive is temporary. */
async function extractDocument(revision, {
  python = process.env.PYTHON_BIN || 'python3', timeoutMs = 60000, execFileImpl = runFile,
} = {}) {
  const extension = validateSource(revision);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ains-extract-'));
  try {
    await fs.chmod(temporary, 0o700);
    // User filenames are metadata only, never paths or executable arguments.
    const source = path.join(temporary, 'source' + extension);
    const output = path.join(temporary, 'document.json');
    await fs.writeFile(source, revision.content, { flag: 'wx', mode: 0o600 });
    try {
      await execFileImpl(python, [ADAPTER, source,
        '--project-id', revision.project_id, '--document-id', revision.document_id,
        '--revision-id', revision.id, '--archive-dir', path.join(temporary, 'archive'),
        '--output', output,
      ], { timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 256 * 1024, windowsHide: true });
    } catch (error) {
      if (error.killed || error.code === 'ETIMEDOUT') fail('EXTRACTION_TIMEOUT');
      if (error.code === 'ENOENT') fail('EXTRACTOR_UNAVAILABLE');
      // stderr can contain parser warnings or paths. Only return known symbolic codes.
      const lines = String(error.stderr || '').trim().split('\n').reverse();
      for (const line of lines) {
        try {
          const detail = JSON.parse(line);
          if (detail.ok === false && ADAPTER_CODES.has(detail.code)) fail(detail.code);
        } catch (parsed) {
          if (ADAPTER_CODES.has(parsed.code)) throw parsed;
        }
      }
      fail('EXTRACTION_FAILED');
    }
    if ((await fs.stat(output)).size > 2 * 1024 * 1024) fail('EXTRACTION_OUTPUT_LIMIT');
    let document;
    try { document = JSON.parse(await fs.readFile(output, 'utf8')); }
    catch { fail('EXTRACTION_OUTPUT_INVALID'); }
    // The private temporary basename is the sole expected transformation.
    if (document?.source?.filename !== 'source' + extension) fail('EXTRACTION_IDENTITY_MISMATCH');
    document.source.filename = revision.filename;
    return validateExtractedDocument(document, revision);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

module.exports = { extractDocument, validateExtractedDocument, validateSource, MIMES, ADAPTER_CODES };
