'use strict';
const {createCipheriv,createDecipheriv,randomBytes,createHash}=require('node:crypto');
const PROVIDERS=['gmail','drive','slack','discord','github','teams','kakaotalk'];
function fail(code,message,status=400){throw Object.assign(new Error(message),{code,status});}
function text(v,label,max=300){if(typeof v!=='string'||!v.trim()||v.length>max||v.includes('\0')||!v.isWellFormed())fail('INVALID_INTEGRATION',`${label}을 확인해 주세요.`);return v.trim();}
function strict(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('INVALID_INTEGRATION','지원하지 않는 입력입니다.');}
function identifier(v,label){v=text(v,label);if(!/^[a-zA-Z0-9_:.@!\-]+$/.test(v))fail('INVALID_INTEGRATION',`${label} 형식을 확인해 주세요.`);return v;}
function normalizeScope(provider,scope){
 const keys={gmail:['label_id','query'],drive:['folder_id'],slack:['channel_id'],discord:['channel_id'],github:['owner','repo'],teams:['team_id','channel_id'],kakaotalk:['room_id']}[provider];
 if(!keys)fail('INVALID_INTEGRATION','지원하지 않는 연결입니다.');strict(scope,keys);
 if(provider==='gmail'){const label_id=identifier(scope.label_id,'Gmail 라벨 ID');return {label_id,query:scope.query?text(scope.query,'Gmail 검색 조건',1000):''};}
 return Object.fromEntries(keys.map(k=>[k,identifier(scope[k],k)]));
}
function credentials(provider,value){strict(value,['access_token','refresh_token','client_id','client_secret','bridge_token']);
 if(provider==='kakaotalk'){const token=text(value.bridge_token,'브리지 토큰',500);if(token.length<32)fail('INVALID_INTEGRATION','브리지 토큰은 32자 이상이어야 합니다.');return {bridge_token:token};}
 const result={};for(const k of ['access_token','refresh_token','client_id','client_secret'])if(value[k])result[k]=text(value[k],k,12000);
 if(result.refresh_token&&(!['gmail','drive'].includes(provider)||!result.client_id||!result.client_secret))fail('INVALID_INTEGRATION','Google 갱신 토큰에는 Client ID와 Client Secret이 함께 필요합니다.');
 if(!result.access_token&&!( ['gmail','drive'].includes(provider)&&result.refresh_token&&result.client_id&&result.client_secret))fail('INVALID_INTEGRATION','액세스 토큰 또는 Google 갱신 인증 정보가 필요합니다.');
 if(Object.values(result).some(v=>/[\r\n]/.test(v)))fail('INVALID_INTEGRATION','인증 정보 형식을 확인해 주세요.');
 return result;
}
function key(value){const k=Buffer.from(value||'','base64');if(k.length!==32||k.toString('base64')!==value)fail('INTEGRATION_KEY_UNAVAILABLE','외부 연결 암호화 키가 서버에 설정되지 않았습니다.',503);return k;}
function seal(value,aad,master){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(master),iv);cipher.setAAD(Buffer.from(aad));const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),body].map(x=>x.toString('base64')).join('.');}
function unseal(value,aad,master){try{const [iv,tag,body]=value.split('.').map(x=>Buffer.from(x,'base64'));const c=createDecipheriv('aes-256-gcm',key(master),iv);c.setAAD(Buffer.from(aad));c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(body),c.final()]).toString('utf8'));}catch(e){if(e.code==='INTEGRATION_KEY_UNAVAILABLE')throw e;fail('INTEGRATION_CREDENTIAL_INVALID','연결 인증 정보를 다시 저장해 주세요.',503);}}
function hash(v){return createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function publicRow(row){const {secret_ciphertext,lease_token,cursor,...safe}=row;return {...safe,has_credentials:Boolean(secret_ciphertext),syncing:Boolean(lease_token&&new Date(row.lease_expires_at)>new Date())};}
function safeError(e){return ['REMOTE_RATE_LIMIT','REMOTE_AUTH_REQUIRED','REMOTE_FORBIDDEN','REMOTE_NOT_FOUND','REMOTE_TIMEOUT','REMOTE_TOO_LARGE','REMOTE_INVALID_RESPONSE','REMOTE_UNAVAILABLE','CHANNEL_RATE_LIMIT','CHANNEL_PAUSED','FORBIDDEN','INTEGRATION_KEY_UNAVAILABLE','INTEGRATION_CREDENTIAL_INVALID','INTEGRATION_PAUSED','LEASE_LOST'].includes(e.code)?e.code:'INTEGRATION_SYNC_FAILED';}
module.exports={PROVIDERS,fail,text,strict,normalizeScope,credentials,key,seal,unseal,hash,publicRow,safeError};
