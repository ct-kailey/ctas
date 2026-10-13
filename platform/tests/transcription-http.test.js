'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {sha256}=require('../server/auth');
const {createLedger}=require('../server/ledger');
const {createApp}=require('../server/server');
test('transcription HTTP authorizes multipart/audio/review and streams bounded ranges', {skip:!process.env.TEST_DATABASE_URL},async t=>{
 const schema='stt_http_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);let pool,server;
 t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema}`});await migrate(pool);
 const users={},sessions={},origin='https://transcription.example.test';for(const role of ['owner','reviewer','member','viewer','outsider']){users[role]=(await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[role+'@stt-http.test',role,'unused'])).rows[0].id;const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[sha256(token),users[role],csrf]);sessions[role]={Cookie:'ains_session='+token,Origin:origin,'X-CSRF-Token':csrf};}
 const ledger=createLedger(pool),p=await ledger.createProject(users.owner,{name:'음성 HTTP'}),q=await ledger.createProject(users.owner,{name:'외부 프로젝트'});for(const role of ['reviewer','member','viewer'])await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[p.id,users[role],role]);
 server=createApp({pool,appOrigin:origin,production:true,transcription:{resolveConfig:async()=>({apiKey:'test-not-real',transcriptionModel:'whisper-1'})}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`,prefix=`/api/projects/${p.id}/transcriptions`;
 const wav=Buffer.alloc(48);wav.write('RIFF');wav.writeUInt32LE(40,4);wav.write('WAVE',8);
 const makeForm=(buffer=wav)=>{const f=new FormData();f.set('request_id',randomUUID());f.set('title','음성 테스트');f.set('occurred_at','2026-10-12T09:00:00+09:00');f.set('audio',new Blob([buffer],{type:'audio/wav'}),'meeting.wav');return f;};
 const request=(path,options={})=>fetch(base+path,{...options,headers:options.headers||sessions.owner});
 assert.equal((await request(prefix,{headers:{}})).status,401);assert.equal((await request(prefix,{headers:sessions.outsider})).status,404);assert.equal((await request(prefix,{headers:sessions.viewer})).status,200);
 for(const headers of [sessions.viewer,{...sessions.owner,'X-CSRF-Token':'wrong'},{...sessions.owner,Origin:'https://other.test'}])assert.equal((await request(prefix,{method:'POST',headers,body:makeForm()})).status,403);
 const bad=await request(prefix,{method:'POST',body:makeForm(Buffer.from('not an audio file'))});assert.equal(bad.status,415);assert.equal((await bad.json()).error.code,'TRANSCRIPTION_FILE_SIGNATURE');
 const uploaded=await request(prefix,{method:'POST',headers:sessions.member,body:makeForm()});assert.equal(uploaded.status,201);const job=(await uploaded.json()).job;assert.equal(job.audio,undefined);
 assert.equal((await request(`${prefix}/${job.id}/audio`,{headers:{}})).status,401);assert.equal((await request(`${prefix}/${job.id}/audio`,{headers:sessions.outsider})).status,404);assert.equal((await request(`/api/projects/${q.id}/transcriptions/${job.id}/audio`)).status,404);
 const original=await request(`${prefix}/${job.id}/audio`,{headers:sessions.viewer});assert.equal(original.status,200);assert.equal(original.headers.get('cache-control'),'no-store');assert.equal(original.headers.get('content-type'),'audio/wav');assert.deepEqual(Buffer.from(await original.arrayBuffer()),wav);
 const part=await request(`${prefix}/${job.id}/audio`,{headers:{...sessions.viewer,Range:'bytes=8-11'}});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),'bytes 8-11/48');assert.equal(await part.text(),'WAVE');
 assert.equal((await request(`${prefix}/${job.id}/audio`,{headers:{...sessions.viewer,Range:'bytes=0-1,3-5'}})).status,416);assert.equal((await request(`${prefix}/${job.id}/audio`,{headers:{...sessions.viewer,Range:'bytes=100-'}})).status,416);
 const downloaded=await request(`${prefix}/${job.id}/audio?download=1`);assert.match(downloaded.headers.get('content-disposition'),/^attachment/);
 assert.equal((await request(`${prefix}/${job.id}/review`,{method:'POST',headers:{...sessions.member,'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await request(`${prefix}/${job.id}/cancel`,{method:'POST',headers:{...sessions.member,'Content-Type':'application/json'},body:JSON.stringify({expected_attempt:0})})).status,200);
});
