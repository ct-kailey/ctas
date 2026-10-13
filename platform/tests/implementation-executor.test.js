'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {executeCheckout,validateClaim,validPath,hash,run}=require('../../scripts/run-implementation');
test('executor rejects changed snapshots and unsafe patch paths',()=>{
 for(const value of ['../secret','/etc/passwd','.git/config','a/../b','a\\b',''])assert.equal(validPath(value),false);
 assert.equal(validPath('src/task.js'),true);
 assert.throws(()=>validateClaim({request_id:'x',input_snapshot:{request_id:'x'},input_sha256:'bad'},'x'),{code:'EXECUTION_AUTHORIZATION_INVALID'});
 const s={request_id:'x',approval:{decision:'approved'},acknowledge_code_execution:true,plan_input:{},plan_result:{},plan_input_sha256:'wrong'};
 assert.throws(()=>validateClaim({request_id:'x',input_snapshot:s,input_sha256:hash(s)},'x'),{code:'EXECUTION_PLAN_HASH_MISMATCH'});
});
test('executor includes already staged edits and produces a real checked patch without commits',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ains-executor-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source');await fs.mkdir(source);
 async function git(args,cwd=source){const r=await run('git',args,{cwd,env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});assert.equal(r.code,0,r.stderr);return r.stdout.trim();}
 await git(['init','-b','main']);await fs.writeFile(path.join(source,'policy.js'),'module.exports = 5;\n');await git(['add','.']);await git(['-c','user.name=QA','-c','user.email=qa@example.test','commit','-m','Synthetic fixture']);
 const head=await git(['rev-parse','HEAD']);
 const s={repository:{url:'https://github.com/example/synthetic.git',base_branch:'main',head_sha:head},plan_input:{project:{name:'Synthetic',goal:'Change policy'},sources:[]},plan_result:{tasks:[{title:'Change to 50'}]}};
 const result=await executeCheckout(s,dir,{codexBin:'synthetic-codex',runImpl:async(command,args,options)=>{
  if(command==='git'&&args[0]==='clone'){const next=[...args];next[next.length-2]=source;return run(command,next,options);}
  if(command==='synthetic-codex'){
   await fs.writeFile(path.join(options.cwd,'policy.js'),'module.exports = 50;\n');await git(['add','policy.js'],options.cwd);
   await fs.writeFile(args[args.indexOf('--output-last-message')+1],JSON.stringify({summary:'Policy changed',reported_checks:['Synthetic test'],limitations:[]}));
   options.onLine(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'node --test',exit_code:0}}));return {code:0,stdout:'',stderr:''};
  }
  return run(command,args,options);
 }});
 assert.deepEqual(result.changed_files,['policy.js']);assert.match(result.patch,/\+module.exports = 50/);assert.equal(result.observed_commands[0].exit_code,0);assert.equal(await git(['rev-parse','HEAD'],path.join(dir,'checkout')),head);assert.equal(await git(['remote'],path.join(dir,'checkout')),'');
});
