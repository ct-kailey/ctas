'use strict';
const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {membership}=require('./context-ledger');
const {assertCurrent,audit}=require('./work-ai-ledger');
const {validateCompletedResult}=require('../../nora/work-review/contract');
const native=require('../../nora/work-review/client');
function createWorkAIWorker({pool,token,enabled=Boolean(token),client=native,pollMs=2000,onError=()=>{}}){
 const workerId=randomUUID(),active=new Map();let timer,stopped=false,ticking=false;
 async function claim(){return transaction(pool,async db=>{const r=(await db.query("SELECT * FROM work_ai_runs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!r)return null;await db.query("UPDATE work_ai_runs SET status='running',worker_id=$2,started_at=now(),heartbeat_at=now(),updated_at=now() WHERE id=$1",[r.id,workerId]);return r;});}
 async function recover(){await pool.query("UPDATE work_ai_runs SET status='uncertain',error_code='WORK_AI_WORKER_INTERRUPTED',updated_at=now() WHERE status IN('running','waiting_approval','finalizing') AND heartbeat_at<now()-interval '90 seconds'");}
 async function execute(r,controller){let invoked=false;const beat=setInterval(()=>pool.query('UPDATE work_ai_runs SET heartbeat_at=now() WHERE id=$1 AND worker_id=$2',[r.id,workerId]).catch(onError),20000);beat.unref();try{
 await membership(pool,r.project_id,r.created_by,['owner','reviewer','member']);await assertCurrent(pool,r);invoked=true;
 const raw=await client.startWorkReview(r.request,{expectedProjectId:r.project_id,token,signal:controller.signal});
 const current=(await pool.query('SELECT * FROM work_ai_runs WHERE id=$1',[r.id])).rows[0];if(current.status==='rejected')return;
 if(!current.approval_id||!current.reviewed_candidate)throw Object.assign(new Error('Approval webhook was not verified'),{code:'WORK_AI_APPROVAL_MISSING'});
 const approval=await client.getApproval(current.approval_id);
 const completed=validateCompletedResult(raw,current.request,current.project_id,{approval,reviewedCandidate:current.reviewed_candidate});
 // This never commits project knowledge. A reviewer must still merge each candidate.
 await transaction(pool,async db=>{const locked=(await db.query('SELECT * FROM work_ai_runs WHERE id=$1 FOR UPDATE',[r.id])).rows[0];if(locked.status==='rejected')return;await db.query("UPDATE work_ai_runs SET status='ready',result=$2,error_code=NULL,updated_at=now() WHERE id=$1",[r.id,JSON.stringify(completed.candidate)]);await audit(db,r,null,'completed',{item_count:completed.candidate.findings.length});});
 }catch(e){try{await pool.query("UPDATE work_ai_runs SET status=$3,error_code=$4,updated_at=now() WHERE id=$1 AND worker_id=$2 AND status NOT IN('ready','rejected')",[r.id,workerId,invoked?'uncertain':'failed',/^[A-Z0-9_]{1,90}$/.test(e.code||'')?e.code:'WORK_AI_AI_UNKNOWN']);}catch(err){onError(err);} }finally{clearInterval(beat);}}
 async function tick(){if(ticking||stopped||!enabled)return;ticking=true;try{await recover();if(active.size>=3)return;const r=await claim();if(!r)return;const controller=new AbortController();const promise=execute(r,controller).finally(()=>active.delete(r.id));active.set(r.id,{controller,promise});}catch(e){onError(e);}finally{ticking=false;}}
 return {tick,recover,start:async()=>{if(!enabled)return;stopped=false;await tick();timer=setInterval(tick,pollMs);timer.unref();},stop:async()=>{stopped=true;clearInterval(timer);for(const a of active.values())a.controller.abort();await Promise.allSettled([...active.values()].map(a=>a.promise));}};
}
module.exports={createWorkAIWorker};
