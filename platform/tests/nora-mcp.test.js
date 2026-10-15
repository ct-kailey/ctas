'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNoraMcpProvider,readRpc,contextSlug}=require('../server/nora-mcp');
const {RESOURCE}=require('../server/nora-oauth');
const PROJECT='project_synthetic', WORKSPACE='t_synthetic_workspace', REQUEST='request_12345678';
const input={projectId:PROJECT,workspaceId:WORKSPACE,requestId:REQUEST,name:'Synthetic'};
function fixture({facade=false,sse=false,handler=()=>({})}={}) {
  const calls=[],lookups=[];
  const oauth={getAccessToken:async args=>{lookups.push(args);return 'synthetic_project_token';}};
  const fetchImpl=async(url,options)=>{
    assert.equal(url,RESOURCE);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic_project_token');
    assert.equal(options.headers.Accept,'application/json, text/event-stream');
    if(options.method==='DELETE')return new Response(null,{status:204});
    const msg=JSON.parse(options.body);calls.push(msg);
    if(msg.method==='notifications/initialized')return new Response(null,{status:202});
    let result;
    if(msg.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{}}};
    else {
      assert.equal(options.headers['Mcp-Session-Id'],'synthetic-session');
      if(msg.method==='tools/list')result={tools:(facade?['call_tool']:['list_workspaces','list_memory_spaces','create_memory_space','upsert_memory_note','list_connectors']).map(name=>({name}))};
      else {
        const tool=facade?msg.params.arguments:msg.params;
        assert.equal(tool.arguments.workspace,WORKSPACE);
        result={content:[{type:'text',text:JSON.stringify(await handler(tool.name,tool.arguments))}]};
      }
    }
    const body=JSON.stringify({jsonrpc:'2.0',id:msg.id,result});
    return new Response(sse?`event: message\r\ndata: ${body}\r\n\r\n`:body,{headers:{'content-type':sse?'text/event-stream':'application/json','Mcp-Session-Id':'synthetic-session'}});
  };
  return {provider:createNoraMcpProvider({oauth,fetchImpl}),calls,lookups};
}
for(const sse of [false,true])for(const facade of [false,true])test(`MCP ${sse?'SSE':'JSON'} handles ${facade?'facade':'direct'} tools with exact project token and explicit workspace`,async()=>{
  const f=fixture({sse,facade,handler:()=>[{id:WORKSPACE,name:'Selected'}]});
  assert.deepEqual(await f.provider.inspectWorkspace(input),{workspaceId:WORKSPACE});
  assert.equal(f.lookups.length,1);assert.equal(f.lookups[0].projectId,PROJECT);assert.equal(f.lookups[0].workspaceId,WORKSPACE);
  assert.deepEqual(f.calls.map(c=>c.method),['initialize','notifications/initialized','tools/list','tools/call']);
});
test('SSE handles chunk boundaries, notifications, batched replies and stops before stream closes',async()=>{
  const content='event: message\r\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\ndata: [{"jsonrpc":"2.0","id":"other","result":{}},{"jsonrpc":"2.0","id":"wanted","result":{"ok":true}}]\r\n\r\n';
  let cancelled=false;
  const stream=new ReadableStream({start(c){for(const char of content)c.enqueue(new TextEncoder().encode(char));},cancel(){cancelled=true;}});
  assert.deepEqual(await readRpc(new Response(stream,{headers:{'content-type':'text/event-stream'}}),'wanted'),{ok:true});
  assert.equal(cancelled,true);
});
test('malformed JSON, mismatched IDs, oversized bodies and tool errors fail without raw upstream content',async()=>{
  for(const body of ['not-json','{"jsonrpc":"2.0","id":"wrong","result":{}}'])await assert.rejects(readRpc(new Response(body,{headers:{'content-type':'application/json'}}),'expected'),{code:'NORA_MCP_RESPONSE_INVALID'});
  await assert.rejects(readRpc(new Response('x'.repeat(100),{headers:{'content-type':'application/json'}}),'x',10),{code:'NORA_MCP_RESPONSE_INVALID'});
  await assert.rejects(readRpc(Response.json({jsonrpc:'2.0',id:'x',error:{message:'secret-upstream-token'}}),'x'),e=>e.code==='NORA_MCP_TOOL_FAILED'&&!e.message.includes('secret'));
});
test('missing token and cross-workspace attempts dispatch no HTTP requests',async()=>{
  let calls=0;const provider=createNoraMcpProvider({oauth:{getAccessToken:async()=>{throw Object.assign(new Error('Consent required'),{code:'NORA_AUTH_REQUIRED',noSideEffects:true});}},fetchImpl:async()=>{calls++;}});
  await assert.rejects(provider.inspectWorkspace(input),{code:'NORA_AUTH_REQUIRED'});
  await assert.rejects(provider.callTool({...input,name:'list_workspaces',arguments:{workspace:'t_other_workspace'}}),{code:'NORA_WORKSPACE_SCOPE_MISMATCH'});
  await assert.rejects(provider.callTool({...input,name:'list_workspaces',arguments:{onBehalfOf:{user:'other'}}}),{code:'NORA_MCP_TOOL_FORBIDDEN'});
  assert.equal(calls,0);
});
test('upstream token rejection invalidates only the token for the current project and never leaks it',async()=>{
  let invalidated;
  const provider=createNoraMcpProvider({oauth:{getAccessToken:async()=> 'synthetic-rejected',invalidateAccessToken:async value=>{invalidated=value;}},fetchImpl:async()=>new Response('secret-upstream-error',{status:401})});
  await assert.rejects(provider.inspectWorkspace(input),e=>e.code==='NORA_AUTH_REQUIRED'&&e.noSideEffects===true&&!e.message.includes('secret'));
  assert.deepEqual(invalidated,{projectId:PROJECT,workspaceId:WORKSPACE,accessToken:'synthetic-rejected'});
});
test('context bootstrap uses deterministic scoped slug and reconciles without writes',async()=>{
  const rows=[],writes=[];
  const f=fixture({handler:(name,args)=>{
    if(name==='list_memory_spaces')return rows;
    if(name==='create_memory_space'){writes.push(args);rows.push({id:'space_synthetic',slug:args.slug,paradigm:args.paradigm,config:args.config});return {id:'space_synthetic'};}
    throw new Error(name);
  }});
  assert.deepEqual(await f.provider.reconcileContextSpace(input),{workspaceId:WORKSPACE,status:'absent'});
  assert.deepEqual(await f.provider.ensureContextSpace(input),{workspaceId:WORKSPACE,spaceId:'space_synthetic'});
  await f.provider.ensureContextSpace(input);await f.provider.reconcileContextSpace(input);
  assert.equal(writes.length,1);assert.equal(writes[0].slug,contextSlug(PROJECT,REQUEST));
  assert.notEqual(contextSlug(PROJECT,REQUEST),contextSlug('another-project',REQUEST));
});
test('context bootstrap rejects conflicting project markers instead of adopting arbitrary memory',async()=>{
  const f=fixture({handler:()=>[{id:'space_wrong',slug:contextSlug(PROJECT,REQUEST),paradigm:'wiki',config:{ains_project_id:'other',ains_request_id:REQUEST}}]});
  await assert.rejects(f.provider.ensureContextSpace(input),{code:'NORA_CONTEXT_SPACE_MISMATCH'});
  assert.equal(f.calls.filter(c=>c.method==='tools/call').length,1);
});
test('replayed immutable context events replace the same note path and reject other projects',async()=>{
  const writes=[];const f=fixture({handler:(name,args)=>{
    if(name==='list_memory_spaces')return [{id:'space_synthetic',slug:'slug',paradigm:'wiki',config:{ains_project_id:PROJECT}}];
    writes.push(args);return {id:'note_synthetic'};
  }});
  const value={...input,spaceId:'space_synthetic',event:{id:'event_123',project_id:PROJECT,key:'record:record_1',kind:'context_record',context_version:1,payload:{record:{title:'Reviewed'}}}};
  await f.provider.syncContext(value);await f.provider.syncContext(value);
  assert.equal(writes[0].path,writes[1].path);assert.equal(writes[0].body,writes[1].body);
  await assert.rejects(f.provider.syncContext({...value,event:{...value.event,project_id:'other'}}),{code:'NORA_CONTEXT_EVENT_INVALID'});
  assert.equal(writes.length,2);
});
test('network loss after a write dispatch is uncertain and never automatically replayed',async()=>{
  let writes=0;
  const f=fixture({handler:(name)=>{if(name==='create_memory_space'){writes++;throw new Error('Network lost with secret text');}return [];}});
  await assert.rejects(f.provider.ensureContextSpace(input),e=>e.code==='NORA_MCP_UNAVAILABLE'&&e.noSideEffects===false&&!e.message.includes('secret'));
  assert.equal(writes,1);
});
test('connectors strip secret fields and reject a foreign workspace echo',async()=>{
  const f=fixture({handler:()=>[{id:'github_connector',provider:'github',name:'GitHub',credentials:'masked-secret',enabled:true}]});
  assert.deepEqual(await f.provider.listConnectors(input),[{id:'github_connector',provider:'github',name:'GitHub',workspaceId:WORKSPACE,enabled:true}]);
  const wrong=fixture({handler:()=>[{id:'github_connector',provider:'github',workspace_id:'t_other_workspace'}]});
  await assert.rejects(wrong.provider.listConnectors(input),{code:'NORA_WORKSPACE_SCOPE_MISMATCH'});
});
