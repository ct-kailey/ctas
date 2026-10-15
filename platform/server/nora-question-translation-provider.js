'use strict';
const {isDeepStrictEqual}=require('node:util');
const {binding}=require('./project-nora');
const {validateTranslation,buildTranslationFlow,defaultSlug}=require('../../nora/question-translation/contract');
function fail(code,message,{dispatched=false,...extra}={}){throw Object.assign(new Error(message),{code,status:409,noSideEffects:!dispatched,dispatched,...extra});}
function parse(value){if(typeof value!=='string')return value;try{return JSON.parse(value);}catch{fail('QUESTION_TRANSLATION_NORA_RESULT_INVALID','Nora 질문 번역 결과를 해석할 수 없습니다.',{dispatched:true});}}
function projection(value,key=''){
  if(Array.isArray(value)){
    const rows=value.map(item=>projection(item));
    // Nora returns canvas registries in ID order. Edge/agent order is not the
    // execution order; preserve order-sensitive fields such as outputRules.
    return ['agents','edges','toolBlocks','actionBlocks','triggerBlocks','variables'].includes(key)?rows.sort((a,b)=>String(a.id||a.name).localeCompare(String(b.id||b.name))):rows;
  }
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([name])=>!['x','y','width','height'].includes(name)).map(([name,item])=>[name,projection(item,name)]));
}
function createNoraQuestionTranslationProvider({pool,provider}){
  async function bound(input){const row=await binding(pool,input.projectId);if(!row||row.workspace_id!==input.workspaceId||row.status!=='ready')fail('QUESTION_TRANSLATION_CONNECTION_REQUIRED','프로젝트의 Nora 워크스페이스 연결을 먼저 완료하세요.');if(typeof provider?.callTool!=='function')fail('QUESTION_TRANSLATION_CONNECTION_REQUIRED','서버의 Nora 연결을 확인하세요.');return row;}
  const call=(input,name,args={})=>provider.callTool({projectId:input.projectId,workspaceId:input.workspaceId,name,arguments:args,signal:input.signal});
  async function selected(input,template){
    const value=await call(input,'get_flow',{slug:template.slug});
    if(value?.id!==template.slug||!isDeepStrictEqual(projection(value.payload),projection(template.payload))||value.memorySpaces?.length)fail('QUESTION_TRANSLATION_FLOW_CHANGED','자동 생성 질문 번역 흐름이 수정되었습니다. 프로젝트의 전용 흐름을 확인하세요.');
    return value;
  }
  return {
    async translate(input){
      await bound(input);const request=structuredClone(input.request);
      if(request.project_id!==input.projectId||request.request_id!==input.requestId||typeof input.requestId!=='string'||!input.requestId)fail('QUESTION_TRANSLATION_SCOPE_MISMATCH','질문 번역 입력이 현재 프로젝트와 다릅니다.');
      const template=buildTranslationFlow({projectId:input.projectId}),listed=await call(input,'list_flows'),flows=Array.isArray(listed)?listed:listed?.flows;
      if(!Array.isArray(flows))fail('QUESTION_TRANSLATION_FLOW_INVALID','Nora 질문 번역 흐름 목록을 확인할 수 없습니다.');
      if(!flows.some(f=>f.id===template.slug))await call(input,'apply_flow',template);
      let flow=await selected(input,template);
      if(!flow.publishState?.publishedVersionId||flow.publishState.hasUnpublishedChanges){await call(input,'publish_flow',{slug:template.slug,note:'AINS customer question translation v1'});flow=await selected(input,template);}
      if(!flow.publishState?.publishedVersionId||flow.publishState.hasUnpublishedChanges)fail('QUESTION_TRANSLATION_FLOW_NOT_PUBLISHED','Nora 질문 번역 흐름의 발행을 확인할 수 없습니다.');
      await bound(input);

      let raw;
      try{raw=await call(input,'run_flow',{slug:template.slug,input:JSON.stringify(request),variables:{translation_request:request},test:false});}
      catch(error){throw Object.assign(error,{dispatched:true,noSideEffects:false});}
      // Current MCP wraps the runtime result in a flowRun envelope. Legacy direct
      // replies are still accepted; a negative envelope never supplies a success.
      if(raw?.kind==='flowRun'){
        if(raw.ok!==true||raw.status!=='ok'||raw.slug!==template.slug)fail('QUESTION_TRANSLATION_NORA_RUN_FAILED','Nora 질문 번역 실행 응답을 확인하지 못했습니다.',{dispatched:true,definiteFailure:raw.status==='failed'});
        raw=raw.run;
      }
      if(raw?.status!=='ok'||raw.failure||raw.error||(raw.rawStatus&&raw.rawStatus!=='completed')||!/^trc_[A-Za-z0-9_-]{8,128}$/.test(raw.traceId||''))fail('QUESTION_TRANSLATION_NORA_RUN_FAILED','Nora 질문 번역 생성이 완료되지 않았습니다. 실행 결과를 확인하세요.',{dispatched:true,definiteFailure:raw?.status==='failed'});
      try{
        const after=await selected(input,template);
        if(after.publishState?.publishedVersionId!==flow.publishState.publishedVersionId||after.publishState?.hasUnpublishedChanges)fail('QUESTION_TRANSLATION_FLOW_CHANGED','질문 번역 작성 중 Nora 흐름이 변경되었습니다.');
        const translation=parse(raw.output??raw.outputs?.at(-1)?.text),trace=await call(input,'get_trace',{traceId:raw.traceId});
        if(trace?.traceId!==raw.traceId||trace.status!=='completed'||trace.payload?.tenant_id!==input.workspaceId||trace.payload.graph_slug!==template.slug||!isDeepStrictEqual(parse(trace.payload.flow_input),request)||!isDeepStrictEqual(parse(trace.payload.flow_output),translation))fail('QUESTION_TRANSLATION_TRACE_MISMATCH','질문 번역 실행의 프로젝트·입력·결과가 일치하지 않습니다.');
        await bound(input);
        return {translation:validateTranslation(translation,request),traceId:raw.traceId,flowSlug:template.slug,publishedVersionId:flow.publishState.publishedVersionId};
      }catch(error){throw Object.assign(error,{dispatched:true,noSideEffects:false,definiteFailure:true});}
    },
  };
}
module.exports={createNoraQuestionTranslationProvider,defaultSlug};
