(() => {
// Nora enr_script body. Incoming record is the sandbox global `args`.
// Return fields merge into the input; throwing fails this single-record run.
const document = args;
const fail = (code, path) => { throw new Error(`SISM_${code}: ${path}`); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const checkObject = (value, path) => { if (!isObject(value)) fail('INVALID_OBJECT', path); };
const checkKeys = (value, allowed, path) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('UNEXPECTED_FIELD', `${path}.${key}`);
};
const checkString = (value, path, max, allowEmpty = false) => {
  if (typeof value !== 'string' || [...value].length > max || (!allowEmpty && value.trim().length === 0)) fail('INVALID_STRING', path);
};
const checkId = (value, path) => {
  checkString(value, path, 200);
};
const bytes = value => {
  let size = 0;
  for (const character of value) {
    const point = character.codePointAt(0);
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return size;
};

checkObject(document, 'document');
checkKeys(document, ['schema_version', 'project_id', 'document_id', 'revision_id', 'source', 'segments', 'extraction', 'normalization'], 'document');
if (bytes(JSON.stringify(document)) > 2000000) fail('PAYLOAD_TOO_LARGE', 'document');
if (document.schema_version !== '1.0') fail('SCHEMA_VERSION', 'schema_version');
for (const field of ['project_id', 'document_id', 'revision_id']) checkId(document[field], field);
checkObject(document.source, 'source');
checkKeys(document.source, ['filename', 'mime_type', 'sha256'], 'source');
checkString(document.source.filename, 'source.filename', 512);
checkString(document.source.mime_type, 'source.mime_type', 128);
if (typeof document.source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(document.source.sha256)) fail('INVALID_SHA256', 'source.sha256');
if (!Array.isArray(document.segments) || document.segments.length < 1 || document.segments.length > 200) fail('INVALID_SEGMENTS', 'segments');
let textLength = 0;
const ids = new Set();
const requirementKeys = new Set();
const locatorKinds = new Set(['page', 'slide', 'sheet', 'paragraph', 'text']);
for (let index = 0; index < document.segments.length; index++) {
  const segment = document.segments[index];
  const path = `segments[${index}]`;
  checkObject(segment, path);
  checkKeys(segment, ['segment_id', 'requirement_key', 'text', 'locator', 'extraction_status', 'normalized_text'], path);
  checkId(segment.segment_id, `${path}.segment_id`);
  if (ids.has(segment.segment_id)) fail('DUPLICATE_SEGMENT_ID', `${path}.segment_id`);
  ids.add(segment.segment_id);
  if (segment.requirement_key !== null) {
    checkString(segment.requirement_key, `${path}.requirement_key`, 256);
    if (requirementKeys.has(segment.requirement_key)) fail('AMBIGUOUS_REQUIREMENT_KEY', `${path}.requirement_key`);
    requirementKeys.add(segment.requirement_key);
  }
  checkString(segment.text, `${path}.text`, 100000);
  if (segment.normalized_text !== undefined) checkString(segment.normalized_text, `${path}.normalized_text`, 100000, true);
  textLength += [...segment.text].length;
  if (textLength > 100000) fail('TEXT_TOO_LARGE', 'segments.text');
  checkObject(segment.locator, `${path}.locator`);
  checkKeys(segment.locator, ['kind', 'label'], `${path}.locator`);
  if (!locatorKinds.has(segment.locator.kind)) fail('INVALID_LOCATOR', `${path}.locator.kind`);
  checkString(segment.locator.label, `${path}.locator.label`, 512);
  if (!['ok', 'needs_review'].includes(segment.extraction_status)) fail('INVALID_EXTRACTION_STATUS', `${path}.extraction_status`);
}
checkObject(document.extraction, 'extraction');
checkKeys(document.extraction, ['complete', 'warnings'], 'extraction');
if (typeof document.extraction.complete !== 'boolean') fail('INVALID_EXTRACTION', 'extraction.complete');
if (!Array.isArray(document.extraction.warnings) || document.extraction.warnings.length > 200) fail('INVALID_WARNINGS', 'extraction.warnings');
for (let index = 0; index < document.extraction.warnings.length; index++) checkString(document.extraction.warnings[index], `extraction.warnings[${index}]`, 2000);
if (document.normalization !== undefined) {
  checkObject(document.normalization, 'normalization');
  checkKeys(document.normalization, ['status', 'warnings', 'segment_count'], 'normalization');
  if (!['ready', 'needs_review'].includes(document.normalization.status)) fail('INVALID_NORMALIZATION', 'normalization.status');
  if (!Number.isInteger(document.normalization.segment_count) || document.normalization.segment_count !== document.segments.length) fail('INVALID_NORMALIZATION', 'normalization.segment_count');
  if (!Array.isArray(document.normalization.warnings)) fail('INVALID_NORMALIZATION', 'normalization.warnings');
  for (let index = 0; index < document.normalization.warnings.length; index++) checkString(document.normalization.warnings[index], `normalization.warnings[${index}]`, 2000);
}
return {};

})();
// Preserve text, source hash, identifiers, and locators verbatim.
// Deliberately do not perform NFKC, punctuation, digit, unit, or operator rewrites.
const document = args;
const warnings = [...document.extraction.warnings];
if (!document.extraction.complete) warnings.push('Document extraction is incomplete; source review is required.');
const segments = document.segments.map(segment => {
  const normalized_text = segment.text.replace(/\r\n?/g, '\n')
    .split('\n').map(line => line.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n').trim();
  if (segment.extraction_status === 'needs_review') warnings.push(`Segment ${segment.segment_id}: extraction requires source review.`);
  if (!normalized_text) warnings.push(`Segment ${segment.segment_id}: extracted text is empty.`);
  return {...segment, normalized_text};
});
return {
  segments,
  normalization: {
    status: warnings.length > 0 ? 'needs_review' : 'ready',
    warnings: [...new Set(warnings)],
    segment_count: segments.length
  }
};

