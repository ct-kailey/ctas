'use strict';
const {createProjectNora}=require('./project-nora');

function mountProjectNoraRoutes(router,{pool,owner,provider={},oauth,git,tasks}){
  const service=createProjectNora({pool,provider});
  router.get('/nora-workspace',async(req,res)=>res.json({workspace:await service.status(req.params.p,req.user.id)}));
  router.post('/nora-workspace',owner,async(req,res)=>res.status(202).json({workspace:await service.attach(req.params.p,req.user.id,req.body)}));
  for(const [path,method] of [['retry','retry'],['reconcile','reconcile'],['retry-sync','retrySync']])
    router.post('/nora-workspace/'+path,owner,async(req,res)=>res.status(202).json({workspace:await service[method](req.params.p,req.user.id,req.body)}));
  router.get('/nora-workspace/connectors',async(req,res)=>res.json(await service.connectors(req.params.p,req.user.id)));
  router.put('/nora-workspace/connector',owner,async(req,res)=>res.json({workspace:await service.selectConnector(req.params.p,req.user.id,req.body)}));
  router.get('/nora-workspace/authorization',async(req,res)=>res.json({authorization:oauth?await oauth.status(req.params.p,req.user.id):{connected:false,can_connect:false,error_code:'NORA_AUTH_UNAVAILABLE'}}));
  router.post('/nora-workspace/authorize',owner,async(req,res)=>{
    if(!oauth)throw Object.assign(new Error('Nora 계정 연결 설정이 필요합니다.'),{code:'NORA_AUTH_UNAVAILABLE',status:503});
    res.json(await oauth.start(req.params.p,req.user.id));
  });
  if(git)router.get('/nora-workspace/git/history',async(req,res)=>res.json(await git.history(req.params.p,req.user.id)));
  if(tasks)router.get('/nora-workspace/flows',owner,async(req,res)=>{const workspace=await service.status(req.params.p,req.user.id);res.json(await tasks.listFlows({projectId:req.params.p,workspaceId:workspace.workspace_id}));});
  return service;
}
module.exports={mountProjectNoraRoutes};
