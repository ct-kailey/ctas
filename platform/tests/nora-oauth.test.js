'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {createPool,migrate,transaction}=require('../server/db');
const {queueBinding}=require('../server/project-nora');
const {createNoraOAuth,normalizeTokens,redirect,RESOURCE,SCOPES}=require('../server/nora-oauth');
const vault=require('../server/integration-contract');
const CALLBACK='http://127.0.0.1:3210/api/nora/oauth/callback';
test('OAuth callback URI and token payload validation reject unsafe forms and missing scopes',()=>{
  assert.equal(redirect(CALLBACK),CALLBACK);
  for(const value of ['http://example.com/callback','https://user:secret@example.com/callback','https://example.com/callback?next=evil','https://example.com/callback#token','not-url'])assert.throws(()=>redirect(value),{code:'NORA_OAUTH_CONFIG_REQUIRED'});
  const token={access_token:'synthetic-access',refresh_token:'synthetic-refresh',token_type:'Bearer',expires_in:3600,scope:SCOPES};
  assert.equal(normalizeTokens(token,{client_id:'client'}).client_id,'client');
  for(const update of [{access_token:'bad\ntoken'},{token_type:'basic'},{expires_in:-1},{scope:'read'},{resource:'https://other.example'}])assert.throws(()=>normalizeTokens({...token,...update}));
});
test('project Nora OAuth isolates grants, encrypts PKCE, consumes state once and serializes refresh', {skip:!process.env.TEST_DATABASE_URL}, async t=>{
  const schema='nora_oauth_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);let pool;
  t.after(async()=>{if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
  const users={};for(const role of ['owner','reviewer','outsider'])users[role]=(await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[`${role}@oauth.test`,role,'unused'])).rows[0].id;
  async function fixture(){return transaction(pool,async db=>{const p=(await db.query("INSERT INTO projects(name) VALUES('OAuth synthetic') RETURNING id")).rows[0].id;await db.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'reviewer')",[p,users.owner,users.reviewer]);const w='t_'+randomUUID().replaceAll('-','');await queueBinding(db,p,users.owner,w);return {p,w};});}
  const key=randomBytes(32).toString('base64'),calls=[];let time=Date.now(),tokenFailure=false;
  const fetchImpl=async(url,options)=>{
    assert.equal(new URL(url).origin,'https://platform.nora.my');assert.equal(options.redirect,'error');assert.ok(!Object.keys(options.headers).some(k=>k.toLowerCase()==='authorization'));
    calls.push({url,body:options.body});
    if(url.endsWith('/register')){const body=JSON.parse(options.body);assert.deepEqual(body.redirect_uris,[CALLBACK]);assert.equal(body.token_endpoint_auth_method,'none');return Response.json({client_id:'synthetic-client',token_endpoint_auth_method:'none',redirect_uris:[CALLBACK]},{status:201});}
    const body=new URLSearchParams(options.body);assert.equal(body.get('resource'),RESOURCE);
    if(tokenFailure)return Response.json({error:'invalid_grant',error_description:'secret-value'},{status:400});
    return Response.json({access_token:body.get('grant_type')==='refresh_token'?'refreshed-access':'synthetic-access',refresh_token:'synthetic-refresh',token_type:'Bearer',expires_in:3600,scope:SCOPES});
  };
  const service=createNoraOAuth({pool,encryptionKey:key,redirectUri:CALLBACK,fetchImpl,now:()=>time});
  const start=async f=>{const result=await service.start(f.p,users.owner),url=new URL(result.url);return {result,url,state:url.searchParams.get('state')};};
  await t.test('only owner starts consent; missing and cross-project credentials never call remote',async()=>{
    const f=await fixture();assert.equal((await service.status(f.p,users.owner)).can_connect,true);assert.equal((await service.status(f.p,users.reviewer)).can_connect,false);
    const before=calls.length;await assert.rejects(service.start(f.p,users.reviewer),{code:'FORBIDDEN'});await assert.rejects(service.status(f.p,users.outsider),{code:'FORBIDDEN'});
    await assert.rejects(service.getAccessToken({projectId:f.p,workspaceId:f.w}),{code:'NORA_AUTH_REQUIRED'});await assert.rejects(service.getAccessToken({projectId:f.p,workspaceId:'t_other_workspace'}),{code:'NORA_WORKSPACE_SCOPE_MISMATCH'});assert.equal(calls.length,before);
  });
  await t.test('authorization uses PKCE and resource; DB and browser return no token or verifier',async()=>{
    const f=await fixture(),s=await start(f);assert.equal(s.url.origin,'https://platform.nora.my');assert.equal(s.url.pathname,'/api/v1/oauth/authorize');assert.equal(s.url.searchParams.get('resource'),RESOURCE);assert.equal(s.url.searchParams.get('code_challenge_method'),'S256');
    const pending=(await pool.query('SELECT * FROM project_nora_oauth_states WHERE project_id=$1',[f.p])).rows[0];assert.notEqual(pending.state_hash,s.state);assert.ok(!JSON.stringify(pending).includes(s.state));
    await assert.rejects(service.callback(users.reviewer,{state:s.state,code:'synthetic-code'}),{code:'NORA_OAUTH_STATE_INVALID'});
    await service.callback(users.owner,{state:s.state,code:'synthetic-code'});
    const exchange=new URLSearchParams(calls.at(-1).body);assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),s.url.searchParams.get('code_challenge'));
    const stored=(await pool.query('SELECT * FROM project_nora_oauth WHERE project_id=$1',[f.p])).rows[0];assert.ok(!JSON.stringify(stored).includes('synthetic-access'));assert.ok(!JSON.stringify(stored).includes('synthetic-refresh'));
    assert.equal(await service.getAccessToken({projectId:f.p,workspaceId:f.w}),'synthetic-access');const status=await service.status(f.p,users.owner);assert.equal(status.connected,true);assert.ok(!JSON.stringify(status).includes('synthetic-access'));
    await assert.rejects(service.callback(users.owner,{state:s.state,code:'synthetic-code'}),{code:'NORA_OAUTH_STATE_INVALID'});
    const other=await fixture();await pool.query('UPDATE project_nora_workspaces SET status=\'awaiting_auth\' WHERE project_id=$1',[other.p]);const otherStart=await start(other);
    await service.callback(users.owner,{state:otherStart.state,code:'other-code'});assert.equal((await pool.query('SELECT status FROM project_nora_workspaces WHERE project_id=$1',[other.p])).rows[0].status,'pending');
    await assert.rejects(Promise.resolve().then(()=>vault.unseal(stored.secret_ciphertext,`ains:nora:oauth:v1:${other.p}:${other.w}`,key)),{code:'INTEGRATION_CREDENTIAL_INVALID'});
  });
  await t.test('expired, superseded and denied state is single-use',async()=>{
    const f=await fixture(),old=await start(f),fresh=await start(f);await assert.rejects(service.callback(users.owner,{state:old.state,code:'code'}),{code:'NORA_OAUTH_STATE_INVALID'});
    await assert.rejects(service.callback(users.owner,{state:fresh.state,error:'access_denied'}),{code:'NORA_OAUTH_DENIED'});await assert.rejects(service.callback(users.owner,{state:fresh.state,code:'code'}),{code:'NORA_OAUTH_STATE_INVALID'});
    const expired=await start(f);time+=11*60000;await assert.rejects(service.callback(users.owner,{state:expired.state,code:'code'}),{code:'NORA_OAUTH_STATE_INVALID'});
  });
  await t.test('revoked owner cannot complete consent; token exchange failure consumes state and redacts error',async()=>{
    const f=await fixture(),s=await start(f);await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2",[f.p,users.owner]);await assert.rejects(service.callback(users.owner,{state:s.state,code:'code'}),{code:'FORBIDDEN'});
    await pool.query("UPDATE memberships SET role='owner' WHERE project_id=$1 AND user_id=$2",[f.p,users.owner]);tokenFailure=true;await assert.rejects(service.callback(users.owner,{state:s.state,code:'code'}),e=>e.code==='NORA_AUTH_REQUIRED'&&!e.message.includes('secret-value'));tokenFailure=false;
    await assert.rejects(service.callback(users.owner,{state:s.state,code:'code'}),{code:'NORA_OAUTH_STATE_INVALID'});
  });
  await t.test('concurrent callbacks exchange once and concurrent refresh requests rotate once',async()=>{
    const f=await fixture(),s=await start(f),before=calls.filter(c=>c.url.endsWith('/token')).length;
    const outcomes=await Promise.allSettled([service.callback(users.owner,{state:s.state,code:'code'}),service.callback(users.owner,{state:s.state,code:'code'})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(calls.filter(c=>c.url.endsWith('/token')).length,before+1);
    time+=3600*1000;const count=calls.length;const tokens=await Promise.all([service.getAccessToken({projectId:f.p,workspaceId:f.w}),service.getAccessToken({projectId:f.p,workspaceId:f.w})]);assert.deepEqual(tokens,['refreshed-access','refreshed-access']);assert.equal(calls.length,count+1);
  });
  await t.test('successful reconnect preserves uncertain context writes and invalid server configuration cannot connect',async()=>{
    const f=await fixture();await pool.query("UPDATE project_nora_workspaces SET status='uncertain',stage='context_space' WHERE project_id=$1",[f.p]);const s=await start(f);await service.callback(users.owner,{state:s.state,code:'code'});assert.equal((await pool.query('SELECT status FROM project_nora_workspaces WHERE project_id=$1',[f.p])).rows[0].status,'uncertain');
    const unconfigured=createNoraOAuth({pool,redirectUri:CALLBACK,encryptionKey:'bad'});assert.equal((await unconfigured.status(f.p,users.owner)).can_connect,false);await assert.rejects(unconfigured.start(f.p,users.owner),{code:'NORA_VAULT_UNAVAILABLE'});
  });
  await t.test('rejected access and refresh tokens require new consent without invalidating newer grants',async()=>{
    const f=await fixture(),s=await start(f);await service.callback(users.owner,{state:s.state,code:'code'});
    await service.invalidateAccessToken({projectId:f.p,workspaceId:f.w,accessToken:'old-unrelated-token'});assert.equal((await service.status(f.p,users.owner)).connected,true);
    await service.invalidateAccessToken({projectId:f.p,workspaceId:f.w,accessToken:'synthetic-access'});assert.equal((await service.status(f.p,users.owner)).connected,false);
    const again=await start(f);await service.callback(users.owner,{state:again.state,code:'code'});time+=3600*1000;tokenFailure=true;
    await assert.rejects(service.getAccessToken({projectId:f.p,workspaceId:f.w}),{code:'NORA_AUTH_REQUIRED'});tokenFailure=false;
    assert.equal((await service.status(f.p,users.owner)).connected,false);
  });
  await t.test('a grant stops authorizing requests when its consenting owner loses the owner role',async()=>{
    const f=await fixture(),s=await start(f);await service.callback(users.owner,{state:s.state,code:'code'});
    await pool.query("UPDATE memberships SET role='reviewer' WHERE project_id=$1 AND user_id=$2",[f.p,users.owner]);
    assert.equal((await service.status(f.p,users.owner)).connected,false);
    const count=calls.length;await assert.rejects(service.getAccessToken({projectId:f.p,workspaceId:f.w}),{code:'NORA_AUTH_REQUIRED'});assert.equal(calls.length,count);
  });
});
