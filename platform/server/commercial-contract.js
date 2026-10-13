'use strict';
const {createHash}=require('node:crypto');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KINDS=['proposal','estimate','contract'];
const STAGES=['planning','negotiating','contracted','handoff','on_hold'];
const PROFILE_FIELDS=['client_name','company_info','project_scope','schedule','budget','notes'];
const owns=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
function fail(code,message,status=400){throw Object.assign(new Error(message),{code,status});}
function object(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Object.keys(v).some(k=>!keys.includes(k)))fail('INVALID_COMMERCIAL_INPUT','지원하지 않는 계약·기획 입력 형식입니다.');}
function text(v,label,max=5000,empty=false,trim=true){if(typeof v!=='string'||!v.isWellFormed()||v.includes('\0')||v.length>max||(!empty&&!v.trim()))fail('INVALID_COMMERCIAL_INPUT',`${label}은 최대 ${max}자까지 입력하세요.`);return trim?v.trim():v;}
function id(v){if(typeof v!=='string'||!UUID.test(v))fail('INVALID_ID','올바른 항목 ID가 필요합니다.');return v.toLowerCase();}
function version(v){if(!Number.isSafeInteger(v)||v<1)fail('COMMERCIAL_VERSION_REQUIRED','현재 버전이 필요합니다.');return v;}
function date(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'0001-01-01'||v>'9999-12-31')fail('INVALID_COMMERCIAL_DATE','YYYY-MM-DD 형식의 실제 날짜를 입력하세요.');const parsed=new Date(v+'T00:00:00.000Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==v)fail('INVALID_COMMERCIAL_DATE','실제 달력 날짜를 입력하세요.');return v;}
function key(v){text(v,'항목 ID',80);if(!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(v))fail('INVALID_COMMERCIAL_INPUT','항목 ID는 영문·숫자·밑줄·하이픈만 가능합니다.');return v;}
function unique(rows){if(new Set(rows.map(v=>v.id)).size!==rows.length)fail('INVALID_COMMERCIAL_INPUT','항목 ID가 중복되었습니다.');}
function validateCommercialContent(v){
  object(v,['sections','tables']);
  if(!Array.isArray(v.sections)||v.sections.length<1||v.sections.length>12||!Array.isArray(v.tables)||v.tables.length>5)fail('INVALID_COMMERCIAL_CONTENT','문서는 1~12개 본문 항목과 최대 5개 표로 구성하세요.');
  const sections=v.sections.map(s=>{object(s,['id','title','body']);return {id:key(s.id),title:text(s.title,'항목 제목',200),body:text(s.body,'본문',8000,true,false)};});
  if(sections.reduce((n,s)=>n+s.body.length,0)>40000)fail('COMMERCIAL_CONTENT_TOO_LARGE','본문 합계는 40,000자 이내여야 합니다.',413);
  const tables=v.tables.map(t=>{object(t,['id','title','columns','rows']);if(!Array.isArray(t.columns)||!t.columns.length||t.columns.length>8||!Array.isArray(t.rows)||t.rows.length>30)fail('INVALID_COMMERCIAL_CONTENT','표는 최대 8열·30행으로 구성하세요.');const columns=t.columns.map(c=>text(c,'열 제목',200));const rows=t.rows.map(r=>{if(!Array.isArray(r)||r.length!==columns.length)fail('INVALID_COMMERCIAL_CONTENT','표의 각 행은 열 수와 일치해야 합니다.');return r.map(c=>text(c,'표 내용',500,true,false));});return {id:key(t.id),title:text(t.title,'표 제목',200),columns,rows};});
  unique([...sections,...tables]);return {sections,tables};
}
function validateTemplate(v){
  object(v,['name','kind','instructions','sections','company_name','footer','is_sample','reference_revision_id']);
  if(!KINDS.includes(v.kind))fail('INVALID_COMMERCIAL_INPUT','제안서·견적서·계약서 중 종류를 선택하세요.');
  if(!Array.isArray(v.sections)||!v.sections.length||v.sections.length>12)fail('INVALID_COMMERCIAL_INPUT','양식 항목은 1~12개로 작성하세요.');
  const sections=v.sections.map(s=>{object(s,['id','title','guidance']);return {id:key(s.id),title:text(s.title,'항목 제목',200),guidance:text(s.guidance??'','작성 안내',2000,true,false)};});unique(sections);
  if(owns(v,'is_sample')&&typeof v.is_sample!=='boolean')fail('INVALID_COMMERCIAL_INPUT','샘플 여부는 true 또는 false여야 합니다.');
  return {name:text(v.name,'양식 이름',200),kind:v.kind,instructions:text(v.instructions??'','작성 지침',8000,true,false),sections,company_name:text(v.company_name??'','회사명',300,true),footer:text(v.footer??'','머리말·꼬리말',2000,true,false),is_sample:v.is_sample??false,reference_revision_id:v.reference_revision_id?id(v.reference_revision_id):null};
}
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));return v;}
function commercialHash(v){return createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');}
module.exports={KINDS,STAGES,PROFILE_FIELDS,owns,fail,object,text,id,version,date,validateCommercialContent,validateTemplate,commercialHash};
