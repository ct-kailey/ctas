'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {membership}=require('./context-ledger');
const catalog=require('./context-sources');
const {fail,id,text,tokens}=require('./context-contract');
const provider=require('./semantic-provider');
const LIMITS=Object.freeze({sources:500,chunks:2000,sourceChunks:32,dailyBytes:500000,dailyQueries:200,batchBytes:48000,batchChunks:16});
const REVIEWERS=['owner','reviewer'];
const key=s=>`${s.type||s.source_type}:${s.id||s.source_id}`;
async function approved(db,p,domain=null){return (await db.query(`WITH catalog AS (${catalog.CATALOG_SQL}) SELECT *,count(*) OVER() AS approved_count FROM catalog WHERE approved AND NOT evidence_changed AND ($2::uuid IS NULL OR domain_id=$2) ORDER BY occurred_at DESC,id DESC LIMIT $3`,[p,domain,LIMITS.sources+1])).rows.map(r=>catalog.decorate(r));}
function lexical(query,source,chunk) {const terms=tokens(query);if(!terms.length)return 0;const title=source.title.toLowerCase(),body=chunk.toLowerCase();return terms.reduce((n,t)=>n+(title.includes(t)?1:body.includes(t)?.65:0),0)/terms.length;}
function rank(query,current,stored,queryVector,config,limit=10) {
 const sources=new Map(current.map(s=>[key(s),s])),best=new Map();
 for(const row of stored){const source=sources.get(`${row.source_type}:${row.source_id}`);if(!source||!source.approved||source.evidence_changed||source.sha256!==row.source_sha256||row.model!==config.model||row.dimensions!==config.dimensions||row.status!=='ready'||!Array.isArray(row.vector)||row.vector.length!==config.dimensions)continue;
  let vector;try{vector=provider.normalize(row.vector,config.dimensions);}catch{continue;}
  const similarity=provider.cosine(queryVector,vector),keyword=lexical(query,source,row.chunk_text);if(similarity<.2&&keyword===0)continue;
  const score=.8*Math.max(0,similarity)+.2*keyword,previous=best.get(key(source));
  if(!previous||previous.score<score)best.set(key(source),{...source,text:row.chunk_text.slice(0,1600),text_truncated:row.chunk_text.length>1600,score,semantic_similarity:similarity,keyword_score:keyword,chunk_number:row.chunk_number,match_type:keyword>0?'hybrid':'semantic'});
 }
 return [...best.values()].sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);
}
function createSemanticService(pool,{resolveConfig=async()=>({}),fetchImpl=fetch,embed=provider.embed}={}) {
 const configuration=async p=>provider.configuration(await resolveConfig(p)||{});
 async function reserve(db,p,bytes,query=false) {await db.query('INSERT INTO context_semantic_usage(project_id) VALUES($1) ON CONFLICT DO NOTHING',[p]);const r=await db.query(`UPDATE context_semantic_usage SET reserved_bytes=reserved_bytes+$2,query_requests=query_requests+$3 WHERE project_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date AND reserved_bytes+$2<=$4 AND query_requests+$3<=$5 RETURNING *`,[p,bytes,query?1:0,LIMITS.dailyBytes,LIMITS.dailyQueries]);return r.rows[0]||null;}
 async function reconcile(p,config,{retryFailed=false}={}) {return transaction(pool,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-semantic:'||$1,0))",[p]);
  const setting=(await db.query('SELECT * FROM context_semantic_settings WHERE project_id=$1 FOR UPDATE',[p])).rows[0];if(!setting?.enabled)return {queued:0};
  const all=await approved(db,p),current=all.slice(0,LIMITS.sources),keep=[];let truncated=0,excluded=Math.max(0,Number(all[0]?.approved_count||0)-LIMITS.sources),indexedSources=0;
  for(const s of current){const pieces=provider.chunks(`${s.title}\n${s.text}`);if(!pieces.items.length)continue;if(keep.length>=LIMITS.chunks){excluded++;continue;}const selected=pieces.items.slice(0,LIMITS.chunks-keep.length);if(pieces.truncated||selected.length<pieces.items.length)truncated++;indexedSources++;
   for(const c of selected){const r=(await db.query(`INSERT INTO context_semantic_chunks(project_id,source_type,source_id,source_sha256,domain_id,chunk_number,chunk_text,chunk_sha256,model,dimensions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(project_id,source_type,source_id,chunk_number) DO UPDATE SET source_sha256=EXCLUDED.source_sha256,domain_id=EXCLUDED.domain_id,chunk_text=EXCLUDED.chunk_text,chunk_sha256=EXCLUDED.chunk_sha256,model=EXCLUDED.model,dimensions=EXCLUDED.dimensions,status='queued',vector=NULL,attempts=0,lease_id=NULL,lease_until=NULL,retry_at=now(),error_code=NULL,indexed_at=NULL,updated_at=now()
    WHERE context_semantic_chunks.source_sha256<>EXCLUDED.source_sha256 OR context_semantic_chunks.chunk_sha256<>EXCLUDED.chunk_sha256 OR context_semantic_chunks.model<>EXCLUDED.model OR context_semantic_chunks.dimensions<>EXCLUDED.dimensions OR ($11::boolean AND context_semantic_chunks.status='failed') RETURNING id`,[p,s.type,s.id,s.sha256,s.domain_id,c.index,c.text,c.sha256,config.model,config.dimensions,retryFailed])).rows[0];
    if(r)keep.push(r.id);else keep.push((await db.query('SELECT id FROM context_semantic_chunks WHERE project_id=$1 AND source_type=$2 AND source_id=$3 AND chunk_number=$4',[p,s.type,s.id,c.index])).rows[0].id);
   }
  }
  await db.query('DELETE FROM context_semantic_chunks WHERE project_id=$1 AND NOT(id=ANY($2::uuid[]))',[p,keep]);
  await db.query("UPDATE context_semantic_settings SET model=$2,dimensions=$3,next_sync_at=now()+interval '5 minutes',last_synced_at=now(),source_count=$4,excluded_sources=$5,truncated_sources=$6,last_error=NULL,updated_at=now() WHERE project_id=$1",[p,config.model,config.dimensions,indexedSources,excluded,truncated]);
  return {chunks:keep.length,sources:indexedSources,excluded_sources:excluded,truncated_sources:truncated};
 });}
 async function status(p,u) {await membership(pool,p,u);let config,error=null;try{config=await configuration(p);}catch(e){error=e.code||'SEMANTIC_CONFIG_INVALID';config={};}
  const [settings,counts,usage]=await Promise.all([pool.query('SELECT * FROM context_semantic_settings WHERE project_id=$1',[p]),pool.query('SELECT status,count(*)::int n FROM context_semantic_chunks WHERE project_id=$1 GROUP BY status',[p]),pool.query("SELECT reserved_bytes,query_requests FROM context_semantic_usage WHERE project_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date",[p])]);const s=settings.rows[0];return {configured:Boolean(config.apiKey),enabled:Boolean(s?.enabled),provider:'openai',model:config.model||null,dimensions:config.dimensions||null,counts:Object.fromEntries(counts.rows.map(r=>[r.status,r.n])),last_synced_at:s?.last_synced_at||null,source_count:s?.source_count||0,excluded_sources:s?.excluded_sources||0,truncated_sources:s?.truncated_sources||0,error_code:error||s?.last_error||null,model_changed:Boolean(s&&config.model&&(s.model!==config.model||s.dimensions!==config.dimensions)),limits:LIMITS,usage:usage.rows[0]||{reserved_bytes:0,query_requests:0},search_mode:s?.enabled&&config.apiKey?'hybrid':'keyword'};
 }
 async function rebuild(p,u,{enabled=true}={}) {await membership(pool,p,u,REVIEWERS);if(typeof enabled!=='boolean')fail('INVALID_CONTEXT_INPUT','색인 사용 여부를 확인하세요.');const config=await configuration(p);if(enabled&&!config.apiKey)fail('SEMANTIC_NOT_CONFIGURED','프로젝트 AI 연결에서 OpenAI 키를 설정하세요.',503);
  await pool.query('INSERT INTO context_semantic_settings(project_id,enabled,model,dimensions,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id) DO UPDATE SET enabled=$2,updated_by=$5,next_sync_at=now(),updated_at=now()',[p,enabled,config.model,config.dimensions,u]);
  if(enabled)await reconcile(p,config,{retryFailed:true});else await pool.query('DELETE FROM context_semantic_chunks WHERE project_id=$1',[p]);
  return status(p,u);
 }
 async function fallback(p,u,query,reason) {await membership(pool,p,u);const result=await catalog.search(pool,p,{query:query.query,domain_id:query.domain_id,limit:query.limit||10},true);return {...result,search_mode:'keyword',fallback_reason:reason,generated_answer:false};}
 async function search(p,u,query={}) {await membership(pool,p,u);const q=text(query.query,'검색어',500),domain=query.domain_id?id(query.domain_id):null,limit=Number(query.limit||10);if(!Number.isInteger(limit)||limit<1||limit>30)fail('INVALID_CONTEXT_PAGE','검색 결과는 1~30건까지 조회할 수 있습니다.');if(domain&&!(await pool.query('SELECT 1 FROM project_domains WHERE project_id=$1 AND id=$2',[p,domain])).rows[0])fail('CONTEXT_DOMAIN_NOT_FOUND','이 프로젝트의 업무 영역을 선택하세요.',404);
  let config;try{config=await configuration(p);}catch(e){return fallback(p,u,{...query,query:q},e.code);}
  const setting=(await pool.query('SELECT * FROM context_semantic_settings WHERE project_id=$1',[p])).rows[0];if(!config.apiKey||!setting?.enabled)return fallback(p,u,{...query,query:q},!config.apiKey?'SEMANTIC_NOT_CONFIGURED':'SEMANTIC_DISABLED');
  const stored=(await pool.query("SELECT source_type,source_id,source_sha256,chunk_text,chunk_number,model,dimensions,status,vector FROM context_semantic_chunks WHERE project_id=$1 AND status='ready' AND model=$2 AND dimensions=$3 AND ($4::uuid IS NULL OR domain_id=$4) ORDER BY source_id,chunk_number LIMIT $5",[p,config.model,config.dimensions,domain,LIMITS.chunks])).rows;
  if(!stored.length)return fallback(p,u,{...query,query:q},'SEMANTIC_INDEX_PENDING');
  if(!await transaction(pool,db=>reserve(db,p,Buffer.byteLength(q),true)))return fallback(p,u,{...query,query:q},'SEMANTIC_DAILY_LIMIT');
  let vector;try{[vector]=await embed([q],config,{fetchImpl});}catch(e){return fallback(p,u,{...query,query:q},e.code||'SEMANTIC_PROVIDER_UNAVAILABLE');}
  // Re-read approval and hashes AFTER the remote call; stored vectors never establish permission or currency.
  await membership(pool,p,u);const current=(await approved(pool,p,domain)).slice(0,LIMITS.sources),ranked=rank(q,current,stored,vector,config,limit);
  const lexicalResult=await catalog.search(pool,p,{query:q,domain_id:domain,limit},true);
  const items=[...ranked];for(const s of lexicalResult.items)if(!items.some(r=>key(r)===key(s))&&items.length<limit)items.push({...s,match_type:'keyword',score:null});
  return {items,total:items.length,has_more:false,search_mode:'hybrid',query_terms:tokens(q),approved_only:true,generated_answer:false,model:config.model,dimensions:config.dimensions,coverage:{indexed_chunks:stored.length,max_sources:LIMITS.sources,max_chunks:LIMITS.chunks,excluded_sources:setting.excluded_sources,truncated_sources:setting.truncated_sources},limit};
 }
 async function workerTick() {
  const projects=(await pool.query("SELECT s.* FROM context_semantic_settings s WHERE enabled AND (next_sync_at<=now() OR EXISTS(SELECT 1 FROM context_semantic_chunks c WHERE c.project_id=s.project_id AND (c.status='queued' AND c.retry_at<=now() OR c.status='running' AND c.lease_until<now()))) ORDER BY next_sync_at,project_id LIMIT 10")).rows;
  let processed=0;for(const setting of projects){const p=setting.project_id;let config;try{config=await configuration(p);if(!config.apiKey)fail('SEMANTIC_NOT_CONFIGURED','AI 연결이 필요합니다.',503);if(new Date(setting.next_sync_at)<=new Date()||setting.model!==config.model||setting.dimensions!==config.dimensions)await reconcile(p,config);}catch(e){await pool.query("UPDATE context_semantic_settings SET last_error=$2,next_sync_at=now()+interval '5 minutes' WHERE project_id=$1",[p,e.code||'SEMANTIC_CONFIG_INVALID']);await pool.query("UPDATE context_semantic_chunks SET retry_at=now()+interval '5 minutes' WHERE project_id=$1 AND status='queued'",[p]);continue;}
   const lease=randomUUID();const batch=await transaction(pool,async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-semantic:'||$1,0))",[p]);
    await db.query("UPDATE context_semantic_chunks SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error_code='SEMANTIC_LEASE_EXPIRED',lease_id=NULL,lease_until=NULL WHERE project_id=$1 AND status='running' AND lease_until<now()",[p]);
    const rows=(await db.query("SELECT * FROM context_semantic_chunks WHERE project_id=$1 AND status='queued' AND attempts<3 AND retry_at<=now() AND model=$2 AND dimensions=$3 ORDER BY retry_at,id LIMIT $4 FOR UPDATE SKIP LOCKED",[p,config.model,config.dimensions,LIMITS.batchChunks])).rows;
    const chosen=[];let bytes=0;for(const row of rows){const b=Buffer.byteLength(row.chunk_text);if(bytes+b>LIMITS.batchBytes)break;bytes+=b;chosen.push(row);}if(!chosen.length)return [];
    if(!await reserve(db,p,bytes)){await db.query("UPDATE context_semantic_chunks SET retry_at=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'+interval '1 day',error_code='SEMANTIC_DAILY_LIMIT' WHERE project_id=$1 AND status='queued'",[p]);await db.query("UPDATE context_semantic_settings SET last_error='SEMANTIC_DAILY_LIMIT' WHERE project_id=$1",[p]);return [];}
    await db.query("UPDATE context_semantic_chunks SET status='running',attempts=attempts+1,lease_id=$2,lease_until=now()+interval '2 minutes',updated_at=now() WHERE project_id=$1 AND id=ANY($3::uuid[])",[p,lease,chosen.map(r=>r.id)]);return chosen;
   });if(!batch.length)continue;
   try {
    const before=new Map((await approved(pool,p)).slice(0,LIMITS.sources).map(s=>[key(s),s]));const valid=batch.filter(r=>before.get(`${r.source_type}:${r.source_id}`)?.sha256===r.source_sha256);
    const invalid=batch.filter(r=>!valid.includes(r));if(invalid.length)await pool.query('DELETE FROM context_semantic_chunks WHERE project_id=$1 AND lease_id=$2 AND id=ANY($3::uuid[])',[p,lease,invalid.map(r=>r.id)]);if(!valid.length)continue;
    const vectors=await embed(valid.map(r=>r.chunk_text),config,{fetchImpl});const after=new Map((await approved(pool,p)).slice(0,LIMITS.sources).map(s=>[key(s),s]));
    for(const [i,row] of valid.entries()){if(after.get(`${row.source_type}:${row.source_id}`)?.sha256!==row.source_sha256){await pool.query('DELETE FROM context_semantic_chunks WHERE project_id=$1 AND id=$2 AND lease_id=$3',[p,row.id,lease]);continue;}await pool.query("UPDATE context_semantic_chunks SET status='ready',vector=$4,lease_id=NULL,lease_until=NULL,indexed_at=now(),updated_at=now(),error_code=NULL WHERE project_id=$1 AND id=$2 AND lease_id=$3 AND status='running'",[p,row.id,lease,provider.normalize(vectors[i],config.dimensions)]);processed++;}
    await pool.query('UPDATE context_semantic_settings SET last_error=NULL WHERE project_id=$1',[p]);
   }catch(e){const code=/^SEMANTIC_[A-Z_]+$/.test(e.code||'')?e.code:'SEMANTIC_PROVIDER_UNAVAILABLE',retryable=['SEMANTIC_TIMEOUT','SEMANTIC_CONNECTION_FAILED','SEMANTIC_RATE_LIMIT','SEMANTIC_PROVIDER_UNAVAILABLE'].includes(code);await pool.query("UPDATE context_semantic_chunks SET status=CASE WHEN attempts>=3 OR NOT $4 THEN 'failed' ELSE 'queued' END,lease_id=NULL,lease_until=NULL,error_code=$3,retry_at=now()+CASE WHEN attempts=1 THEN interval '1 minute' ELSE interval '5 minutes' END,updated_at=now() WHERE project_id=$1 AND lease_id=$2 AND status='running'",[p,lease,code,retryable]);await pool.query('UPDATE context_semantic_settings SET last_error=$2 WHERE project_id=$1',[p,code]);}
  }return {processed};
 }
 return {status,rebuild,search,workerTick,reconcile};
}
module.exports={createSemanticService,LIMITS,rank,lexical};
