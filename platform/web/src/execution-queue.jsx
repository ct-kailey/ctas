import { List, ListItem } from './ctds-lists.jsx';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
import { Button, ErrorNotice, FormField, projectPath, dateTime, Input, Disclosure } from './ui.jsx';
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function ExecutionQueueSettings({project,request,onDirty}){const route=projectPath(project.id),[data,setData]=useState(null),[label,setLabel]=useState('업무 실행기'),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null),[issued,setIssued]=useState(null),alive=useRef(true);const load=useCallback(async()=>{try{const d=await request(`${route}/execution-agents`);if(alive.current)setData(d);}catch(e){if(alive.current)setError(e);}},[route,request]);useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;};},[load]);useEffect(()=>{onDirty?.(busy||ack);},[busy,ack,onDirty]);useEffect(()=>()=>onDirty?.(false),[onDirty]);async function create(){setBusy(true);setError(null);try{const d=await request(`${route}/execution-agents`,{method:'POST',body:{label,acknowledge_execution:ack}});if(alive.current){setIssued(d);setAck(false);download(d.config,d.filename);await load();}}catch(e){if(alive.current)setError(e);}finally{if(alive.current)setBusy(false);}}async function revoke(id){setBusy(true);try{await request(`${route}/execution-agents/${id}/revoke`,{method:'POST',body:{}});if(issued?.agent_id===id)setIssued(null);await load();}catch(e){setError(e);}finally{setBusy(false);}}
 const activeAgents = (data?.agents || []).filter(agent => !agent.revoked_at && new Date(agent.expires_at) >= new Date());
 return <section className="settings-section ains-section-stack" aria-label="승인 작업 자동 실행">
  <div className="inline-actions"><h2>PC 실행기</h2><Button type="button" variant="ghost" icon={RefreshCw} onClick={load} disabled={busy}>새로고침</Button></div>
  <p>승인한 코드 작업을 연결된 PC에서 실행합니다. 작업 전 점검에 문제가 있으면 보류합니다.</p>
  <ErrorNotice error={error}/>
  {data?.agents?.length ? <List className="ains-prose-list">{data.agents.map(a=><ListItem key={a.id}><ListItem.Title>{a.label}</ListItem.Title> · {a.revoked_at?'연결 해제':new Date(a.expires_at)<new Date()?'만료':'연결됨'} · 마지막 확인 {a.last_poll_at?dateTime(a.last_poll_at):'대기'} {!a.revoked_at?<Button type="button" variant="ghost" disabled={busy} onClick={()=>revoke(a.id)}>연결 해제</Button>:null}</ListItem>)}</List> : null}
  <Disclosure open={!activeAgents.length || ack || Boolean(issued)}><summary>{activeAgents.length ? 'PC 실행기 추가' : 'PC 실행기 연결'}</summary><div className="ains-section-stack">
   <p>PC에 Node.js·Git·Codex 로그인이 필요합니다. PC가 켜져 있어야 작업이 실행됩니다.</p>
   <FormField label="실행기 이름"><Input maxLength={100} value={label} onChange={e=>setLabel(e.target.value)} disabled={busy}/></FormField>
   <label className="checkbox-label"><Input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy}/>이 프로젝트에서 승인한 실행 요청을 연결한 PC에서 자동으로 수행합니다.</label>
   <div className="inline-actions"><Button type="button" disabled={busy||!ack||!label.trim()} onClick={create}>연결 파일 만들기</Button>{issued?<Button type="button" variant="secondary" icon={Download} onClick={()=>download(issued.config,issued.filename)}>연결 파일 다시 받기</Button>:null}</div>
   <div className="inline-actions"><Button asChild type="button" variant="ghost"><a href={`${route}/execution-agent-script`}>대기 실행 스크립트</a></Button><Button asChild type="button" variant="ghost"><a href={`${route}/implementation-runner-script`}>코드 실행 스크립트</a></Button></div>
   <p>세 파일을 같은 폴더에 저장하고 아래 명령을 실행하세요. 연결 파일은 30일 뒤 만료되며 키는 다시 조회할 수 없습니다.</p>
   <pre className="ctx-body-text">node watch-execution-queue.cjs --config ains-execution-agent.json</pre>
  </div></Disclosure>
  {data?.claims?.length?<Disclosure><summary>실행 이력 {data.claims.length}건</summary><List className="ains-prose-list">{data.claims.map(c=><ListItem key={c.request_id}><ListItem.Title>{c.status}</ListItem.Title><ListItem.Meta><time>{dateTime(c.created_at)}</time>{c.error_code ? <><ListItem.MetaDivider /><code>{c.error_code}</code></> : null}</ListItem.Meta></ListItem>)}</List></Disclosure>:null}
 </section>;
}
