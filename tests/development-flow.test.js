'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../nora/task-automation/development-flow');
const {hash}=require('../platform/server/context-contract');
const {assertDevelopmentHistoryFlow}=require('../platform/server/nora-task-provider');
const Q='11111111-1111-4111-a111-111111111111',OTHER='22222222-2222-4222-a222-222222222222';
function fixture(){
  const sentence='목록을 보여주고 정렬 순서는 협의한다.';
  const snapshot={source:{segments:[{segment_id:'s1',text:sentence,extraction_status:'ok'}]},automation:{uncertainty_mode:'per_task'}};
  const developmentContext={contract_version:'1.0',provisional_authorized:true,confirmed_at:new Date(Date.now()-60000).toISOString(),questions:[{id:Q,status:'sent',question:'정렬 순서는?',answer:null}]};
  const artifact={pr_number:1,head_sha:'b'.repeat(40),base_sha:'a'.repeat(40),preview_url:'https://preview.example',changed_files:['src/list.jsx'],diff:'diff --git a/src/list.jsx b/src/list.jsx\n+order by name'};
  const note={id:'choice1',kind:'temporary_decision',category:'ui_behavior',reversible:true,title:'목록 기본 정렬',uncertainty:'정렬 순서 미정',temporary_approach:'이름순 정렬',rationale:'되돌릴 수 있는 기본 순서',impact:'목록 순서만 변경',replacement_condition:'고객 답변이 오면 변경',evidence:[{segment_id:'s1',quote:sentence}],question_ids:[Q],implemented_at:null,code_paths:['src/list.jsx']};
  const report={contract_version:'3.0',completion:'complete',remaining_criteria:[],notes:[note],question_outcomes:[{question_id:Q,status:'temporary_implemented',note_ids:['choice1'],explanation:'이름순으로 임시 구현했고 고객 답변을 기다린다.'}]};
  const input={projectId:'project1',taskId:'task1',snapshotHash:'c'.repeat(64),snapshot,developmentContext,task:{acceptance_criteria:['목록 표시']}};
  const result={schema_version:'3.0',project_id:input.projectId,task_id:input.taskId,input_sha256:input.snapshotHash,development_context_sha256:hash(developmentContext),artifact:Object.fromEntries(['pr_number','head_sha','base_sha','preview_url'].map(k=>[k,artifact[k]])),implementation_report:report};
  return {snapshot,developmentContext,artifact,note,report,input,result,validate:()=>D.validateImplementationReport(report,snapshot,{acceptanceCriteria:input.task.acceptance_criteria,developmentContext,artifact})};
}
test('actual temporary work binds exact question snapshot, verified changed files and server trace',()=>{
  const f=fixture(),r=D.validateDevelopmentResult({...f.result,trace_id:'trc_verified12345'},f.input,{artifact:f.artifact});
  assert.equal(r.implementation_report.notes[0].implemented_at,null);assert.equal(r.implementation_report.completion,'complete');
  for(const key of ['project_id','task_id','input_sha256','development_context_sha256']){const copy=structuredClone(f.result);copy[key]=key.endsWith('sha256')?'d'.repeat(64):'other';assert.throws(()=>D.validateDevelopmentResult(copy,f.input,{artifact:f.artifact}),{code:'NORA_DEVELOPMENT_CONTEXT_MISMATCH'});}
});
test('every delivered question needs one honest outcome with bidirectional note links',()=>{
  for(const mutate of [f=>f.report.question_outcomes=[],f=>f.report.question_outcomes.push({...f.report.question_outcomes[0]}),f=>f.note.question_ids=[OTHER],f=>f.report.question_outcomes[0].note_ids=[],f=>f.report.question_outcomes[0].note_ids=['missing']]){const f=fixture();mutate(f);assert.throws(f.validate);}
});
test('received answer can be applied without asserting customer approval, unanswered cannot',()=>{
  const f=fixture();f.report.question_outcomes[0].status='answered_applied';assert.throws(f.validate,{code:'NORA_DEVELOPMENT_ANSWER_UNVERIFIED'});
  f.developmentContext.questions[0].status='answered_pending';f.developmentContext.questions[0].answer='이름순으로 보여주세요.';assert.equal(f.validate().question_outcomes[0].status,'answered_applied');assert.equal(f.developmentContext.questions[0].status,'answered_pending');
});
test('proposals, nonexistent code paths and invented dates cannot become implementation history',()=>{
  for(const code_paths of [[],['src/other.jsx'],['../secret'],['/etc/passwd'],['src/list.jsx','src/list.jsx']]){const f=fixture();f.note.code_paths=code_paths;assert.throws(f.validate,{code:'NORA_DEVELOPMENT_CODE_EVIDENCE_INVALID'});}
  const noWork=fixture();assert.throws(()=>D.validateImplementationReport(noWork.report,noWork.snapshot,{acceptanceCriteria:[],developmentContext:noWork.developmentContext,artifact:null}),{code:'NORA_DEVELOPMENT_CODE_EVIDENCE_INVALID'});
  for(const t of ['not a date','2000-01-01T00:00:00Z',new Date(Date.now()+3600000).toISOString()]){const f=fixture();f.note.implemented_at=t;assert.throws(f.validate,{code:'NORA_DEVELOPMENT_TIME_INVALID'});}
});
test('unapproved temporary choices and missing work gaps are not silently complete',()=>{
  const f=fixture();f.developmentContext.provisional_authorized=false;assert.throws(f.validate,{code:'NORA_DEVELOPMENT_CONSENT_REQUIRED'});
  const gap=fixture();gap.report.question_outcomes[0].status='deferred';assert.throws(gap.validate,{code:'NORA_DEVELOPMENT_GAP_REQUIRED'});
  gap.note.kind='work_gap';gap.note.temporary_approach=null;gap.note.code_paths=[];assert.equal(gap.validate().completion,'partial');
});
test('development to history is one ungated flow; only history can retry and it has no tools',()=>{
  const flow=D.buildDevelopmentFlow({projectId:'project1',repositoryUrl:'https://github.com/acme/demo',baseBranch:'main',connectorId:'conn1',operations:[{id:'get_file',params:['repo','path','ref']},{id:'apply_task_patch',params:['repo','task_id','expected_base_sha','patch']},{id:'merge_pull_request',params:['repo','pull_number']}]});
  assertDevelopmentHistoryFlow(flow);const p=flow.payload;assert.equal(p.agents.length,2);assert.ok(p.agents.every(a=>a.requiresApproval===false));assert.deepEqual(p.agents[0].retry.rules,[]);assert.equal(p.agents[1].retry.rules[0].action.target,'self');assert.ok(p.toolBlocks.every(t=>t.runtime.operation!=='merge_pull_request'&&t.params.every(q=>q.name!=='repo')));assert.ok(p.toolBlocks.every(t=>p.edges.some(e=>e.sourceId===t.id&&e.targetId===p.agents[0].id)));
  for(const change of [p=>p.agents[0].requiresApproval=true,p=>p.edges.push({sourceId:p.toolBlocks[0].id,targetId:p.agents[1].id}),p=>p.agents[1].retry.rules[0].action.target={fromNode:p.agents[0].id},p=>p.agents[1].outputRules=[]]){const bad=structuredClone(flow);change(bad.payload);assert.throws(()=>assertDevelopmentHistoryFlow(bad));}
});

test('plausible model dates are not accepted as verified edit times and no-artifact gaps cannot claim changed files',()=>{
 const f=fixture();f.note.implemented_at=new Date().toISOString();assert.equal(f.validate().notes[0].implemented_at,null);
 const g=fixture();g.note.kind='work_gap';g.note.temporary_approach=null;g.report.completion='blocked';g.report.question_outcomes[0].status='deferred';assert.throws(()=>D.validateImplementationReport(g.report,g.snapshot,{developmentContext:g.developmentContext,artifact:null}),{code:'NORA_DEVELOPMENT_CODE_EVIDENCE_INVALID'});
});

test('SDK development keeps one API history node, fixed project metadata and no code replay',()=>{
 const input={projectId:'project1',repositoryUrl:'https://github.com/acme/demo',baseBranch:'main',executionMode:'nora_sdk',sdkProvider:'codex',sdkConnectionId:null,sdkWorkingFolder:'/approved/ctas'};
 const flow=D.buildDevelopmentFlow(input),[dev,history]=flow.payload.agents;
 assert.equal(dev.mode,'sdk');assert.equal(dev.sdkProvider,'codex');assert.equal(dev.model,'gpt-6.1-sol');assert.deepEqual(dev.modelParams,{});assert.equal(history.mode,'api');assert.equal(history.sdkProvider,undefined);assert.equal(history.model,'gpt-5.4-mini');
 assert.equal(flow.payload.meta.ains_execution_mode,'nora_sdk');assert.equal(flow.payload.meta.ains_sdk_working_folder,input.sdkWorkingFolder);assert.equal(flow.payload.meta.ains_sdk_connection_id,null);
 assert.equal(dev.retry.budget.maxTotalAttempts,1);assert.deepEqual(dev.retry.rules,[]);assert.ok(history.retry.rules.every(rule=>rule.action.target==='self'));
 assert.match(dev.prompt,/preflight EXACTLY/);assert.match(dev.prompt,/HEAD:refs\/heads/);assert.match(dev.prompt,/NOT prevent local development/);assert.match(dev.prompt,/NOT a sandbox/);assert.match(dev.prompt,/local_patch/);assert.match(history.prompt,/do not independently verify local changes/);
 assert.equal(D.buildDevelopmentFlow({...input,model:'custom-cli-model'}).payload.agents[0].model,'custom-cli-model');
 assert.equal(D.buildDevelopmentFlow({...input,sdkProvider:'claude-code'}).payload.agents[0].sdkProvider,'claude-code');
 for(const change of [{sdkProvider:'unknown'},{sdkWorkingFolder:'/approved/../elsewhere'},{sdkWorkingFolder:'relative'},{sdkWorkingFolder:'/'},{sdkConnectionId:''},{executionMode:'wrong'}])assert.throws(()=>D.buildDevelopmentFlow({...input,...change}));
});

test('API schemas retain the exact pre-SDK artifact contract while new results accept Git commits',()=>{
 const Ajv=require('ajv'),ajv=new Ajv({strict:true}),old=ajv.compile(D.LEGACY_MODEL_RESULT_SCHEMA),newSchema=ajv.compile(D.MODEL_RESULT_SCHEMA),f=fixture();
 assert.equal(old(f.result),true);assert.equal(newSchema(f.result),true);
 const commit={...f.result,artifact:{kind:'git_commit',base_sha:'a'.repeat(40),head_sha:'b'.repeat(40),preview_url:null,reported_checks:[{command:'npm test',exit_code:1,output:'one failing assertion'}]}};
 assert.equal(old(commit),false);assert.equal(newSchema(commit),true);
 const prWithChecks={...f.result,artifact:{...f.result.artifact,reported_checks:commit.artifact.reported_checks}};assert.equal(old(prWithChecks),false);assert.equal(newSchema(prWithChecks),true);
 assert.deepEqual(D.LEGACY_MODEL_RESULT_SCHEMA.properties.artifact,{anyOf:[D.LEGACY_PR_ARTIFACT_SCHEMA,{type:'null'}]});
 assert.deepEqual(D.LEGACY_DEVELOPMENT_RESULT_SCHEMA.properties.artifact,D.LEGACY_MODEL_RESULT_SCHEMA.properties.artifact);
 const flow=D.buildDevelopmentFlow({projectId:'project1',repositoryUrl:'https://github.com/acme/demo',baseBranch:'main',connectorId:'conn1'});
 assert.equal(flow.payload.agents[0].mode,'api');assert.equal(flow.payload.agents[0].model,'gpt-5.4');
 assert.match(flow.payload.agents[0].prompt,/Missing CI, hosted preview or PR operations does NOT prevent development/);
 assert.doesNotMatch(flow.payload.agents[0].prompt,/required write\/test\/preview capabilities/);
 assert.equal(D.validateDevelopmentResult(commit,f.input,{artifact:{...commit.artifact,...f.artifact}}).implementation_report.completion,'complete');
});

test('local patch reports cannot enter verified history without explicit unverified handling',()=>{
 const f=fixture(),artifact={kind:'local_patch',base_sha:'a'.repeat(40),patch:'diff --git a/src/list.jsx b/src/list.jsx\n--- a/src/list.jsx\n+++ b/src/list.jsx\n@@ -1 +1 @@\n-old\n+new\n',changed_files:['src/list.jsx'],reported_checks:[{command:'npm test',exit_code:null,output:'not executed: missing dependency'}]},result={...f.result,artifact};
 assert.throws(()=>D.validateDevelopmentResult(result,f.input),{code:'NORA_DEVELOPMENT_LOCAL_EVIDENCE_REQUIRED'});
 const reported=D.validateDevelopmentResult(result,f.input,{artifact:{...artifact,evidence_status:'unverified'},allowUnverified:true});
 assert.equal(reported.implementation_report.notes[0].implemented_at,null);assert.deepEqual(reported.artifact.reported_checks,artifact.reported_checks);
 assert.equal(reported.artifact.evidence_status,undefined,'validator does not grant evidence verification');
 for(const changed_files of [['../secret'],['.git/config'],['src/list.jsx','src/list.jsx'],['src/wrong.jsx']])assert.throws(()=>D.validateDevelopmentResult({...result,artifact:{...artifact,changed_files}},f.input,{allowUnverified:true}));
 assert.throws(()=>D.validateDevelopmentResult({...result,artifact:{...artifact,patch:'model says code changed'}},f.input,{allowUnverified:true}),{code:'NORA_DEVELOPMENT_LOCAL_ARTIFACT_INVALID'});
});

test('SDK context derives only a task worktree and never accepts caller-selected branch or path',()=>{
 const raw={provider:'codex',connection_id:null,working_folder:'/approved/ctas',repository_url:'https://github.com/acme/demo',base_branch:'main',base_sha:'a'.repeat(40),task_id:'task1',task_branch:'ains/task/task1'};
 const normalized=D.normalizeSdkExecutionContext(raw);assert.equal(normalized.task_working_folder,'/approved/ctas/.ains-task-worktrees/task1');assert.equal(normalized.repository_url,'https://github.com/acme/demo.git');
 assert.deepEqual(D.normalizeSdkExecutionContext({...raw,task_working_folder:normalized.task_working_folder}),normalized);
 for(const change of [{task_id:'../main'},{task_branch:'main'},{task_working_folder:'/another/repo'},{base_branch:'-main'},{base_branch:'refs/../main'},{base_branch:'main.lock'},{base_sha:'invalid'},{working_folder:'/approved//ctas'},{working_folder:'/approved/ctas/'}])assert.throws(()=>D.normalizeSdkExecutionContext({...raw,...change}),{code:'NORA_SDK_EXECUTION_CONTEXT_INVALID'});
 const commands=D.buildSdkExecutionCommands(raw);assert.match(commands.preflight,/node -e/);assert.match(commands.postflight,/'postflight'$/);assert.ok(!commands.preflight.includes('git reset'));
});

// The probe runs real Git in disposable repositories. Only its fetch transport
// is redirected to the fixture's local bare remote, so tests never use GitHub.
function sdkRepo(t){
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
 const top=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ains-sdk-probe-'))),root=path.join(top,"clone with 'quotes' $literal"),remote=path.join(top,'remote.git'),bin=path.join(top,'bin');fs.mkdirSync(root);fs.mkdirSync(bin);
 t.after(()=>fs.rmSync(top,{recursive:true,force:true}));
 const git=(args,cwd=root)=>cp.execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-b','main']);git(['config','user.name','SDK test']);git(['config','user.email','sdk@example.test']);fs.writeFileSync(path.join(root,'source.txt'),'base\n');git(['add','source.txt']);git(['commit','-m','base']);const base=git(['rev-parse','HEAD']);git(['clone','--bare',root,remote],top);git(['remote','add','origin','https://github.com/acme/demo.git']);
 const gitBin=cp.execFileSync('which',['git'],{encoding:'utf8'}).trim(),log=path.join(top,'git-commands.jsonl');
 const wrapper=`#!${process.execPath}\nconst cp=require('node:child_process'),fs=require('node:fs');let args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');if(args.includes('fetch')){const n=args.lastIndexOf('origin');if(n<0)process.exit(99);args[n]=${JSON.stringify(remote)};}const r=cp.spawnSync(${JSON.stringify(gitBin)},args,{stdio:'inherit',env:process.env});process.exit(r.status??1);`;
 fs.writeFileSync(path.join(bin,'git'),wrapper,{mode:0o700});
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH};
 const scope={provider:'codex',connection_id:null,working_folder:root,repository_url:'https://github.com/acme/demo.git',base_branch:'main',base_sha:base,task_branch:'ains/task/task1',task_id:'task1'};
 const run=(phase,current=scope,cwd=phase==='preflight'?root:D.normalizeSdkExecutionContext(current).task_working_folder)=>{const command=D.buildSdkExecutionCommands(current)[phase];const result=cp.spawnSync('/bin/sh',['-c',command],{cwd,env,encoding:'utf8',timeout:60000});return {...result,read:()=>JSON.parse(result.stdout)};};
 return {fs,path,git,root,remote,top,base,scope,run,log};
}

test('real SDK guard fetches exact remote base, isolates task edits and captures tracked/untracked diff',t=>{
 const f=sdkRepo(t),publish=f.path.join(f.top,'publisher');f.git(['clone',f.remote,publish],f.top);f.git(['config','user.name','SDK test'],publish);f.git(['config','user.email','sdk@example.test'],publish);f.fs.writeFileSync(f.path.join(publish,'new-base.txt'),'fresh\n');f.git(['add','.'],publish);f.git(['commit','-m','remote advances'],publish);f.git(['push','origin','main'],publish);f.scope.base_sha=f.git(['rev-parse','HEAD'],publish);
 const prepared=f.run('preflight');assert.equal(prepared.status,0,prepared.stderr);const receipt=prepared.read();assert.equal(receipt.head_sha,f.scope.base_sha);assert.equal(f.git(['rev-parse','refs/heads/main']),f.base,'local main remains untouched');assert.equal(f.git(['symbolic-ref','--short','HEAD']),'main');
 const task=receipt.task_working_folder;f.fs.writeFileSync(f.path.join(task,'source.txt'),'implemented\n');f.fs.writeFileSync(f.path.join(task,'new-file.txt'),'new file\n');
 const post=f.run('postflight');assert.equal(post.status,0,post.stderr);const result=post.read();assert.deepEqual(result.changed_files,['new-file.txt','source.txt']);assert.match(result.patch,/\+implemented/);assert.match(result.patch,/\+new file/);assert.equal(result.worktree_clean,false);assert.equal(result.patch_sha256,require('node:crypto').createHash('sha256').update(result.patch).digest('hex'));assert.equal(f.fs.readFileSync(f.path.join(f.root,'source.txt'),'utf8'),'base\n');
 assert.equal(f.run('preflight').status,1,'never replay onto existing task worktree');
 const fetch=f.fs.readFileSync(f.log,'utf8').trim().split('\n').map(JSON.parse).find(args=>args.includes('fetch'));assert.deepEqual(fetch.slice(fetch.indexOf('fetch')),['fetch','--no-tags','--no-recurse-submodules','--','origin','refs/heads/main']);
});

test('real SDK guard rejects dirty root, wrong cwd, wrong remote/base and task branch escape',t=>{
 const f=sdkRepo(t);f.fs.writeFileSync(f.path.join(f.root,'source.txt'),'existing human edits\n');assert.match(f.run('preflight').stderr,/NORA_SDK_DIRTY_CHECKOUT/);f.fs.writeFileSync(f.path.join(f.root,'source.txt'),'base\n');
 assert.match(f.run('preflight',f.scope,f.top).stderr,/NORA_SDK_CWD_MISMATCH/);
 assert.match(f.run('preflight',{...f.scope,repository_url:'https://github.com/other/repo.git'}).stderr,/NORA_SDK_REPOSITORY_SCOPE_MISMATCH/);
 assert.match(f.run('preflight',{...f.scope,base_sha:'b'.repeat(40)}).stderr,/NORA_SDK_BASE_CHANGED/);
 f.git(['remote','set-url','--push','origin','https://github.com/other/repo.git']);assert.match(f.run('preflight').stderr,/NORA_SDK_REPOSITORY_SCOPE_MISMATCH/);f.git(['config','--unset-all','remote.origin.pushurl']);
 const ready=f.run('preflight');assert.equal(ready.status,0,ready.stderr);const task=ready.read().task_working_folder;f.git(['switch','-c','wrong-branch'],task);assert.match(f.run('postflight').stderr,/NORA_SDK_WORKTREE_SCOPE_MISMATCH/);
});

test('SDK postflight rejects sensitive paths, symlinks and root checkout changes before emitting content',t=>{
 const f=sdkRepo(t),ready=f.run('preflight');assert.equal(ready.status,0,ready.stderr);const task=ready.read().task_working_folder;
 for(const name of ['.env','auth.json','credentials-test.json','id_rsa','한글.txt']){
  const file=f.path.join(task,name);f.fs.writeFileSync(file,'PRIVATE_FIXTURE_MARKER\n');const rejected=f.run('postflight');assert.equal(rejected.status,1);assert.match(rejected.stderr,/NORA_SDK_CHANGED_FILES_INVALID/);assert.equal(rejected.stdout,'');f.fs.unlinkSync(file);
 }
 const link=f.path.join(task,'dangling.txt');f.fs.symlinkSync('missing-target',link);assert.match(f.run('postflight').stderr,/NORA_SDK_CHANGED_FILES_INVALID/);f.fs.unlinkSync(link);
 f.fs.writeFileSync(f.path.join(f.root,'source.txt'),'root changed\n');assert.match(f.run('postflight').stderr,/NORA_SDK_ROOT_CHECKOUT_CHANGED/);
 f.git(['add','source.txt']);f.git(['commit','-m','unexpected root commit']);const committed=f.run('postflight');assert.equal(committed.status,1);assert.match(committed.stderr,/NORA_SDK_ROOT_CHECKOUT_CHANGED/);assert.equal(committed.stdout,'');
});

test('v3 feedback schema keeps verified Git commit evidence without pretending there is a PR',()=>{
 const v3=require('../nora/task-automation/risk-flow-v3'),Ajv=require('ajv');
 const schema=v3.REQUEST_SCHEMA.properties.feedback.anyOf[0].properties.original_task.anyOf[0].properties.artifact,validate=new Ajv({strict:true}).compile(schema);
 const artifact={kind:'git_commit',head_sha:'b'.repeat(40),base_sha:'a'.repeat(40),target_branch:'main',preview_url:null};assert.equal(validate(artifact),true);assert.equal(validate({...artifact,preview_url:'https://preview.example'}),true);
 for(const change of [{head_sha:'invalid'},{target_branch:''},{pr_number:1},{kind:'local_patch'}])assert.equal(validate({...artifact,...change}),false);
});
