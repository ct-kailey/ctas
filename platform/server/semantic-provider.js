'use strict';
const {fail,hash}=require('./context-contract');
const MAX_INPUT_BYTES=6000,MAX_BATCH_BYTES=48000,MAX_BATCH=16;
function configuration(value={}) {
 const model=value.embeddingModel||process.env.SEMANTIC_EMBEDDING_MODEL||'text-embedding-3-small';
 const dimensions=Number(value.embeddingDimensions??process.env.SEMANTIC_EMBEDDING_DIMENSIONS??512);
 if(!['text-embedding-3-small','text-embedding-3-large'].includes(model)||!Number.isInteger(dimensions)||dimensions<2||dimensions>1536) fail('SEMANTIC_CONFIG_INVALID','의미 검색 모델 또는 벡터 크기 설정을 확인하세요.',503);
 // A project-level null explicitly disables the provider; server defaults must not undo it.
 return {apiKey:Object.hasOwn(value,'apiKey')?(value.apiKey||''):(process.env.SEMANTIC_OPENAI_API_KEY||process.env.OPENAI_API_KEY||''),model,dimensions};
}
function normalize(vector,dimensions) {
 if(!Array.isArray(vector)||vector.length!==dimensions||vector.some(v=>typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e6)) fail('SEMANTIC_VECTOR_INVALID','임베딩 응답의 벡터 형식이 올바르지 않습니다.',502);
 const norm=Math.sqrt(vector.reduce((n,v)=>n+v*v,0));
 if(!Number.isFinite(norm)||norm<1e-12) fail('SEMANTIC_VECTOR_INVALID','빈 의미 벡터가 반환되었습니다.',502);
 return vector.map(v=>v/norm);
}
function cosine(a,b) {if(a.length!==b.length)return -1;let dot=0;for(let i=0;i<a.length;i++)dot+=a[i]*b[i];return Math.max(-1,Math.min(1,dot));}
function chunks(text) {
 // Byte-bound chunks keep multilingual input safely below the documented per-input token limit.
 const out=[];let piece='',size=0;for(const char of String(text||'')){const n=Buffer.byteLength(char);if(size+n>MAX_INPUT_BYTES){out.push(piece);piece='';size=0;}piece+=char;size+=n;}if(piece.trim())out.push(piece);
 return {items:out.slice(0,32).map((text,index)=>({text,index,sha256:hash(text)})),truncated:out.length>32};
}
async function embed(input,config,{fetchImpl=fetch,signal}={}) {
 if(!config.apiKey)fail('SEMANTIC_NOT_CONFIGURED','프로젝트 AI 연결에서 OpenAI 키를 설정하세요.',503);
 if(!Array.isArray(input)||!input.length||input.length>MAX_BATCH||input.some(v=>typeof v!=='string'||!v.trim()||Buffer.byteLength(v)>MAX_INPUT_BYTES)||input.reduce((n,v)=>n+Buffer.byteLength(v),0)>MAX_BATCH_BYTES)fail('SEMANTIC_INPUT_LIMIT','임베딩 요청 크기가 허용 범위를 초과했습니다.');
 const timeout=AbortSignal.timeout(30000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 let response;
 try {response=await fetchImpl('https://api.openai.com/v1/embeddings',{method:'POST',headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,input,encoding_format:'float',dimensions:config.dimensions}),signal:combined,redirect:'error'});}catch(e){fail(e.name==='TimeoutError'||e.name==='AbortError'?'SEMANTIC_TIMEOUT':'SEMANTIC_CONNECTION_FAILED','의미 검색 제공자 연결을 완료하지 못했습니다.',502);}
 if(!response.ok)fail(response.status===429?'SEMANTIC_RATE_LIMIT':response.status===401||response.status===403?'SEMANTIC_CREDENTIAL_REJECTED':response.status>=500?'SEMANTIC_PROVIDER_UNAVAILABLE':'SEMANTIC_PROVIDER_REJECTED','임베딩 요청이 처리되지 않았습니다. 프로젝트 AI 연결과 사용 한도를 확인하세요.',502);
 let body;try{body=await response.json();}catch{fail('SEMANTIC_RESPONSE_INVALID','임베딩 응답을 읽을 수 없습니다.',502);}
 if(body.model!==config.model||!Array.isArray(body.data)||body.data.length!==input.length)fail('SEMANTIC_MODEL_MISMATCH','색인과 검색의 모델이 일치하지 않습니다.',502);
 const ordered=Array(input.length);for(const row of body.data){if(!Number.isInteger(row.index)||row.index<0||row.index>=input.length||ordered[row.index])fail('SEMANTIC_RESPONSE_INVALID','임베딩 순서가 올바르지 않습니다.',502);ordered[row.index]=normalize(row.embedding,config.dimensions);}
 if(ordered.some(v=>!v))fail('SEMANTIC_RESPONSE_INVALID','임베딩 결과가 누락되었습니다.',502);
 return ordered;
}
module.exports={configuration,normalize,cosine,chunks,embed,MAX_INPUT_BYTES,MAX_BATCH_BYTES,MAX_BATCH};
