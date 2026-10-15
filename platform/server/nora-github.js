'use strict';
const {binding,fail}=require('./project-nora');
const {membership}=require('./context-ledger');
const {repositoryCoordinates}=require('./repository-check');
const SHA=/^[a-f0-9]{40}$/;

/** Every operation is scoped to the persisted workspace, connector and repository.
 * No GitHub PAT fallback and no caller-supplied operation/URL are accepted. */
function createNoraGitHub({pool,provider={}}){
  async function snapshot(p){
    const row=await binding(pool,p);
    if(!row)fail('NORA_WORKSPACE_REQUIRED','프로젝트의 Nora 워크스페이스를 먼저 연결하세요.');
    if(row.status!=='ready')fail('NORA_WORKSPACE_NOT_READY','Nora 계정 연결과 워크스페이스 확인을 완료하세요.');
    if(!row.connector_id)fail('NORA_GITHUB_CONNECTOR_REQUIRED','Nora 워크스페이스의 GitHub 커넥터를 선택하세요.');
    if(typeof provider.callTool!=='function')fail('NORA_SERVICE_UNAVAILABLE','Nora 연결 서비스를 사용할 수 없습니다.',503);
    const settings=(await pool.query('SELECT * FROM project_settings WHERE project_id=$1',[p])).rows[0];
    const repo=repositoryCoordinates(settings.repository_url),fullName=repo.owner+'/'+repo.repo;
    const connector=await provider.callTool({projectId:p,workspaceId:row.workspace_id,name:'get_connector',arguments:{connectorId:row.connector_id}});
    if(connector?.id!==row.connector_id||connector.provider!=='github'||connector.enabled===false||connector.disabled===true||!Array.isArray(connector.operations))fail('NORA_GITHUB_CONNECTOR_INVALID','선택한 GitHub 커넥터의 설정을 확인하세요.');
    if(connector.workspaceId&&connector.workspaceId!==row.workspace_id||connector.tenantId&&connector.tenantId!==row.workspace_id)fail('NORA_CONNECTOR_SCOPE_MISMATCH','다른 워크스페이스의 커넥터입니다.');
    const configured=connector.config?.defaultRepo;
    let normalized;
    try{normalized=typeof configured==='string'&&configured.startsWith('https://')?repositoryCoordinates(configured):repositoryCoordinates('https://github.com/'+configured);}catch{fail('NORA_GITHUB_REPOSITORY_MISMATCH','Nora GitHub 커넥터에 이 프로젝트의 저장소를 지정하세요.');}
    if((normalized.owner+'/'+normalized.repo).toLowerCase()!==fullName.toLowerCase())fail('NORA_GITHUB_REPOSITORY_MISMATCH','Nora GitHub 커넥터의 저장소와 프로젝트 대상 저장소가 다릅니다.');
    const operations=new Map(connector.operations.map(op=>[op.id,op]));
    return{projectId:p,row,settings,repo,fullName,operations};
  }
  async function unchanged(s){
    const current=await binding(pool,s.projectId);
    const config=(await pool.query('SELECT version FROM project_settings WHERE project_id=$1',[s.projectId])).rows[0];
    if(current?.version!==s.row.version||current.workspace_id!==s.row.workspace_id||current.connector_id!==s.row.connector_id||current.status!=='ready'||Number(config?.version)!==Number(s.settings.version))fail('NORA_GITHUB_SETTINGS_CHANGED','조회 중 워크스페이스·커넥터 또는 저장소 설정이 변경되었습니다. 다시 확인하세요.');
  }
  async function invoke(s,operation,args,required=[]){
    const definition=s.operations.get(operation);
    if(!definition||!Array.isArray(definition.params)||['repo',...required].some(param=>!definition.params.includes(param)))fail('NORA_GITHUB_OPERATIONS_UNAVAILABLE','Nora GitHub 커넥터가 이 작업에 필요한 기능을 아직 제공하지 않습니다.');
    await unchanged(s);
    return provider.callTool({projectId:s.projectId,workspaceId:s.row.workspace_id,name:'invoke_connector',arguments:{connectorId:s.row.connector_id,operation,args:{...args,repo:s.fullName}}});
  }
  async function head(s){
    const branch=s.settings.base_branch;
    if(typeof branch!=='string'||!branch||branch.length>200||/[\x00-\x20~^:?*\[\\]|\.\.|@\{|\.lock(?:\/|$)/.test(branch)||branch.startsWith('-'))fail('NORA_GITHUB_BRANCH_INVALID','프로젝트의 기본 브랜치를 확인하세요.');
    // Fully qualify a branch so a tag of the same name cannot pass verification.
    const commits=await invoke(s,'list_commits',{branch:'refs/heads/'+branch,per_page:1},['branch','per_page']);
    if(!Array.isArray(commits)||!commits.length||!SHA.test(commits[0]?.sha||''))fail('NORA_GITHUB_BRANCH_UNVERIFIED','설정한 기본 브랜치의 커밋을 확인할 수 없습니다.');
    const result=commits[0];
    if(result.html_url!==`https://github.com/${s.fullName}/commit/${result.sha}`)fail('NORA_GITHUB_REPOSITORY_MISMATCH','커밋의 저장소가 프로젝트 설정과 다릅니다.');
    await unchanged(s);return result.sha;
  }
  return{
    snapshot,invoke,head,unchanged,
    async verify(p){const s=await snapshot(p),sha=await head(s);return{checked:{status:'ready',head_sha:sha,checked_at:new Date().toISOString(),reason_code:null,credential_source:'nora'},binding:s.row};},
    async history(p,u){
      await membership(pool,p,u);const s=await snapshot(p);
      const commits=await invoke(s,'list_commits',{branch:'refs/heads/'+s.settings.base_branch,per_page:10},['branch','per_page']);
      if(!Array.isArray(commits)||commits.length>100)fail('NORA_GITHUB_RESPONSE_INVALID','Git 이력의 형식을 확인할 수 없습니다.',502);
      const safe=commits.map(c=>{
        if(!SHA.test(c?.sha||'')||c.html_url!==`https://github.com/${s.fullName}/commit/${c.sha}`)fail('NORA_GITHUB_REPOSITORY_MISMATCH','다른 저장소의 이력이 반환되었습니다.',502);
        return{sha:c.sha,url:c.html_url,message:String(c.commit?.message||'').slice(0,3000),author:String(c.commit?.author?.name||'').slice(0,200),created_at:c.commit?.author?.date||null};
      });
      await unchanged(s);return{workspace_id:s.row.workspace_id,repository_url:s.repo.url,base_branch:s.settings.base_branch,commits:safe};
    },
  };
}
module.exports={createNoraGitHub};
