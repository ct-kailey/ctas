'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {hashPassword,verifyPassword,provisionUser,sha256}=require('../server/auth');
const {createApp}=require('../server/server');

test('password hashes use random salt; malformed and wrong passwords fail',async()=>{
  const a=await hashPassword('correct-password-123'),b=await hashPassword('correct-password-123');
  assert.notEqual(a,b);assert.equal(await verifyPassword('correct-password-123',a),true);
  assert.equal(await verifyPassword('wrong-password',a),false);assert.equal(await verifyPassword('password','malformed'),false);
  await assert.rejects(()=>hashPassword('short'),{code:'PASSWORD_POLICY'});
});

test('HTTP authentication, project isolation, role checks, CSRF, original download and logout', {skip:!process.env.TEST_DATABASE_URL}, async(t)=>{
  const schema='http_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});
  let server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  await migrate(pool);await migrate(pool);
  const owner=await provisionUser(pool,{email:'owner@example.test',name:'Owner',password:'owner-test-password'});
  const viewer=await provisionUser(pool,{email:'viewer@example.test',name:'Viewer',password:'viewer-test-password'});
  await provisionUser(pool,{email:'outsider@example.test',name:'Outsider',password:'outsider-test-password'});
  const app=createApp({pool,appOrigin:'https://workspace.example.test',production:true});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,origin='https://workspace.example.test';
  const call=(route,options={})=>fetch(base+route,options);
  assert.equal((await call('/api/session')).status,401);
  assert.equal((await call('/healthz')).status,200);
  async function login(email,password){
    const response=await call('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({email,password})});
    assert.equal(response.status,200);const data=await response.json(),setCookie=response.headers.get('set-cookie');
    assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Lax/);
    return {cookie:setCookie.split(';')[0],csrf:data.csrfToken,user:data.user};
  }
  const a=await login('owner@example.test','owner-test-password');
  const headers={Cookie:a.cookie,Origin:origin,'Content-Type':'application/json','X-CSRF-Token':a.csrf};
  const p=await call('/api/projects',{method:'POST',headers,body:JSON.stringify({name:'격리 검증'})});
  assert.equal(p.status,201);const {project}=await p.json();
  const prefix='/api/projects/'+project.id;
  assert.equal((await call(prefix+'/documents',{headers:{Cookie:a.cookie}})).status,200);
  assert.equal((await call('/api/projects',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:'{"name":"X"}'})).status,403);
  assert.equal((await call('/api/projects',{method:'POST',headers:{...headers,'X-CSRF-Token':'forged'},body:'{"name":"X"}'})).status,403);
  const outside=await login('outsider@example.test','outsider-test-password');
  assert.equal((await call(prefix+'/overview',{headers:{Cookie:outside.cookie}})).status,404);
  const form=new FormData();form.set('file',new Blob(['합성 요구사항: 허용 한도는 5입니다.']), '요구사항.txt');form.set('title','합성 문서');
  const upload=await call(prefix+'/documents',{method:'POST',headers:{Cookie:a.cookie,Origin:origin,'X-CSRF-Token':a.csrf},body:form});
  assert.equal(upload.status,202);const uploaded=await upload.json();
  const original=await call(prefix+'/revisions/'+uploaded.revision_id+'/original',{headers:{Cookie:a.cookie}});
  assert.equal(original.status,200);assert.match(original.headers.get('content-disposition'),/attachment/);
  assert.equal(await original.text(),'합성 요구사항: 허용 한도는 5입니다.');
  const revision=await(await call(prefix+'/revisions/'+uploaded.revision_id,{headers:{Cookie:a.cookie}})).json();
  assert.equal(revision.revision.filename,'요구사항.txt');assert.equal(revision.revision.content,undefined);
  assert.equal((await call(prefix+'/revisions/'+uploaded.revision_id+'/original',{headers:{Cookie:outside.cookie}})).status,404);
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'viewer')",[project.id,viewer.id]);
  const v=await login('viewer@example.test','viewer-test-password');
  assert.equal((await call(prefix+'/documents',{method:'POST',headers:{Cookie:v.cookie,Origin:origin,'X-CSRF-Token':v.csrf},body:form})).status,403);
  await pool.query("UPDATE memberships SET role='member' WHERE project_id=$1 AND user_id=$2",[project.id,viewer.id]);
  assert.equal((await call(prefix+'/reviews/'+randomUUID()+'/decision',{method:'POST',headers:{Cookie:v.cookie,Origin:origin,'X-CSRF-Token':v.csrf,'Content-Type':'application/json'},body:'{}'})).status,403);
  const listed=await(await call(prefix+'/overview',{headers:{Cookie:a.cookie}})).json();assert.equal(listed.documents.length,1);
  assert.equal(listed.documents[0].revisions[0].content,undefined);
  await pool.query("INSERT INTO auth_attempts(bucket,count,expires_at) VALUES($1,15,now()+interval '1 minute') ON CONFLICT(bucket) DO UPDATE SET count=15",['account:'+sha256('owner@example.test')]);
  assert.equal((await call('/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test',password:'owner-test-password'})})).status,429);
  assert.equal((await call('/api/auth/logout',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await call('/api/session',{headers:{Cookie:a.cookie}})).status,401);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[owner.id])).rows[0].n,0);
});
