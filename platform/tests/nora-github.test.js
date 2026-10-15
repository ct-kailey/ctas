'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createNoraGitHub}=require('../server/nora-github');
const SHA='a'.repeat(40),PROJECT='project-a',USER='b013b1fe-9271-44d5-8a40-ae98d789ee9e',REPO='acme/project-a';
const WEB=`https://github.com/${REPO}/commit/${SHA}`,API=`https://api.github.com/repos/${REPO}/commits/${SHA}`;
function setup(commits){
  const row={project_id:PROJECT,workspace_id:'t_project123',status:'ready',connector_id:'github-a',version:1},settings={version:2,repository_url:'https://github.com/'+REPO+'.git',base_branch:'main'};
  const calls=[],pool={async query(sql,args){assert.equal(args[0],PROJECT);if(sql.includes('FROM project_nora_workspaces'))return{rows:[{...row}]};if(sql.includes('FROM project_settings'))return{rows:[{...settings}]};if(sql.includes('FROM memberships'))return{rows:[{role:'owner'}]};throw Error(sql);}};
  const provider={async callTool(input){calls.push(input);assert.equal(input.projectId,PROJECT);assert.equal(input.workspaceId,row.workspace_id);if(input.name==='get_connector')return{id:row.connector_id,provider:'github',config:{defaultRepo:REPO},operations:[{id:'list_commits',params:['repo','branch','per_page']}]};assert.equal(input.name,'invoke_connector');assert.equal(input.arguments.connectorId,row.connector_id);assert.equal(input.arguments.operation,'list_commits');assert.equal(input.arguments.args.repo,REPO);assert.equal(input.arguments.args.branch,'refs/heads/main');return commits;}};
  return{git:createNoraGitHub({pool,provider}),calls,row,settings};
}
test('Nora Git accepts normalized commits for branch verification and history',async()=>{
  const {git,calls}=setup([{sha:SHA,url:WEB,message:'정규화된 커밋',author:'작성자',date:'2026-10-15T03:00:00Z'}]);
  assert.equal((await git.verify(PROJECT)).checked.head_sha,SHA);
  assert.deepEqual((await git.history(PROJECT,USER)).commits,[{sha:SHA,url:WEB,message:'정규화된 커밋',author:'작성자',created_at:'2026-10-15T03:00:00Z'}]);
  assert.deepEqual(calls.filter(c=>c.name==='invoke_connector').map(c=>c.arguments.args.per_page),[1,10]);
});
test('Nora Git preserves raw GitHub and matching dual URL responses',async()=>{
  for(const extra of [{},{url:WEB},{url:API}]){
    const {git}=setup([{sha:SHA,html_url:WEB,...extra,commit:{message:'raw message',author:{name:'raw author',date:'2026-10-15T04:00:00Z'}}}]);
    assert.equal((await git.verify(PROJECT)).checked.head_sha,SHA);
    assert.deepEqual((await git.history(PROJECT,USER)).commits,[{sha:SHA,url:WEB,message:'raw message',author:'raw author',created_at:'2026-10-15T04:00:00Z'}]);
  }
});
test('Nora Git rejects every conflicting or noncanonical repository URL, even if another URL is valid',async()=>{
  const foreign=WEB.replace('/acme/project-a/','/acme/project-b/');
  for(const commit of [
    {sha:SHA,url:foreign},{sha:SHA,html_url:foreign,url:WEB},{sha:SHA,html_url:WEB,url:foreign},
    {sha:SHA,html_url:WEB,url:API.replace('/acme/project-a/','/acme/project-b/')},
    {sha:SHA,url:WEB.replace(SHA,'b'.repeat(40))},{sha:SHA,html_url:WEB,url:API.replace(SHA,'b'.repeat(40))},
    {sha:SHA,url:WEB+'?x=1'},{sha:SHA,html_url:WEB,url:API+'#section'},
    {sha:SHA,url:API},{sha:SHA,html_url:null,url:WEB},{sha:SHA,html_url:WEB,url:null},
    {sha:SHA},{sha:'invalid',url:WEB},
  ]){
    const {git}=setup([commit]);
    await assert.rejects(git.verify(PROJECT),error=>['NORA_GITHUB_REPOSITORY_MISMATCH','NORA_GITHUB_BRANCH_UNVERIFIED'].includes(error.code),JSON.stringify(commit));
    await assert.rejects(git.history(PROJECT,USER),{code:'NORA_GITHUB_REPOSITORY_MISMATCH'});
  }
});
test('Nora Git history bounds normalized metadata and does not stringify malformed fields',async()=>{
  const {git}=setup([{sha:SHA,url:WEB,message:'m'.repeat(3100),author:'a'.repeat(210),date:'not-a-date'},{sha:SHA,url:WEB,message:{text:'not a string'},author:{name:'not a string'},date:{}}]);
  const {commits}=await git.history(PROJECT,USER);assert.equal(commits[0].message.length,3000);assert.equal(commits[0].author.length,200);assert.equal(commits[0].created_at,null);assert.equal(commits[1].message,'');assert.equal(commits[1].author,'');assert.equal(commits[1].created_at,null);
});
