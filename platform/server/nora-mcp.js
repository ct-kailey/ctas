'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { RESOURCE } = require('./nora-oauth');
const { workspaceId, remoteId } = require('./project-nora');

const PROTOCOL = '2025-03-26';
const VERSIONS = new Set([PROTOCOL,'2025-06-18','2025-11-25']);
function fail(code, message, { noSideEffects = false, status = 502 } = {}) { throw Object.assign(new Error(message), { code, status, noSideEffects }); }
function invalid(noSideEffects = false) { fail('NORA_MCP_RESPONSE_INVALID', 'Nora 응답 형식을 확인하지 못했습니다.', { noSideEffects }); }
function rpcResult(message, id) {
  if (!message || message.jsonrpc !== '2.0' || message.id !== id || (!Object.hasOwn(message,'result') && !message.error)) return null;
  if (message.error) fail('NORA_MCP_TOOL_FAILED', 'Nora 요청을 처리하지 못했습니다. 연결과 도구 설정을 확인하세요.');
  return { value: message.result };
}
async function readRpc(response, id, maxBytes = 4 * 1024 * 1024) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!['application/json','text/event-stream'].includes(type) || !response.body) invalid();
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', bytes = 0;
  function consume(raw) {
    let messages; try { messages = JSON.parse(raw); } catch { invalid(); }
    for (const message of Array.isArray(messages) ? messages : [messages]) { const found = rpcResult(message,id); if (found) return found; }
    return null;
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) { bytes += value.length; if (bytes > maxBytes) invalid(); buffer += decoder.decode(value,{stream:true}); }
      if (done) buffer += decoder.decode();
      if (type === 'text/event-stream') {
        // CRLF normalization is delayed until both bytes of the separator arrive.
        let match;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0,match.index); buffer = buffer.slice(match.index+match[0].length);
          const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /,'')).join('\n');
          if (data) { const found = consume(data); if (found) return found.value; }
        }
      }
      if (done) {
        if (type === 'application/json') { const found = consume(buffer); if (found) return found.value; }
        invalid();
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
}
function toolValue(result) {
  if (!result || result.isError) fail('NORA_MCP_TOOL_FAILED', 'Nora 도구가 요청을 완료하지 못했습니다.');
  if (result.structuredContent !== undefined) return result.structuredContent;
  const texts = result.content?.filter(item => item.type === 'text').map(item => item.text) || [];
  if (texts.length !== 1) invalid();
  try { return JSON.parse(texts[0]); } catch { invalid(); }
}
function arrayResult(result, key) { const rows = Array.isArray(result) ? result : result?.[key]; if (!Array.isArray(rows) || rows.length > 5000) invalid(); return rows; }
function assertEcho(value, workspace) { for (const key of ['workspaceId','workspace_id','tenantId','tenant_id']) if (value?.[key] !== undefined && value[key] !== workspace) fail('NORA_WORKSPACE_SCOPE_MISMATCH','Nora 응답의 워크스페이스가 프로젝트와 다릅니다.'); }
function contextSlug(projectId, requestId) { return `ains-context-${createHash('sha256').update(JSON.stringify([projectId,requestId])).digest('hex').slice(0,40)}`; }

/** Authenticated Streamable HTTP; no global active-workspace mutation or bearer
 * credentials inherited from the agent/browser. Every tool call has an explicit
 * workspace and an access token looked up by the same local project binding. */
function createNoraMcpProvider({ oauth, fetchImpl = fetch, timeoutMs = 30000, maxBytes = 4 * 1024 * 1024 }) {
  async function callTool({ projectId, workspaceId: workspace, name, arguments: args = {}, signal }) {
    if (typeof projectId !== 'string' || !projectId || !/^[a-z][a-z0-9_]{0,99}$/.test(name) || !args || typeof args !== 'object' || Array.isArray(args)) fail('NORA_MCP_INPUT_INVALID','Nora 도구 요청을 확인하세요.',{status:400,noSideEffects:true});
    workspaceId(workspace);
    if (args.workspace !== undefined && args.workspace !== workspace) fail('NORA_WORKSPACE_SCOPE_MISMATCH','다른 워크스페이스로 요청할 수 없습니다.',{status:403,noSideEffects:true});
    // onBehalfOf impersonation and workspace switching are never available to
    // this adapter. Tokens carry the actual consenting person's identity.
    if (Object.hasOwn(args,'onBehalfOf') || ['set_active_workspace','create_workspace','delete_workspace'].includes(name)) fail('NORA_MCP_TOOL_FORBIDDEN','허용되지 않은 Nora 도구 요청입니다.',{status:403,noSideEffects:true});
    const token = await oauth.getAccessToken({ projectId,workspaceId:workspace,signal });
    const abort = signal ? AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let sessionId, protocol = PROTOCOL, dispatched = false;
    async function post(method, params, notification = false) {
      const id = notification ? undefined : randomUUID();
      const headers = { Authorization:`Bearer ${token}`, Accept:'application/json, text/event-stream','Content-Type':'application/json','MCP-Protocol-Version':protocol };
      if (sessionId) headers['Mcp-Session-Id'] = sessionId;
      let response;
      try {
        response = await fetchImpl(RESOURCE,{method:'POST',redirect:'error',signal:abort,headers,body:JSON.stringify({jsonrpc:'2.0',...(id?{id}:{}),method,params})});
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel().catch(()=>{});
          await oauth.invalidateAccessToken?.({projectId,workspaceId:workspace,accessToken:token}).catch(()=>{});
          fail('NORA_AUTH_REQUIRED','프로젝트 관리자가 Nora 연결을 다시 승인해 주세요.',{status:401,noSideEffects:true});
        }
        if (!response.ok) { await response.body?.cancel().catch(()=>{}); fail('NORA_MCP_UNAVAILABLE','Nora 요청 결과를 확인하지 못했습니다.',{noSideEffects:!dispatched}); }
        if (method === 'initialize') { const value = response.headers.get('mcp-session-id'); if (value && (!/^[\x21-\x7e]{1,2048}$/.test(value))) invalid(true); sessionId = value || undefined; }
        if (notification) { await response.body?.cancel().catch(()=>{}); if (response.status !== 202 && response.status !== 204) invalid(true); return null; }
        return await readRpc(response,id,maxBytes);
      } catch (error) {
        if (error?.code?.startsWith('NORA_')) { if (!dispatched) error.noSideEffects = true; throw error; }
        fail('NORA_MCP_UNAVAILABLE','Nora 요청 결과를 확인하지 못했습니다.',{noSideEffects:!dispatched});
      }
    }
    try {
    const init = await post('initialize',{protocolVersion:PROTOCOL,capabilities:{},clientInfo:{name:'ains-project-nora',version:'1.0.0'}});
    if (!VERSIONS.has(init?.protocolVersion) || !init.capabilities?.tools) invalid(true);
    protocol = init.protocolVersion;
    await post('notifications/initialized',{},true);
    const names = new Set(); let cursor, pages = 0;
    do {
      const catalog = await post('tools/list',cursor?{cursor}:{});
      if (!Array.isArray(catalog?.tools) || ++pages > 20) invalid(true);
      for (const entry of catalog.tools) if (typeof entry.name === 'string') names.add(entry.name);
      cursor = catalog.nextCursor;
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 4096)) invalid(true);
    } while (cursor);
    if (!names.has(name) && !names.has('call_tool')) fail('NORA_MCP_TOOL_UNAVAILABLE','연결된 Nora에서 필요한 도구를 지원하지 않습니다.',{noSideEffects:true});
    dispatched = true;
    const scoped = {...args,workspace};
    return toolValue(await post('tools/call',names.has(name)?{name,arguments:scoped}:{name:'call_tool',arguments:{name,arguments:scoped}}));
    } finally {
      // A bounded best-effort session close never retries a tool or replaces its
      // outcome. Stateless servers omit the session header and need no cleanup.
      if(sessionId) try {
        const response=await fetchImpl(RESOURCE,{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(Math.min(timeoutMs,3000)),headers:{Authorization:`Bearer ${token}`,Accept:'application/json, text/event-stream','Mcp-Session-Id':sessionId,'MCP-Protocol-Version':protocol}});
        await response.body?.cancel().catch(()=>{});
      } catch {}
    }
  }
  async function spaces(input) {
    const rows = arrayResult(await callTool({...input,name:'list_memory_spaces'}),'spaces');
    for (const row of rows) { assertEcho(row,input.workspaceId); if (!remoteId(row?.id) || typeof row.slug !== 'string') invalid(); }
    return rows;
  }
  async function findSpace(input) {
    const slug = contextSlug(input.projectId,input.requestId), rows = (await spaces(input)).filter(row => row.slug === slug);
    if (rows.length > 1) fail('NORA_CONTEXT_SPACE_MISMATCH','동일한 프로젝트 Context 공간이 여러 개입니다.');
    const row = rows[0];
    if (row && (row.paradigm !== 'wiki' || row.config?.ains_project_id !== input.projectId || row.config?.ains_request_id !== input.requestId)) fail('NORA_CONTEXT_SPACE_MISMATCH','Nora Context 공간의 프로젝트 식별 근거가 다릅니다.');
    return row;
  }
  return {
    callTool,
    async inspectWorkspace(input) {
      // list_workspaces checks membership; selecting the requested workspace in
      // every subsequent tool checks token binding as well.
      const result = await callTool({...input,name:'list_workspaces'});
      const rows = arrayResult(result,'workspaces');
      if (!rows.some(row => row?.id === input.workspaceId)) fail('NORA_WORKSPACE_SCOPE_MISMATCH','승인한 계정에서 등록한 Nora 워크스페이스를 확인할 수 없습니다.',{noSideEffects:true});
      return {workspaceId:input.workspaceId};
    },
    async listConnectors(input) {
      const rows = arrayResult(await callTool({...input,name:'list_connectors'}),'connectors');
      return rows.filter(row => row.provider === 'github').map(row => {
        assertEcho(row,input.workspaceId);
        if (!remoteId(row.id)) invalid();
        return {id:row.id,workspaceId:input.workspaceId,provider:'github',name:typeof row.name==='string'?row.name:row.id,enabled:row.enabled !== false && !['disabled','revoked','disconnected','error'].includes(row.status)};
      });
    },
    async ensureContextSpace(input) {
      let found = await findSpace(input);
      if (!found) {
        await callTool({...input,name:'create_memory_space',arguments:{slug:contextSlug(input.projectId,input.requestId),name:`${String(input.name||'AINS').slice(0,120)} Context`,paradigm:'wiki',config:{ains_project_id:input.projectId,ains_request_id:input.requestId}}});
        found = await findSpace(input);
        if (!found) fail('NORA_CONTEXT_SPACE_UNCERTAIN','생성한 Nora Context 공간을 확인하지 못했습니다.');
      }
      return {workspaceId:input.workspaceId,spaceId:found.id};
    },
    async reconcileContextSpace(input) {
      const found = await findSpace(input);
      return found?{workspaceId:input.workspaceId,spaceId:found.id}:{workspaceId:input.workspaceId,status:'absent'};
    },
    async syncContext(input) {
      const {event,spaceId} = input;
      if (!remoteId(spaceId) || !remoteId(event?.id) || event.project_id !== input.projectId || !['context_record','context_supersession'].includes(event.kind)) fail('NORA_CONTEXT_EVENT_INVALID','Nora Context 동기화 대상을 확인하세요.',{noSideEffects:true,status:400});
      const listed = (await spaces(input)).find(row=>row.id===spaceId);
      if (!listed || listed.paradigm !== 'wiki' || listed.config?.ains_project_id !== input.projectId) fail('NORA_CONTEXT_SPACE_MISMATCH','프로젝트에 연결된 Nora Context 공간을 확인하지 못했습니다.',{noSideEffects:true});
      const body = JSON.stringify({schema_version:1,project_id:input.projectId,event_id:event.id,event_key:event.key,kind:event.kind,context_version:event.context_version,payload:event.payload},null,2);
      await callTool({...input,name:'upsert_memory_note',arguments:{spaceId,path:`ains/events/${event.id}.json`,title:`AINS ${event.kind} · ${event.context_version}`,body,scope:{ains_project_id:input.projectId}}});
      return {workspaceId:input.workspaceId,spaceId,eventId:event.id};
    },
  };
}
module.exports = { createNoraMcpProvider, readRpc, toolValue, contextSlug };
