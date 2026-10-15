'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/db');
const {provisionUser}=require('../server/auth');
const {createLedger}=require('../server/ledger');
const {createImplementationLedger}=require('../server/implementation-ledger');
const {createApp}=require('../server/server');

test('project profile PATCH preserves identities and requires owner, version and atomic audit',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const schema='profile_'+randomUUID().replaceAll('-',''),admin=createPool(process.env.TEST_DATABASE_URL);let pool,server;
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();});
  await admin.query(`CREATE SCHEMA ${schema}`);pool=createPool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await migrate(pool);
  const users={};for(const role of ['owner','reviewer','member','viewer','outsider'])users[role]=await provisionUser(pool,{email:role+'@profile.test',name:role,password:'synthetic-profile-password'});
  const ledger=createLedger(pool),settings=createImplementationLedger(pool),project=await ledger.createProject(users.owner.id,{name:'AINS',project_kind:'product_development',nora_workspace_id:'t_profile_'+randomUUID().replaceAll('-',''),request_id:randomUUID()});
  for(const role of ['reviewer','member','viewer'])await pool.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)',[project.id,users[role].id,role]);
  let initial=await settings.getSettings(project.id,users.owner.id);
  initial=await settings.saveSettings(project.id,users.owner.id,{expected_version:initial.version,goal:'업무 정책을 구현합니다.',repository_url:'https://github.com/example/profile.git',base_branch:'main'});
  await settings.recordRepositoryCheck(project.id,users.owner.id,initial.version,{status:'ready',head_sha:'a'.repeat(40),checked_at:new Date().toISOString(),credential_source:'nora'});
  const source=await ledger.createRecord(project.id,users.owner.id,{title:'기존 회의 기록',document_category:'meeting',text:'프로젝트 이름 변경 전에 보존한 원문.'});
  const binding=(await pool.query('SELECT * FROM project_nora_workspaces WHERE project_id=$1',[project.id])).rows[0];
  const document=(await pool.query('SELECT * FROM documents WHERE project_id=$1 AND id=$2',[project.id,source.document_id])).rows[0];
  const revision=(await pool.query('SELECT * FROM revisions WHERE project_id=$1 AND id=$2',[project.id,source.revision_id])).rows[0];
  const origin='https://profile.example.test';server=createApp({pool,appOrigin:origin,production:true}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port,route='/api/projects/'+project.id+'/settings',sessions={};
  for(const role of Object.keys(users)){
    const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:users[role].email,password:'synthetic-profile-password'})});assert.equal(response.status,200);
    const data=await response.json();sessions[role]={Cookie:response.headers.get('set-cookie').split(';')[0],Origin:origin,'Content-Type':'application/json','X-CSRF-Token':data.csrfToken};
  }
  async function patch(role,body,extraHeaders={}){const response=await fetch(base+route,{method:'PATCH',headers:{...sessions[role],...extraHeaders},body:JSON.stringify(body)});return{status:response.status,body:await response.json()};}
  async function get(){const response=await fetch(base+route,{headers:sessions.owner});assert.equal(response.status,200);return(await response.json()).settings;}
  async function countEvents(){return Number((await pool.query("SELECT count(*) n FROM events WHERE project_id=$1 AND kind='implementation.settings_updated'",[project.id])).rows[0].n);}

  await t.test('partial name edit renames AINS to CTAS without replacing project, workspace, repository or documents',async()=>{
    const before=await get(),response=await patch('owner',{expected_version:before.version,name:'  CTAS  '});assert.equal(response.status,200);
    const result=response.body.settings;assert.equal(result.name,'CTAS');assert.equal(result.version,before.version+1);assert.equal(result.project_id,project.id);
    for(const key of ['goal','project_kind','repository_url','base_branch'])assert.equal(result[key],before[key]);assert.equal(result.repository_check,null);
    assert.deepEqual((await pool.query('SELECT * FROM project_nora_workspaces WHERE project_id=$1',[project.id])).rows[0],binding);
    assert.deepEqual((await pool.query('SELECT * FROM documents WHERE project_id=$1 AND id=$2',[project.id,source.document_id])).rows[0],document);
    assert.deepEqual((await pool.query('SELECT * FROM revisions WHERE project_id=$1 AND id=$2',[project.id,source.revision_id])).rows[0],revision);
    const list=await(await fetch(base+'/api/projects',{headers:sessions.owner})).json();assert.equal(list.projects.find(p=>p.id===project.id).name,'CTAS');
    const event=(await pool.query("SELECT * FROM events WHERE project_id=$1 AND kind='implementation.settings_updated' ORDER BY created_at DESC,id DESC LIMIT 1",[project.id])).rows[0];
    assert.equal(event.actor_id,users.owner.id);assert.equal(event.entity_id,project.id);assert.deepEqual(event.detail.changed_fields,['name']);assert.deepEqual(event.detail.previous,{name:'AINS'});assert.equal(event.detail.name,'CTAS');
  });
  await t.test('basic information edits retain omitted values and no-op saves do not change version or audit',async()=>{
    const before=await get(),response=await patch('owner',{expected_version:before.version,goal:'새 프로젝트 목표',project_kind:'client_project'});assert.equal(response.status,200);assert.equal(response.body.settings.name,'CTAS');assert.equal(response.body.settings.repository_url,before.repository_url);assert.equal(response.body.settings.goal,'새 프로젝트 목표');
    const count=await countEvents(),repeat=await patch('owner',{expected_version:response.body.settings.version,name:'CTAS'});assert.equal(repeat.status,200);assert.equal(repeat.body.settings.version,response.body.settings.version);assert.equal(await countEvents(),count);
  });
  await t.test('owner-only membership, project scope, CSRF and closed field validation prevent unauthorized edits',async()=>{
    const before=await get(),count=await countEvents();
    for(const role of ['reviewer','member','viewer','outsider'])assert.equal((await patch(role,{expected_version:before.version,name:'unauthorized'})).status,role==='outsider'?404:403);
    assert.equal((await patch('owner',{expected_version:before.version,name:'unauthorized'},{'X-CSRF-Token':'forged'})).status,403);
    for(const body of [{name:''},{name:'x'.repeat(201)},{name:null},{project_kind:null},{goal:null},{project_id:'replace'},{workspace_id:'t_replace_workspace'},{repository_url:null}])assert.equal((await patch('owner',{expected_version:before.version,...body})).status,400);
    assert.deepEqual(await get(),before);assert.equal(await countEvents(),count);
  });
  await t.test('concurrent profile edits use the same CAS and cannot lose another owner update',async()=>{
    const before=await get(),results=await Promise.all(['목표 A','목표 B'].map(goal=>patch('owner',{expected_version:before.version,goal})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(results.find(r=>r.status===409).body.error.code,'SETTINGS_VERSION_CONFLICT');
    const after=await get();assert.equal(after.version,before.version+1);assert.equal(after.name,'CTAS');assert.ok(['목표 A','목표 B'].includes(after.goal));
    const stale=await patch('owner',{expected_version:before.version,name:'lost update'});assert.equal(stale.status,409);assert.deepEqual(await get(),after);
  });
  await t.test('audit failure rolls back name, information and version together',async()=>{
    const before=await get(),count=await countEvents();
    await pool.query("CREATE FUNCTION reject_profile_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='implementation.settings_updated' AND NEW.detail->>'name'='rollback-name' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_profile_audit BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION reject_profile_audit()");
    try{await assert.rejects(settings.saveSettings(project.id,users.owner.id,{expected_version:before.version,name:'rollback-name',goal:'rollback-goal'}),/synthetic audit failure/);}finally{await pool.query('DROP TRIGGER reject_profile_audit ON events; DROP FUNCTION reject_profile_audit()');}
    assert.deepEqual(await get(),before);assert.equal(await countEvents(),count);
  });
});
