import { List, ListItem } from './ctds-lists.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, Sparkles } from 'lucide-react';
import { Badge, Button, ErrorNotice, FormField, Spinner, projectPath, Input, Textarea, ControlButton, Disclosure, Notice } from './ui.jsx';

const LABELS = {queued:'실행 대기',running:'Nora 분석 중',waiting_approval:'분석 검토 대기',finalizing:'검토 결과 처리 중',ready:'분석 완료',rejected:'반려됨',failed:'분석 실패',uncertain:'실행 확인 필요'};
const ACTIVE = new Set(['queued','running','waiting_approval','finalizing']);
export function WorkAIReviewPanel({project,request,targetType,targetId,canWrite,canReview,onChanged,onDirty,onOpenSource}) {
  const route = `${projectPath(project.id)}/work-ai/runs`;
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(null),[reason,setReason]=useState(''),[ack,setAck]=useState(false);
  const pending=useRef(null),alive=useRef(true),sequence=useRef(0);
  const load=useCallback(async()=>{const seq=++sequence.current;try{const result=await request(route);if(alive.current&&sequence.current===seq)setData(result);}catch(e){if(alive.current)setError(e);}},[route,request]);
  useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;sequence.current++;};},[load]);
  const runs=(data?.runs||[]).filter(r=>r.target_type===targetType&&r.target_id===targetId),run=runs[0],result=run?.result||run?.reviewed_candidate;
  useEffect(()=>{if(!run||!ACTIVE.has(run.status))return;const timer=setInterval(()=>{if(!document.hidden)load();},4000);return()=>clearInterval(timer);},[run?.status,load]);
  useEffect(()=>{setReason('');setAck(false);pending.current=null;},[targetType,targetId]);
  useEffect(()=>{onDirty?.(Boolean(reason.trim()||busy));},[reason,busy,onDirty]);
  useEffect(()=>()=>onDirty?.(false),[onDirty]);
  async function action(suffix,body){setBusy(true);setError(null);try{await request(`${route}${suffix}`,{method:'POST',body});if(!alive.current)return;pending.current=null;setReason('');setAck(false);await load();await onChanged?.();}catch(e){if(alive.current)setError(e);}finally{if(alive.current)setBusy(false);}}
  function start(){pending.current ||= {request_id:crypto.randomUUID(),target_type:targetType,target_id:targetId};return action('',pending.current);}
  return <section className="wg-ai" aria-label="Nora 업무 분석"><div className="inline-actions"><h3>Nora 상세 분석</h3><Button variant="secondary" icon={RefreshCw} disabled={busy} onClick={load}>상태 확인</Button>{canWrite?<Button icon={Sparkles} disabled={!data?.enabled||busy||Boolean(run&&ACTIVE.has(run.status))} onClick={start}>{pending.current?'같은 요청 확인':'근거 분석 요청'}</Button>:null}</div>
    <p className="muted">정책·요구사항·결과물의 내용을 대조합니다. 분석을 확인한 뒤 적용하면 업무 검토에 연결되며, 작업 범위 승인은 별도로 진행합니다.</p>
    {data&&!data.enabled?<Notice className="notice warning">Nora 업무 분석 연결이 설정되지 않았습니다. 기본 점검 결과는 계속 검토할 수 있습니다.</Notice>:null}
    <ErrorNotice error={error}/>
    {run?<article><Badge tone={run.status==='ready'?'green':run.status==='waiting_approval'?'amber':'quiet'}>{LABELS[run.status]}</Badge>{!result&&ACTIVE.has(run.status)?<Spinner label="Nora가 고정된 작업 근거를 분석하고 있습니다"/>:null}
      {result?<><p>{result.summary}</p><List aria-label="분석 확인 사항">{result.findings?.map((f,i)=><ListItem key={i}><ListItem.Title>{f.severity==='blocking'?'진행 전 해결 필요':f.severity==='review'?'검토 필요':'참고'}</ListItem.Title><ListItem.Description>{f.message}</ListItem.Description>{f.question?<p>확인 질문: {f.question}</p>:null}<ListItem.Meta>{f.source_ids.map(key=>{const ref=run.source_refs.find(s=>`${s.type}:${s.id}`===key);return ref?<ControlButton type="button" className="text-button" key={key} onClick={()=>onOpenSource?.(ref)}>{ref.title||'근거 확인'}</ControlButton>:null;})}</ListItem.Meta></ListItem>)}</List>
      {result.resources?.length?<Disclosure><summary>제안한 영향 범위 {result.resources.length}개</summary><List>{result.resources.map((r,i)=><ListItem key={i}><ListItem.Title>{r.key}</ListItem.Title><ListItem.Description>{r.reason}</ListItem.Description></ListItem>)}</List></Disclosure>:null}
      {result.coverage?.length?<Disclosure open><summary>요구사항별 대조 결과</summary><List>{result.coverage.map(c=><ListItem key={c.requirement_id}><ListItem.Title>{c.requirement_id}</ListItem.Title><ListItem.Description>{c.reason}</ListItem.Description><ListItem.Meta>{{satisfied:'반영 근거 있음',missing:'누락 가능',unknown:'근거 부족'}[c.status]}</ListItem.Meta></ListItem>)}</List></Disclosure>:null}
      {result.category?<p>분류 제안: {{in_scope_maintenance:'기존 범위 내 유지보수',bug_fix:'Bug Fix',requirement_change:'기존 요구사항 변경',new_feature:'신규 기능',commercial_review:'추가 비용·계약 협의',uncertain:'추가 확인 필요'}[result.category]}</p>:null}</>:null}
      {run.status==='uncertain'?<Notice className="notice warning">Nora 실행 결과를 확인해야 합니다. 동일 작업을 자동 재실행하지 않습니다.</Notice>:null}
      {(run.status==='waiting_approval'||run.status==='uncertain'&&result||run.status==='ready'&&!run.decision)?<><FormField label="Nora 분석 검토 의견"><Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} maxLength={4000} disabled={!canReview||busy}/></FormField><label className="checkbox-label"><Input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={!canReview||busy}/>근거와 분석 내용을 확인했습니다.</label><div className="inline-actions"><Button variant="secondary" disabled={!canReview||busy||!reason.trim()} onClick={()=>action(`/${run.id}/decision`,{decision:'rejected',reason:reason.trim(),expected_sha256:run.reviewed_sha256})}>분석 반려</Button><Button icon={Check} disabled={!canReview||busy||!reason.trim()||!ack||run.status==='uncertain'} onClick={()=>action(`/${run.id}/decision`,{decision:'approved',reason:reason.trim(),expected_sha256:run.reviewed_sha256})}>분석 결과 확인</Button></div></>:null}
      {run.status==='ready'?<Button disabled={!canReview||busy||!run.decision||run.applied} onClick={()=>action(`/${run.id}/apply`,{expected_sha256:run.reviewed_sha256})}>{run.applied?'업무 검토에 적용됨':'업무 검토에 적용'}</Button>:null}
      {run.error_code?<small>{run.error_code}</small>:null}
    </article>:null}
  </section>;
}
