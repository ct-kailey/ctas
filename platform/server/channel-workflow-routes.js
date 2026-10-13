'use strict';
const {createChannelWorkflowService}=require('./channel-workflow');
function mountChannelWorkflowRoutes(router,{pool,review}){
 const service=createChannelWorkflowService(pool);
 router.get('/channel-inbox/:id/workflow',async(req,res)=>res.json(await service.preview(req.params.p,req.user.id,req.params.id,req.query)));
 router.post('/channel-inbox/:id/workflow/classification',review,async(req,res)=>res.status(201).json(await service.classify(req.params.p,req.user.id,req.params.id,req.body)));
 router.post('/channel-inbox/:id/workflow/answer',review,async(req,res)=>res.status(201).json(await service.answer(req.params.p,req.user.id,req.params.id,req.body)));
 return service;
}
module.exports={mountChannelWorkflowRoutes};
