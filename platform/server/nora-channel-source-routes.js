'use strict';
const express=require('express');
const {createNoraChannelSources}=require('./nora-channel-sources');
function mountNoraChannelSourceRoutes(router,{pool,provider,review,appOrigin}){
 const service=createNoraChannelSources({pool,provider,appOrigin});
 router.get('/nora-channel-sources',async(req,res)=>res.json(await service.list(req.params.p,req.user.id)));
 router.get('/nora-channel-connectors',review,async(req,res)=>res.json(await service.connectors(req.params.p,req.user.id)));
 router.post('/nora-channel-sources',review,async(req,res)=>res.status(201).json({source:await service.create(req.params.p,req.user.id,req.body)}));
 router.patch('/nora-channel-sources/:id',review,async(req,res)=>res.json({source:await service.update(req.params.p,req.params.id,req.user.id,req.body)}));
 router.post('/nora-channel-sources/:id/provision',review,async(req,res)=>res.json({source:await service.provision(req.params.p,req.params.id,req.user.id,req.body)}));
 router.post('/nora-channel-sources/:id/run',review,async(req,res)=>res.status(202).json(await service.run(req.params.p,req.params.id,req.user.id,req.body)));
 router.get('/nora-channel-sources/:id/deliveries',async(req,res)=>res.json(await service.deliveries(req.params.p,req.params.id,req.user.id)));
 router.post('/nora-channel-sources/:id/trigger-key',review,async(req,res)=>res.json(await service.rotateTriggerKey(req.params.p,req.params.id,req.user.id)));
}
function mountNoraChannelTrigger(app,{pool,provider,appOrigin}){
 const service=createNoraChannelSources({pool,provider,appOrigin});
 app.post('/api/nora-channel-trigger/:id',express.json({limit:'4kb'}),async(req,res)=>{const auth=req.headers.authorization||'';if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(auth)){res.status(403).json({code:'FORBIDDEN',message:'이벤트 연결 키를 확인하세요.'});return;}res.status(202).json(await service.trigger(req.params.id,auth.slice(7),req.body));});
}
module.exports={mountNoraChannelSourceRoutes,mountNoraChannelTrigger};
