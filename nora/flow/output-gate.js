/* Nora outputRules code body: explicit blocked envelope instead of throwing (fail-soft). */
try {
  var v = JSON.parse(text);
  if (!v || v.schema_version !== '1.0' || typeof v.request_id !== 'string' || typeof v.project_id !== 'string' || !Array.isArray(v.changes) || !Array.isArray(v.questions) || !Array.isArray(v.warnings) || !v.approval || v.approval.status !== 'not_requested' || v.approval.baseline_publication_allowed !== false || ['needs_review','no_change','blocked'].indexOf(v.status) < 0) throw new Error('invalid review');
  if (v.changes.length > 400 || v.questions.length > 400) throw new Error('oversize review');
  return JSON.stringify(v);
} catch (e) {
  return JSON.stringify({schema_version:'1.0',request_id:'invalid',project_id:'invalid',status:'blocked',changes:[],questions:[],warnings:['OUTPUT_SCHEMA_INVALID'],approval:{status:'not_requested',baseline_publication_allowed:false}});
}
