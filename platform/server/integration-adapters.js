'use strict';
const {fail}=require('./integration-contract');
const HOSTS=new Set(['gmail.googleapis.com','www.googleapis.com','slack.com','discord.com','api.github.com','graph.microsoft.com','oauth2.googleapis.com']);
const q=(base,params)=>{const u=new URL(base);for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));return u.toString();};
const enc=encodeURIComponent;
const PAGE=15;
function plain(v){return String(v||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function iso(v){const d=new Date(v);return v&&!Number.isNaN(d.getTime())?d.toISOString():null;}
function bounded(v){const s=String(v||'').replaceAll('\0','').toWellFormed();return s.length>19500?s.slice(0,19400)+'\n[본문이 길어 일부만 수집했습니다. 원본 링크에서 전체 내용을 확인하세요.]':s;}
function record(id,body,{author='원본 시스템',sent_at,changed_at,url,deleted=false}={}){return {id:String(id),text:deleted?'':bounded(body),author:bounded(author).slice(0,200)||'원본 시스템',sent_at:iso(sent_at),changed_at:iso(changed_at),url:url||null,deleted};}
async function responseBody(res,asText=false){const reader=res.body?.getReader();let bytes=0,parts=[];if(!reader)return asText?'':{};while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2_000_000){await reader.cancel();fail('REMOTE_TOO_LARGE','외부 응답이 허용 크기를 초과했습니다.',502);}parts.push(Buffer.from(value));}const body=Buffer.concat(parts).toString('utf8');if(asText)return body;try{return JSON.parse(body);}catch{fail('REMOTE_INVALID_RESPONSE','외부 응답 형식을 확인할 수 없습니다.',502);}}
function createTransport({fetchImpl=fetch,signal}={}){
 return async function remote(url,token,{method='GET',body,headers={},asText=false,optional=false}={}){
  const u=new URL(url);if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.port||u.username||u.password)fail('INVALID_REMOTE_URL','허용되지 않은 외부 주소입니다.');
  let res;try{res=await fetchImpl(u,{method,headers:{...(token?{Authorization:token}:{}),...headers},body,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});}catch{fail('REMOTE_TIMEOUT','외부 연결에 응답이 없습니다.',502);}
  if(res.status===429||res.status===403&&res.headers.get('x-ratelimit-remaining')==='0'){const retry=Number(res.headers.get('retry-after'))||60;throw Object.assign(new Error('외부 API 호출 한도에 도달했습니다.'),{code:'REMOTE_RATE_LIMIT',status:429,retryAfter:Math.min(86400,Math.max(60,retry))});}
  if(optional&&(res.status===404||res.status===410)){await res.body?.cancel();return null;}
  if(!res.ok){await res.body?.cancel();fail(res.status===401?'REMOTE_AUTH_REQUIRED':res.status===403?'REMOTE_FORBIDDEN':res.status===404?'REMOTE_NOT_FOUND':'REMOTE_UNAVAILABLE','외부 서비스의 접근 권한 또는 상태를 확인해 주세요.',502);}
  const result=await responseBody(res,asText);
  if(optional&&result?.ok===false&&result.error==='thread_not_found')return null;
  if(result?.ok===false)fail(['invalid_auth','token_revoked','token_expired','not_authed'].includes(result.error)?'REMOTE_AUTH_REQUIRED':result.error==='ratelimited'?'REMOTE_RATE_LIMIT':'REMOTE_FORBIDDEN','외부 채널의 접근 권한을 확인해 주세요.',502);
  return result;
 };
}
function mimeText(payload){const plainParts=[],htmlParts=[];function collect(node){if(!node)return;if(node.body?.data){const body=Buffer.from(node.body.data,'base64url').toString('utf8');if(node.mimeType==='text/plain')plainParts.push(body);else if(node.mimeType==='text/html')htmlParts.push(plain(body));}for(const part of node.parts||[])collect(part);}collect(payload);return (plainParts.length?plainParts:htmlParts).join('\n');}
function safeNext(raw,prefix){if(!raw)return null;let u;try{u=new URL(raw);}catch{fail('REMOTE_INVALID_RESPONSE','잘못된 페이지 주소입니다.',502);}const expected=new URL(prefix);let samePath=false;try{samePath=decodeURIComponent(u.pathname)===decodeURIComponent(expected.pathname);}catch{}if(u.origin!==expected.origin||!samePath||u.username||u.password||u.hash)fail('REMOTE_INVALID_RESPONSE','범위를 벗어난 페이지 주소입니다.',502);return u.toString();}
function createAdapter({integration,credential,fetchImpl=fetch,signal}){
 const {provider,scope}=integration,remote=createTransport({fetchImpl,signal});let access=credential.access_token;
 const auth=()=>provider==='discord'?`Bot ${access}`:`Bearer ${access}`;
 const ghead={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const gmail='https://gmail.googleapis.com/gmail/v1/users/me',drive='https://www.googleapis.com/drive/v3/files';
 const github=`https://api.github.com/repos/${enc(scope.owner||'')}/${enc(scope.repo||'')}`;
 const teams=`https://graph.microsoft.com/v1.0/teams/${enc(scope.team_id||'')}/channels/${enc(scope.channel_id||'')}`;
 const slackUrl=(method,params)=>q(`https://slack.com/api/${method}`,params);
 async function initialize(){if(['gmail','drive'].includes(provider)&&credential.refresh_token){const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:credential.refresh_token,client_id:credential.client_id,client_secret:credential.client_secret});const v=await remote('https://oauth2.googleapis.com/token',null,{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}});if(!v.access_token)fail('REMOTE_AUTH_REQUIRED','Google 인증을 갱신할 수 없습니다.',502);access=v.access_token;}}
 function gmailRecord(v){const h=Object.fromEntries((v.payload?.headers||[]).map(x=>[x.name.toLowerCase(),x.value]));return record(v.id,`제목: ${h.subject||'(제목 없음)'}\n보낸 사람: ${h.from||''}\n\n${mimeText(v.payload)||v.snippet||'[텍스트 본문 없음 · 첨부파일은 원본에서 확인]'}\n\n[첨부파일은 자동 수집하지 않습니다.]`,{author:h.from,sent_at:Number(v.internalDate),url:`https://mail.google.com/mail/u/0/#all/${enc(v.id)}`,deleted:v.labelIds?.includes('TRASH')||!v.labelIds?.includes(scope.label_id)});}
 async function driveRecord(v){if(v.trashed||!v.parents?.includes(scope.folder_id))return record(v.id,'',{deleted:true,sent_at:v.createdTime,changed_at:v.modifiedTime,url:v.webViewLink});let body;if(v.mimeType==='application/vnd.google-apps.document')body=await remote(q(`${drive}/${enc(v.id)}/export`,{mimeType:'text/plain'}),auth(),{asText:true});else if(v.mimeType?.startsWith('text/')||['application/json','application/xml'].includes(v.mimeType))body=await remote(q(`${drive}/${enc(v.id)}`,{alt:'media'}),auth(),{asText:true});else body='[이 파일 형식은 원본 링크만 수집합니다. PDF·Office·이미지는 문서 업로드로 본문을 추출해 주세요.]';return record(v.id,`문서: ${v.name}\n형식: ${v.mimeType}\n\n${body}`,{author:v.lastModifyingUser?.displayName,sent_at:v.createdTime,changed_at:v.modifiedTime,url:v.webViewLink||`https://drive.google.com/file/d/${enc(v.id)}/view`});}
 const slackRecord=v=>record(v.ts,v.text||'[텍스트 없는 메시지]',{author:v.user||v.bot_id||'Slack',sent_at:Number(v.ts)*1000,changed_at:v.edited?.ts?Number(v.edited.ts)*1000:null,url:`https://slack.com/archives/${enc(scope.channel_id)}/p${String(v.ts).replace('.','')}`,deleted:v.subtype==='message_deleted'});
 const discordRecord=v=>record(v.id,`${v.content||'[텍스트 없음 또는 Message Content 권한 없음]'}${v.attachments?.length?'\n첨부: '+v.attachments.map(a=>a.filename).join(', '):''}`,{author:v.author?.global_name||v.author?.username,sent_at:v.timestamp,changed_at:v.edited_timestamp,url:`https://discord.com/channels/@me/${enc(scope.channel_id)}/${enc(v.id)}`});
 const githubRecord=v=>record(String(v.number),`${v.pull_request?'PR':'Issue'} #${v.number}: ${v.title}\n상태: ${v.state}\n\n${v.body||''}`,{author:v.user?.login,sent_at:v.created_at,changed_at:v.updated_at,url:v.html_url});
 const teamsRecord=v=>record(v.id,`${v.subject?v.subject+'\n':''}${plain(v.body?.content)||'[텍스트 없는 메시지]'}`,{author:v.from?.user?.displayName||v.from?.application?.displayName,sent_at:v.createdDateTime,changed_at:v.lastModifiedDateTime,url:v.webUrl,deleted:Boolean(v.deletedDateTime)});
 const githubComment=v=>record(`comment/${v.id}`,`Issue/PR 의견\n\n${v.body||''}`,{author:v.user?.login,sent_at:v.created_at,changed_at:v.updated_at,url:v.html_url});
 async function get(id){let v;
  if(provider==='gmail'){v=await remote(q(`${gmail}/messages/${enc(id)}`,{format:'full'}),auth(),{optional:true});return v?gmailRecord(v):null;}
  if(provider==='drive'){v=await remote(q(`${drive}/${enc(id)}`,{fields:'id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,trashed,lastModifyingUser'}),auth(),{optional:true});return v?driveRecord(v):null;}
  if(provider==='slack'&&id.includes('/')){const [root,reply]=id.split('/');v=await remote(slackUrl('conversations.replies',{channel:scope.channel_id,ts:root,oldest:reply,latest:reply,inclusive:true,limit:2}),auth(),{optional:true});const found=v?.messages?.find(x=>x.ts===reply);return found?{...slackRecord(found),id}:null;}
  if(provider==='slack'){v=await remote(slackUrl('conversations.history',{channel:scope.channel_id,oldest:id,latest:id,inclusive:true,limit:1}),auth());return v.messages?.[0]?.ts===id?slackRecord(v.messages[0]):null;}
  if(provider==='discord'){v=await remote(`https://discord.com/api/v10/channels/${enc(scope.channel_id)}/messages/${enc(id)}`,auth(),{optional:true});return v?discordRecord(v):null;}
  if(provider==='github'&&id.startsWith('comment/')){v=await remote(`${github}/issues/comments/${enc(id.slice(8))}`,auth(),{headers:ghead,optional:true});return v?githubComment(v):null;}
  if(provider==='github'){v=await remote(`${github}/issues/${enc(id)}`,auth(),{headers:ghead,optional:true});return v?githubRecord(v):null;}
  if(provider==='teams'&&id.includes('/')){const [root,reply]=id.split('/');v=await remote(`${teams}/messages/${enc(root)}/replies/${enc(reply)}`,auth(),{optional:true});return v?{...teamsRecord(v),id}:null;}
  if(provider==='teams'){v=await remote(`${teams}/messages/${enc(id)}`,auth(),{optional:true});return v?teamsRecord(v):null;}
  fail('INVALID_INTEGRATION','이 연결은 브리지 수집을 사용합니다.');
 }
 async function test(){await initialize();if(provider==='gmail')await remote(`${gmail}/labels/${enc(scope.label_id)}`,auth());else if(provider==='drive'){const f=await remote(q(`${drive}/${enc(scope.folder_id)}`,{fields:'id,mimeType,trashed'}),auth());if(f.mimeType!=='application/vnd.google-apps.folder'||f.trashed)fail('REMOTE_NOT_FOUND','사용 가능한 Drive 폴더가 아닙니다.',422);}else if(provider==='slack')await remote(slackUrl('conversations.info',{channel:scope.channel_id}),auth());else if(provider==='discord')await remote(`https://discord.com/api/v10/channels/${enc(scope.channel_id)}`,auth());else if(provider==='github')await remote(github,auth(),{headers:ghead});else if(provider==='teams')await remote(teams,auth());return {ok:true};}
 async function page(cursor={}){await initialize();let data,items,next,threads=[];
  if(provider==='gmail'){data=await remote(q(`${gmail}/messages`,{labelIds:scope.label_id,q:scope.query,pageToken:cursor.page,maxResults:PAGE}),auth());items=await Promise.all((data.messages||[]).map(v=>get(v.id)));next=data.nextPageToken;}
  else if(provider==='drive'){data=await remote(q(drive,{q:`'${scope.folder_id}' in parents and trashed = false`,fields:'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents,trashed,lastModifyingUser)',pageToken:cursor.page,pageSize:PAGE,orderBy:'modifiedTime desc'}),auth());items=[];for(const v of data.files||[])items.push(await driveRecord(v));next=data.nextPageToken;}
  else if(provider==='slack'){data=await remote(slackUrl('conversations.history',{channel:scope.channel_id,cursor:cursor.page,limit:PAGE}),auth());items=(data.messages||[]).map(slackRecord);threads=(data.messages||[]).filter(x=>x.reply_count>0).map(x=>x.ts);next=data.response_metadata?.next_cursor;}
  else if(provider==='discord'){data=await remote(q(`https://discord.com/api/v10/channels/${enc(scope.channel_id)}/messages`,{before:cursor.page,limit:PAGE}),auth());if(!Array.isArray(data))fail('REMOTE_INVALID_RESPONSE','Discord 응답 형식을 확인할 수 없습니다.',502);items=data.map(discordRecord);next=data.length===PAGE?data.at(-1)?.id:null;}
  else if(provider==='github'){data=await remote(q(`${github}/issues`,{state:'all',sort:'updated',direction:'desc',per_page:PAGE,page:cursor.page||1}),auth(),{headers:ghead});if(!Array.isArray(data))fail('REMOTE_INVALID_RESPONSE','GitHub 응답 형식을 확인할 수 없습니다.',502);items=data.map(githubRecord);threads=['comments'];next=data.length===PAGE?Number(cursor.page||1)+1:null;}
  else if(provider==='teams'){data=await remote(cursor.page?safeNext(cursor.page,teams+'/messages?'):q(teams+'/messages',{'$top':PAGE}),auth());items=(data.value||[]).map(teamsRecord);threads=(data.value||[]).map(x=>x.id);next=safeNext(data['@odata.nextLink'],teams+'/messages?');}
  else fail('INVALID_INTEGRATION','브리지에서 대화를 보내 주세요.');
  return {items:items.filter(Boolean),cursor:next?{page:next}:{},hasMore:Boolean(next),threads};
 }
 async function threadPage(root,cursor={}){await initialize();let data,items,next;
  if(provider==='slack'){data=await remote(slackUrl('conversations.replies',{channel:scope.channel_id,ts:root,cursor:cursor.page,limit:PAGE}),auth());items=(data.messages||[]).filter(x=>x.ts!==root).map(x=>({...slackRecord(x),id:`${root}/${x.ts}`}));next=data.response_metadata?.next_cursor;}
  else if(provider==='teams'){const prefix=`${teams}/messages/${enc(root)}/replies`;data=await remote(cursor.page?safeNext(cursor.page,prefix+'?'):q(prefix,{'$top':PAGE}),auth());items=(data.value||[]).map(x=>({...teamsRecord(x),id:`${root}/${x.id}`}));next=safeNext(data['@odata.nextLink'],prefix+'?');}
  else if(provider==='github'){data=await remote(q(`${github}/issues/comments`,{sort:'updated',direction:'desc',per_page:PAGE,page:cursor.page||1}),auth(),{headers:ghead});if(!Array.isArray(data))fail('REMOTE_INVALID_RESPONSE','GitHub 의견 응답을 확인할 수 없습니다.',502);items=data.map(githubComment);next=data.length===PAGE?Number(cursor.page||1)+1:null;}
  else return {items:[],cursor:{},hasMore:false};
  return {items,cursor:next?{page:next}:{},hasMore:Boolean(next)};
 }
 async function search(query){await initialize();query=String(query||'').trim();if(!query||query.length>500)fail('INVALID_INTEGRATION','검색어는 1–500자까지 입력하세요.');let data;
  if(provider==='gmail'){// Label filtering is an independent server parameter, so search syntax cannot escape it.
   data=await remote(q(`${gmail}/messages`,{labelIds:scope.label_id,q:scope.query?`(${scope.query}) (${query})`:query,maxResults:10}),auth());const items=await Promise.all((data.messages||[]).map(x=>get(x.id)));return items.filter(x=>x&&!x.deleted).map(x=>({id:x.id,title:x.text.split('\n')[0],snippet:x.text.slice(0,500),url:x.url,occurred_at:x.sent_at}));
  }
  if(provider==='drive'){const term=query.replaceAll('\\','\\\\').replaceAll("'","\\'");data=await remote(q(drive,{q:`'${scope.folder_id}' in parents and trashed = false and (name contains '${term}' or fullText contains '${term}')`,fields:'files(id,name,webViewLink,modifiedTime,description)',pageSize:10}),auth());return (data.files||[]).map(x=>({id:x.id,title:x.name,snippet:x.description||'',url:x.webViewLink||`https://drive.google.com/file/d/${enc(x.id)}/view`,occurred_at:x.modifiedTime}));}
  fail('REMOTE_SEARCH_UNSUPPORTED','Gmail·Drive 연결에서 원본 검색을 사용할 수 있습니다.',422);
 }
 return {test,page,get,search,initialize,threadPage};
}
module.exports={createAdapter,createTransport,mimeText,record,safeNext,PAGE};
