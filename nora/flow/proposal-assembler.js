/* Assemble exact source evidence from deterministic IDs; never accept model-written evidence. */
var proposalCore = typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./review-core') : null;
function proposalNeed(value, code, message) { if (!value) { var error = new Error(code + ': ' + message); error.code = code; throw error; } }
function proposalObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function assembleReview(request, proposal) {
  // prepareReview/finalizeReview are supplied by the shared pure core in the Nora sandbox.
  var prepared = (proposalCore ? proposalCore.prepareReview : prepareReview)(request);
  proposalNeed(proposalObject(proposal), 'PROPOSAL_SCHEMA_INVALID', 'proposal must be an object');
  var top = ['schema_version','request_id','project_id','status','changes','questions','warnings','approval'];
  proposalNeed(Object.keys(proposal).every(function(k) { return top.indexOf(k) >= 0; }) && top.every(function(k) { return Object.prototype.hasOwnProperty.call(proposal,k); }), 'PROPOSAL_SCHEMA_INVALID', 'proposal top-level keys');
  proposalNeed(Array.isArray(proposal.changes), 'PROPOSAL_SCHEMA_INVALID', 'proposal changes');
  var candidates = Object.create(null);
  prepared.candidates.forEach(function(c) { candidates[c.change_id] = c; });
  var semantic = ['change_id','change_type','risk','summary','reason','impacts'];
  var assembled = JSON.parse(JSON.stringify(proposal));
  assembled.changes = proposal.changes.map(function(change) {
    proposalNeed(proposalObject(change) && Object.keys(change).every(function(k) { return semantic.indexOf(k) >= 0; }) && semantic.every(function(k) { return Object.prototype.hasOwnProperty.call(change,k); }), 'PROPOSAL_SCHEMA_INVALID', 'semantic change keys only; evidence must come from source');
    var source = candidates[change.change_id];
    proposalNeed(!!source, 'OUTPUT_COVERAGE_INVALID', 'unknown change reference');
    return {change_id:change.change_id,requirement_key:source.requirement_key,change_type:change.change_type,risk:change.risk,summary:change.summary,reason:change.reason,impacts:JSON.parse(JSON.stringify(change.impacts)),before:source.before,after:source.after};
  });
  return (proposalCore ? proposalCore.finalizeReview : finalizeReview)(request,assembled);
}
if (typeof module !== 'undefined') module.exports = { assembleReview: assembleReview };
