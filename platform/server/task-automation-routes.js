'use strict';
const {createTaskAutomation}=require('./task-automation');
function mountTaskAutomationRoutes(router,{pool,write,review,owner,provider={}}){
  const service=createTaskAutomation({pool,provider});
  router.get('/task-automation',async(req,res)=>res.json(await service.overview(req.params.p,req.user.id)));
  router.post('/task-automation/analyze',write,async(req,res)=>res.status(202).json({analysis:await service.analyze(req.params.p,req.user.id,req.body)}));
  router.put('/task-automation/settings',owner,async(req,res)=>res.json({settings:await service.saveSettings(req.params.p,req.user.id,req.body)}));
  router.get('/task-automation/tasks/:id',async(req,res)=>res.json({task:await service.getTask(req.params.p,req.user.id,req.params.id)}));
  router.patch('/task-automation/tasks/:id',write,async(req,res)=>res.status(202).json({task:await service.transition(req.params.p,req.user.id,req.params.id,req.body)}));
  router.post('/task-automation/tasks/:id/approve-merge',review,async(req,res)=>res.status(202).json({task:await service.approveMerge(req.params.p,req.user.id,req.params.id,req.body)}));
  router.post('/task-automation/tasks/:id/reconcile-merge',review,async(req,res)=>res.status(202).json({task:await service.reconcileMerge(req.params.p,req.user.id,req.params.id,req.body)}));
  return service;
}
module.exports={mountTaskAutomationRoutes};
