'use strict';
const {hash,fail,id,pagination,tokens}=require('./context-contract');
// Every branch is scoped before aggregation; no cross-project vector or global source index is queried.
const PROFILE_HASH_SQL="encode(sha256(convert_to('{'||"+['budget','client_name','company_info','feedback_limit','notes','project_scope','schedule'].map(k=>`'"${k}":'||to_json(p.${k})::text`).join("||','||")+"||'}','UTF8')),'hex')";
// Compare the exact catalog snapshot used by decorate(), including historical refs
// that predate explicit source-version metadata. Leaf lookups stay project/type/id scoped.
const RAW_CATALOG_SQL=catalogSql('false','false');
const SOURCE_HASH_SQL="encode(sha256(convert_to('{'||"+['approved','domain_id','evidence_changed','id','source_version','status','text','title','type'].map(k=>`'"${k}":'||COALESCE(to_json(${k==='text'?"COALESCE(current_source.text,'')":'current_source.'+k})::text,'null')`).join("||','||")+"||'}','UTF8')),'hex')";
const PROVENANCE_MAX_DEPTH=12,PROVENANCE_MAX_NODES=256;
const PROVENANCE_NODES_CTE=`question_provenance_nodes AS MATERIALIZED (SELECT 'question'::text AS type,id,COALESCE(source_refs,'[]'::jsonb)||COALESCE(answer->'source_refs','[]'::jsonb) AS refs FROM project_questions WHERE project_id=$1 UNION ALL SELECT 'context_record',id,COALESCE(payload->'source_refs','[]'::jsonb) FROM context_records WHERE project_id=$1)`;
function questionLineageSql(root){return `WITH RECURSIVE question_lineage(type,id,refs,path,depth,cycle) AS (
 SELECT 'question'::text,${root}.id,COALESCE(${root}.source_refs,'[]'::jsonb)||COALESCE(${root}.answer->'source_refs','[]'::jsonb),ARRAY['question:'||${root}.id::text],0,false
 UNION ALL
 SELECT edge->>'type',(edge->>'id')::uuid,child.refs,walk.path||((edge->>'type')||':'||(edge->>'id')),walk.depth+1,((edge->>'type')||':'||(edge->>'id'))=ANY(walk.path)
 FROM question_lineage walk CROSS JOIN LATERAL jsonb_array_elements(walk.refs) edge
 JOIN question_provenance_nodes child ON child.type=edge->>'type' AND child.id=(edge->>'id')::uuid WHERE NOT walk.cycle AND walk.depth<${PROVENANCE_MAX_DEPTH}
), bounded_question_lineage AS MATERIALIZED (SELECT * FROM question_lineage LIMIT ${PROVENANCE_MAX_NODES+1})`;}
const QUESTION_STALE_SQL=`EXISTS(${questionLineageSql('q')}
 SELECT 1 FROM bounded_question_lineage walk WHERE walk.cycle
 OR (walk.depth=${PROVENANCE_MAX_DEPTH} AND EXISTS(SELECT 1 FROM jsonb_array_elements(walk.refs) edge WHERE edge->>'type' IN ('question','context_record')))
 OR (SELECT count(*) FROM bounded_question_lineage)>${PROVENANCE_MAX_NODES}
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(walk.refs) evidence WHERE NOT EXISTS(
  SELECT 1 FROM question_source_snapshots current_source WHERE current_source.type=evidence->>'type' AND current_source.id=(evidence->>'id')::uuid
  AND NOT current_source.evidence_changed AND current_source.snapshot_sha256=evidence->>'sha256'
 )))`;
async function questionEvidence(db,p,qid){const result=await db.query(`WITH ${PROVENANCE_NODES_CTE} SELECT evidence.* FROM project_questions root_q CROSS JOIN LATERAL (${questionLineageSql('root_q')} SELECT DISTINCT edge->>'type' AS type,edge->>'id' AS id FROM bounded_question_lineage walk CROSS JOIN LATERAL jsonb_array_elements(walk.refs) edge) evidence WHERE root_q.project_id=$1 AND root_q.id=$2`,[p,id(qid)]);return result.rows;}
// Changed or withdrawn evidence remains in history but cannot be presented as current approved knowledge.
function directRecordStaleSql(alias){return `EXISTS(SELECT 1 FROM jsonb_array_elements(${alias}.payload->'source_refs') ref WHERE
 (ref->>'type'='revision' AND EXISTS(SELECT 1 FROM revisions rv JOIN documents d ON d.id=rv.document_id AND d.project_id=rv.project_id WHERE rv.project_id=$1 AND rv.id=(ref->>'id')::uuid AND (((ref->>'approved')::boolean AND d.baseline_revision_id IS DISTINCT FROM rv.id) OR EXISTS(SELECT 1 FROM channel_inbox ci WHERE ci.project_id=$1 AND ci.revision_id=rv.id AND ci.evidence_changed))))
 OR (ref->>'type'='channel_inbox' AND EXISTS(SELECT 1 FROM channel_inbox ci WHERE ci.project_id=$1 AND ci.id=(ref->>'id')::uuid AND ci.evidence_changed))
 OR (ref->>'type'='question' AND EXISTS(SELECT 1 FROM project_questions q JOIN question_evidence_state qe ON qe.id=q.id WHERE q.project_id=$1 AND q.id=(ref->>'id')::uuid AND (q.version::text IS DISTINCT FROM ref->>'source_version' OR qe.evidence_changed)))
 OR (ref->>'type'='work_item' AND EXISTS(SELECT 1 FROM work_items w WHERE w.project_id=$1 AND w.id=(ref->>'id')::uuid AND w.version::text IS DISTINCT FROM ref->>'source_version'))
 OR (ref->>'type'='context_record' AND EXISTS(SELECT 1 FROM context_supersessions cs WHERE cs.project_id=$1 AND cs.previous_id=(ref->>'id')::uuid))
 OR (ref->>'type'='commercial_revision' AND EXISTS(SELECT 1 FROM commercial_document_revisions cr JOIN commercial_documents d ON d.id=cr.document_id AND d.project_id=cr.project_id JOIN commercial_profiles p ON p.project_id=cr.project_id LEFT JOIN LATERAL(SELECT decision,profile_sha256 FROM commercial_decisions WHERE project_id=$1 AND revision_id=cr.id ORDER BY created_at DESC,id DESC LIMIT 1) cd ON true WHERE cr.project_id=$1 AND cr.id=(ref->>'id')::uuid AND (d.latest_revision_id<>cr.id OR ((ref->>'approved')::boolean AND (cd.decision IS DISTINCT FROM 'approved' OR cd.profile_sha256 IS DISTINCT FROM ${PROFILE_HASH_SQL})))))
)`;}
// Context records may cite earlier context records. Walk that lineage so derived knowledge
// cannot hide a withdrawn original source behind an otherwise unchanged intermediate record.
const RECORD_STALE_BODY=`EXISTS(WITH RECURSIVE lineage(id) AS (
 SELECT r.id UNION SELECT (ref->>'id')::uuid FROM lineage l
 JOIN context_records parent ON parent.project_id=$1 AND parent.id=l.id
 CROSS JOIN LATERAL jsonb_array_elements(parent.payload->'source_refs') ref WHERE ref->>'type'='context_record'
) SELECT 1 FROM lineage l JOIN context_records ancestor ON ancestor.project_id=$1 AND ancestor.id=l.id
 WHERE ${directRecordStaleSql('ancestor')})`;
function catalogSql(recordStale,questionStale){return `
 SELECT r.id,'revision'::text AS type,d.title,COALESCE((SELECT string_agg(s->>'text',E'\\n' ORDER BY ord) FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.document_json->'segments')='array' THEN r.document_json->'segments' ELSE '[]'::jsonb END) WITH ORDINALITY t(s,ord)),'') AS text,d.domain_id,
 CASE WHEN d.baseline_revision_id=r.id THEN 'approved' ELSE r.status END AS status,
 (COALESCE(d.baseline_revision_id=r.id,false) AND r.status='ready' AND NOT EXISTS(SELECT 1 FROM channel_inbox i WHERE i.project_id=$1 AND i.revision_id=r.id AND i.evidence_changed)) AS approved,
 COALESCE((r.history->>'source_created_at')::timestamptz,(r.history->>'occurred_on')::date::timestamp AT TIME ZONE 'Asia/Seoul',r.created_at) AS occurred_at,r.created_at AS recorded_at,r.history->>'url' AS url,d.id AS document_id,
 COALESCE(r.history->>'channel',r.history->>'source_type','file') AS channel,
 COALESCE((SELECT bool_or(i.evidence_changed) FROM channel_inbox i WHERE i.project_id=$1 AND i.revision_id=r.id),false) AS evidence_changed,
 r.sha256 AS source_version,CASE WHEN r.history->>'source_created_at' IS NOT NULL THEN 'source_timestamp' WHEN r.history->>'occurred_on' IS NOT NULL THEN 'date_only' ELSE 'recorded_fallback' END AS occurred_time_source
 FROM revisions r JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id WHERE r.project_id=$1 AND r.status='ready'
 UNION ALL
 SELECT r.id,'commercial_revision',r.title,
 COALESCE((SELECT string_agg((s->>'title')||E'\\n'||(s->>'body'),E'\\n') FROM jsonb_array_elements(r.content->'sections') s),'')||E'\\n'||COALESCE(r.content->'tables','[]'::jsonb)::text,
 NULL::uuid,CASE WHEN cd.decision='approved' AND cd.profile_sha256=${PROFILE_HASH_SQL} AND d.latest_revision_id=r.id THEN 'approved' ELSE 'unapproved' END,
 (COALESCE(cd.decision='approved' AND cd.profile_sha256=${PROFILE_HASH_SQL},false) AND d.latest_revision_id=r.id),r.created_at,r.created_at,NULL,d.id,'editor',false,r.sequence::text,'recorded_fallback'
 FROM commercial_document_revisions r JOIN commercial_documents d ON d.id=r.document_id AND d.project_id=r.project_id JOIN commercial_profiles p ON p.project_id=r.project_id
 LEFT JOIN LATERAL(SELECT decision,profile_sha256 FROM commercial_decisions WHERE project_id=$1 AND revision_id=r.id ORDER BY created_at DESC,id DESC LIMIT 1) cd ON true WHERE r.project_id=$1
 UNION ALL
 SELECT w.id,'work_item',COALESCE(w.source_task->>'title',w.source_task_id),w.source_task::text||E'\\n'||w.blocker,NULL::uuid,w.status,false,w.updated_at,w.created_at,NULL,NULL::uuid,'work_board',false,w.version::text,'source_timestamp' FROM work_items w WHERE w.project_id=$1
 UNION ALL
 SELECT i.id,'channel_inbox',s.name||' · '||i.conversation_key,
 COALESCE((SELECT string_agg((m->>'author')||': '||(m->>'text'),E'\\n') FROM jsonb_array_elements(i.input_snapshot->'messages') m),'')||E'\\n'||COALESCE(i.analysis,'{}'::jsonb)::text,
 s.default_domain_id,CASE WHEN i.evidence_changed THEN 'evidence_changed' ELSE i.status END,(i.status='accepted' AND NOT i.evidence_changed),
 COALESCE((SELECT min((m->>'sent_at')::timestamptz) FROM jsonb_array_elements(i.input_snapshot->'messages') m),i.created_at),i.created_at,
 (SELECT m->>'url' FROM jsonb_array_elements(i.input_snapshot->'messages') m WHERE m->>'url' IS NOT NULL LIMIT 1),i.document_id,s.provider||' · '||s.name,i.evidence_changed,i.input_sha256,CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(i.input_snapshot->'messages') m WHERE m->>'sent_at' IS NOT NULL) THEN 'source_timestamp' ELSE 'recorded_fallback' END
 FROM channel_inbox i JOIN channel_sources s ON s.id=i.source_id AND s.project_id=i.project_id WHERE i.project_id=$1 AND i.status='accepted'
 UNION ALL
 SELECT t.id,'transcription',t.title,t.original_transcript->>'text',t.domain_id,'transcribed',false,t.occurred_at,t.created_at,NULL,NULL::uuid,t.channel,false,t.audio_sha256||':'||t.original_sha256,'source_timestamp'
 FROM context_transcriptions t WHERE t.project_id=$1 AND t.status IN ('ready','reviewed')
 UNION ALL
 SELECT q.id,'question',q.title,q.question||E'\\n'||COALESCE(q.answer->>'text',''),NULL::uuid,CASE WHEN ${questionStale} THEN 'evidence_changed' ELSE q.status END,(q.status='resolved' AND NOT ${questionStale}),COALESCE((q.answer->>'responded_at')::timestamptz,q.asked_at,q.created_at),q.created_at,NULL,NULL::uuid,q.channel,${questionStale},q.version::text,'source_timestamp'
 FROM project_questions q WHERE q.project_id=$1
 UNION ALL
 SELECT a.id,'work_artifact',a.title,a.payload::text,NULL::uuid,'recorded',false,a.created_at,a.created_at,a.payload->>'url',NULL::uuid,'work_result',false,a.content_sha256,'source_timestamp'
 FROM work_result_artifacts a WHERE a.project_id=$1
 UNION ALL
 SELECT r.id,'context_record',r.title,r.body||E'\\n'||COALESCE(r.payload->>'rationale',''),r.domain_id,
 CASE WHEN s.previous_id IS NOT NULL THEN 'superseded' WHEN ${recordStale} THEN 'evidence_changed' ELSE 'confirmed' END,(s.previous_id IS NULL AND NOT ${recordStale}),r.occurred_at,r.created_at,NULL,NULL::uuid,r.payload->>'channel',${recordStale},r.context_version::text,'source_timestamp'
 FROM context_records r LEFT JOIN context_supersessions s ON s.previous_id=r.id AND s.project_id=r.project_id WHERE r.project_id=$1
 UNION ALL
 SELECT c.id,'candidate',c.payload->>'title',(c.payload->>'body')||E'\\n'||COALESCE(c.payload->>'rationale',''),c.domain_id,c.status,false,(c.payload->>'occurred_at')::timestamptz,c.created_at,NULL,NULL::uuid,c.payload->>'channel',false,c.content_sha256,'source_timestamp'
 FROM context_candidates c WHERE c.project_id=$1 AND c.status<>'merged'
`;}
// Materialize source hashes and question state once per project query. Keeping the
// raw UNION outside each recursive predicate avoids exponential planner/JIT work.
const PROVENANCE_CTES=`${PROVENANCE_NODES_CTE}, question_source_snapshots AS MATERIALIZED (SELECT current_source.*,${SOURCE_HASH_SQL} AS snapshot_sha256 FROM (${RAW_CATALOG_SQL}) current_source),
 question_evidence_state AS MATERIALIZED (SELECT q.id,${QUESTION_STALE_SQL} AS evidence_changed FROM project_questions q WHERE q.project_id=$1)`;
const RECORD_STALE_SQL=`EXISTS(WITH ${PROVENANCE_CTES} SELECT 1 WHERE ${RECORD_STALE_BODY})`;
const CATALOG_SQL=`WITH ${PROVENANCE_CTES}, context_evidence_state AS MATERIALIZED (SELECT r.id,${RECORD_STALE_BODY} AS evidence_changed FROM context_records r WHERE r.project_id=$1)
 SELECT c.id,c.type,c.title,c.text,c.domain_id,
 CASE WHEN c.status='superseded' THEN c.status WHEN COALESCE(qe.evidence_changed,ce.evidence_changed,false) THEN 'evidence_changed' ELSE c.status END AS status,
 (c.approved AND NOT COALESCE(qe.evidence_changed,ce.evidence_changed,false)) AS approved,
 c.occurred_at,c.recorded_at,c.url,c.document_id,c.channel,
 (c.evidence_changed OR COALESCE(qe.evidence_changed,ce.evidence_changed,false)) AS evidence_changed,c.source_version,c.occurred_time_source
 FROM question_source_snapshots c LEFT JOIN question_evidence_state qe ON c.type='question' AND qe.id=c.id LEFT JOIN context_evidence_state ce ON c.type='context_record' AND ce.id=c.id`;
function decorate(row,{excerpt=false}={}){const full=String(row.text||'');const record={...row,occurred_at:new Date(row.occurred_at).toISOString(),recorded_at:new Date(row.recorded_at).toISOString(),internal_ref:{type:row.type,id:row.id,...(row.document_id?{document_id:row.document_id}:{})}};record.url=/^https?:\/\//i.test(row.url||'')?row.url:null;record.sha256=hash({type:row.type,id:row.id,text:full,title:row.title,domain_id:row.domain_id,status:row.status,approved:row.approved,evidence_changed:row.evidence_changed,source_version:row.source_version});if(excerpt){record.text=full.slice(0,1600);record.text_truncated=full.length>1600;}return record;}
async function source(db,p,type,sourceId){const sql=['question','context_record'].includes(type)?CATALOG_SQL:RAW_CATALOG_SQL;const result=(await db.query(`WITH catalog AS (${sql}) SELECT * FROM catalog WHERE type=$2 AND id=$3`,[p,type,id(sourceId)])).rows[0];if(!result)fail('CONTEXT_SOURCE_NOT_FOUND','이 프로젝트에서 조회 가능한 근거를 찾을 수 없습니다.',404);return decorate(result);}
async function search(db,p,query={},approvedOnly=true){const page=pagination(query),terms=tokens(query.query);let domain=null;if(query.domain_id){domain=id(query.domain_id);if(!(await db.query('SELECT 1 FROM project_domains WHERE project_id=$1 AND id=$2',[p,domain])).rows[0])fail('CONTEXT_DOMAIN_NOT_FOUND','이 프로젝트의 업무 영역을 찾을 수 없습니다.',404);}if(query.include_unapproved!==undefined&&!['true','false',true,false].includes(query.include_unapproved))fail('INVALID_CONTEXT_INPUT','미확정 기록 포함 여부를 확인하세요.');const onlyApproved=approvedOnly&&query.include_unapproved!==true&&query.include_unapproved!=='true';
 const sql=`WITH catalog AS (${CATALOG_SQL}), matched AS (SELECT * FROM catalog WHERE ($2::uuid IS NULL OR domain_id=$2) AND (NOT $3::boolean OR approved) AND NOT EXISTS(SELECT 1 FROM unnest($4::text[]) term WHERE strpos(lower(title||E'\\n'||text||E'\\n'||COALESCE(channel,'')),term)=0)) SELECT (SELECT count(*)::int FROM matched) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page)) FROM (SELECT * FROM matched ORDER BY occurred_at DESC,id DESC LIMIT $5 OFFSET $6) page),'[]'::jsonb) AS items`;
 const result=(await db.query(sql,[p,domain,onlyApproved,terms,page.limit,page.offset])).rows[0];return {items:result.items.map(r=>decorate(r,{excerpt:true})),total:result.total,...page,has_more:page.offset+result.items.length<result.total,search_mode:'keyword',query_terms:terms,approved_only:onlyApproved};}
module.exports={CATALOG_SQL,RECORD_STALE_SQL,decorate,source,search,questionEvidence};
