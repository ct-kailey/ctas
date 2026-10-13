/* Shared pure validation/diff code. No network, filesystem, evaluation or side effects. */
function fail(code, message) { var e = new Error(code + ': ' + message); e.code = code; throw e; }
function obj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function str(v) { return typeof v === 'string' && v.trim().length > 0; }
function need(v, code, message) { if (!v) fail(code, message); }
function strings(a) { return Array.isArray(a) && a.every(function(x) { return typeof x === 'string'; }); }
function canonical(s) { return s.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim(); }
function validateDocument(d, projectId) {
  need(obj(d) && d.schema_version === '1.0', 'INVALID_INPUT', 'Document schema_version must be 1.0');
  need(str(d.project_id) && d.project_id === projectId, 'PROJECT_MISMATCH', 'Document project does not match request');
  ['document_id','revision_id'].forEach(function(k) { need(str(d[k]) && d[k].length <= 200, 'INVALID_INPUT', k); });
  need(obj(d.source) && str(d.source.filename) && str(d.source.mime_type) && /^[a-f0-9]{64}$/.test(d.source.sha256 || ''), 'INVALID_INPUT', 'source metadata / sha256');
  need(Array.isArray(d.segments) && d.segments.length > 0 && d.segments.length <= 200, 'INVALID_INPUT', 'segments must contain 1..200 entries');
  need(obj(d.extraction) && typeof d.extraction.complete === 'boolean' && strings(d.extraction.warnings), 'INVALID_INPUT', 'extraction status');
  var ids = Object.create(null), keys = Object.create(null), total = 0;
  d.segments.forEach(function(s) {
    need(obj(s) && str(s.segment_id) && s.segment_id.length <= 200 && !ids[s.segment_id], 'INVALID_INPUT', 'segment IDs must be unique nonempty strings');
    ids[s.segment_id] = true;
    need(str(s.text), 'INVALID_INPUT', 'segment text must be nonempty'); total += s.text.length;
    need(obj(s.locator) && ['page','slide','sheet','paragraph','text'].indexOf(s.locator.kind) >= 0 && str(s.locator.label), 'MISSING_LOCATOR', s.segment_id);
    need(['ok','needs_review'].indexOf(s.extraction_status) >= 0, 'INVALID_INPUT', 'extraction_status');
    need(s.requirement_key === null || str(s.requirement_key), 'INVALID_INPUT', 'requirement_key must be string or null');
    if (s.requirement_key !== null) {
      need(!keys[s.requirement_key], 'AMBIGUOUS_REQUIREMENT_KEY', s.requirement_key); keys[s.requirement_key] = true;
    }
  });
  need(total <= 100000, 'INPUT_TOO_LARGE', 'Document exceeds 100000 characters; split explicitly');
  return d;
}
function validateRequest(r) {
  need(obj(r) && r.schema_version === '1.0' && str(r.request_id) && str(r.project_id), 'INVALID_INPUT', 'request identity/schema');
  validateDocument(r.baseline, r.project_id); validateDocument(r.current, r.project_id);
  need(r.baseline.document_id === r.current.document_id, 'DOCUMENT_MISMATCH', 'Versions must refer to the same logical document');
  need(!(r.baseline.revision_id === r.current.revision_id && r.baseline.source.sha256 !== r.current.source.sha256), 'REVISION_CONFLICT', 'A revision cannot refer to different bytes');
  need(obj(r.domain_pack) && str(r.domain_pack.id) && str(r.domain_pack.version) && Array.isArray(r.domain_pack.glossary), 'INVALID_INPUT', 'domain_pack');
  need(Array.isArray(r.impact_map) && r.impact_map.length <= 200, 'INVALID_INPUT', 'impact_map');
  r.impact_map.forEach(function(m) {
    need(obj(m) && str(m.requirement_key) && Array.isArray(m.targets), 'INVALID_INPUT', 'impact mapping');
    m.targets.forEach(function(t) { need(obj(t) && str(t.ref) && ['screen','api','database','test','document','other'].indexOf(t.kind) >= 0, 'INVALID_INPUT', 'impact target'); });
  });
  return r;
}
function evidence(s) { return s ? {segment_id:s.segment_id,text:s.text,locator:{kind:s.locator.kind,label:s.locator.label}} : null; }
function suspicious(s) { return /(ignore\s+(all|previous|prior)|system\s*prompt|지시.{0,12}무시|승인.{0,12}(완료|확정).{0,12}출력|타\s*프로젝트.{0,8}조회)/i.test(s.text); }
function criticalTokens(s) { return (s.match(/-?\d+(?:\.\d+)?|>=|<=|[<>≥≤=]|이상|이하|초과|미만|mg|kg|ml|mL|mm|cm|%|초|분|시간/g) || []).join('|'); }
function prepareReview(r) {
  validateRequest(r);
  var warnings = [], before = [], after = [], candidates = [], usedB = Object.create(null), usedA = Object.create(null);
  function eligible(doc, side, target) {
    if (!doc.extraction.complete) warnings.push('INCOMPLETE_EXTRACTION:' + side);
    doc.extraction.warnings.forEach(function(w) { warnings.push(side + ':' + w); });
    doc.segments.forEach(function(s) {
      if (suspicious(s)) { warnings.push('QUARANTINED_INSTRUCTION:' + side + ':' + s.segment_id); return; }
      if (s.extraction_status !== 'ok') warnings.push('EXTRACTION_REVIEW:' + side + ':' + s.segment_id);
      target.push(s);
    });
  }
  eligible(r.baseline,'baseline',before); eligible(r.current,'current',after);
  function pair(b, a, method) {
    if (b) usedB[b.segment_id] = true; if (a) usedA[a.segment_id] = true;
    if (b && a && canonical(b.text) === canonical(a.text)) return;
    var critical = !!(b && a && criticalTokens(b.text) !== criticalTokens(a.text));
    candidates.push({change_id:'chg-' + String(candidates.length+1).padStart(3,'0'),requirement_key:(a && a.requirement_key) || (b && b.requirement_key) || null,change_type:!b?'added':!a?'removed':'modified',risk:critical?'high':!a?'high':'medium',before:evidence(b),after:evidence(a),match_method:method,critical_change:critical});
  }
  after.forEach(function(a) {
    if (a.requirement_key === null) return;
    var b = before.find(function(x) { return x.requirement_key === a.requirement_key; });
    if (b) pair(b,a,'requirement_key');
  });
  after.forEach(function(a) {
    if (usedA[a.segment_id]) return;
    var b = before.find(function(x) { return !usedB[x.segment_id] && (x.requirement_key === null || a.requirement_key === null) && canonical(x.text) === canonical(a.text); });
    if (b) pair(b,a,'exact_text');
  });
  after.forEach(function(a) {
    if (usedA[a.segment_id]) return;
    var b = before.find(function(x) { return !usedB[x.segment_id] && x.requirement_key === null && a.requirement_key === null && x.segment_id === a.segment_id; });
    if (b) { warnings.push('MATCH_REQUIRES_REVIEW:' + a.segment_id); pair(b,a,'source_position'); }
  });
  after.forEach(function(a) { if (!usedA[a.segment_id]) pair(null,a,'unmatched'); });
  before.forEach(function(b) { if (!usedB[b.segment_id]) pair(b,null,'unmatched'); });
  return {schema_version:'1.0',request:r,candidates:candidates,warnings:Array.from(new Set(warnings)),constraints:{customer_approval:false,baseline_publication_allowed:false,domain_validation:'human_required'}};
}
function finalizeReview(r, review) {
  var prepared = prepareReview(r);
  need(obj(review) && review.schema_version === '1.0' && review.request_id === r.request_id && review.project_id === r.project_id, 'OUTPUT_IDENTITY_MISMATCH', 'review identity');
  need(['needs_review','no_change','blocked'].indexOf(review.status) >= 0 && Array.isArray(review.changes) && Array.isArray(review.questions) && strings(review.warnings), 'OUTPUT_SCHEMA_INVALID', 'review collections/status');
  need(review.changes.length <= 400 && review.questions.length <= 400, 'OUTPUT_TOO_LARGE', 'review limits');
  need(obj(review.approval) && review.approval.status === 'not_requested' && review.approval.baseline_publication_allowed === false, 'ILLEGAL_APPROVAL', 'AI output cannot approve or publish');
  if (review.status === 'blocked') fail('MODEL_BLOCKED', 'Review could not be safely completed');
  var expected = Object.create(null), seen = Object.create(null);
  prepared.candidates.forEach(function(c) { expected[c.change_id] = c; });
  review.changes.forEach(function(c) {
    need(obj(c) && str(c.change_id) && !seen[c.change_id] && expected[c.change_id], 'OUTPUT_COVERAGE_INVALID', 'unknown/duplicate change');
    seen[c.change_id] = true;
    var e = expected[c.change_id];
    need(c.requirement_key === e.requirement_key, 'EVIDENCE_MISMATCH', 'requirement key');
    ['before','after'].forEach(function(side) {
      var x = c[side], y = e[side];
      need(y === null ? x === null : obj(x) && x.segment_id === y.segment_id && x.text === y.text && obj(x.locator) && x.locator.kind === y.locator.kind && x.locator.label === y.locator.label, 'EVIDENCE_MISMATCH', c.change_id + ' ' + side);
    });
    need(['added','removed','modified','editorial','uncertain'].indexOf(c.change_type) >= 0 && ['low','medium','high'].indexOf(c.risk) >= 0 && str(c.summary) && str(c.reason) && Array.isArray(c.impacts), 'OUTPUT_SCHEMA_INVALID', 'change fields');
    if (!e.before) need(c.change_type === 'added' || c.change_type === 'uncertain', 'OUTPUT_COVERAGE_INVALID', 'new requirement');
    if (!e.after) need(c.change_type === 'removed' || c.change_type === 'uncertain', 'OUTPUT_COVERAGE_INVALID', 'deleted requirement');
    if (e.before && e.after) need(['modified','editorial','uncertain'].indexOf(c.change_type) >= 0, 'OUTPUT_COVERAGE_INVALID', 'paired requirement cannot be added or removed');
    if (e.critical_change) need(c.change_type === 'modified' && c.risk === 'high', 'CRITICAL_CHANGE_DOWNGRADED', c.change_id);
    c.impacts.forEach(function(i) {
      need(obj(i) && str(i.ref) && str(i.reason) && ['screen','api','database','test','document','other'].indexOf(i.kind) >= 0 && ['provided','inferred'].indexOf(i.basis) >= 0, 'OUTPUT_SCHEMA_INVALID', 'impact fields');
      if (i.basis === 'provided') need(r.impact_map.some(function(m) { return m.requirement_key === c.requirement_key && m.targets.some(function(t) { return t.kind === i.kind && t.ref === i.ref; }); }), 'UNSUPPORTED_IMPACT', i.ref);
    });
  });
  prepared.candidates.forEach(function(c) { need(seen[c.change_id], 'OMITTED_CHANGE', c.change_id); });
  var qids = Object.create(null);
  review.questions.forEach(function(q) {
    need(obj(q) && str(q.question_id) && !qids[q.question_id] && str(q.question) && strings(q.options) && strings(q.related_change_ids) && q.requires_customer_decision === true, 'OUTPUT_SCHEMA_INVALID', 'question fields');
    qids[q.question_id] = true;
    q.related_change_ids.forEach(function(id) { need(seen[id], 'OUTPUT_SCHEMA_INVALID', 'question references unknown change'); });
  });
  review.warnings = Array.from(new Set(prepared.warnings.concat(review.warnings)));
  review.status = review.changes.length || review.questions.length || review.warnings.length ? 'needs_review' : 'no_change';
  review.approval = {status:'not_requested',baseline_publication_allowed:false};
  return review;
}
if (typeof module !== 'undefined') module.exports = {validateDocument:validateDocument,validateRequest:validateRequest,prepareReview:prepareReview,finalizeReview:finalizeReview};
