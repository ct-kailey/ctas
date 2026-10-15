'use strict';
const {transaction}=require('./db');
const {membership}=require('./context-ledger');
const {fail,object,version,REVIEW}=require('./question-contract');
function language(value,{optional=false}={}){if(value===undefined&&optional)return undefined;if(!['ko','en'].includes(value))fail('QUESTION_LANGUAGE_INVALID','한국어 또는 English를 선택하세요.',400);return value;}
async function read(db,p){return (await db.query('SELECT customer_question_language,version,updated_at FROM project_question_language_settings WHERE project_id=$1',[p])).rows[0]||{customer_question_language:'ko',version:1,updated_at:null};}
async function defaultLanguage(db,p){return (await read(db,p)).customer_question_language;}
function createQuestionLanguageService(pool){return {
 async get(p,u){const m=await membership(pool,p,u);return {settings:await read(pool,p),can_edit:REVIEW.includes(typeof m==='string'?m:m.role)};},
 async save(p,u,body){object(body,['expected_version','customer_question_language']);version(body.expected_version);const selected=language(body.customer_question_language);return transaction(pool,async db=>{await membership(db,p,u,REVIEW);await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-question-language:'||$1,0))",[p]);const current=await read(db,p);if(current.version!==body.expected_version)fail('QUESTION_LANGUAGE_SETTINGS_CHANGED','질문 언어 설정이 변경되었습니다. 다시 확인하세요.',409);const settings=(await db.query(`INSERT INTO project_question_language_settings(project_id,customer_question_language,version,updated_by) VALUES($1,$2,2,$3) ON CONFLICT(project_id) DO UPDATE SET customer_question_language=excluded.customer_question_language,version=project_question_language_settings.version+1,updated_by=excluded.updated_by,updated_at=now() RETURNING customer_question_language,version,updated_at`,[p,selected,u])).rows[0];await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'question.language_updated',$1,$3)",[p,u,{before:current.customer_question_language,language:selected,version:settings.version}]);return {settings,can_edit:true};});}
};}
module.exports={language,read,defaultLanguage,createQuestionLanguageService};
