'use strict';
const express=require('express');
const {createIntegrationLedger}=require('./integration-ledger');
function mountIntegrationRoutes(router,{pool,review,encryptionKey,fetchImpl}){
 const ledger=createIntegrationLedger(pool,{encryptionKey,fetchImpl});
 router.get('/integrations',async(req,res)=>res.json(await ledger.list(req.params.p,req.user.id)));
 router.post('/integrations',review,async(req,res)=>res.status(201).json({integration:await ledger.create(req.params.p,req.user.id,req.body)}));
 router.patch('/integrations/:id',review,async(req,res)=>res.json({integration:await ledger.update(req.params.p,req.params.id,req.user.id,req.body)}));
 router.post('/integrations/:id/test',review,async(req,res)=>res.json(await ledger.test(req.params.p,req.params.id,req.user.id)));
 router.post('/integrations/:id/sync',review,async(req,res)=>res.status(202).json(await ledger.sync(req.params.p,req.params.id,req.user.id)));
 router.get('/integrations/:id/runs',async(req,res)=>res.json(await ledger.runs(req.params.p,req.params.id,req.user.id)));
 router.post('/integrations/:id/search',review,async(req,res)=>res.json(await ledger.search(req.params.p,req.params.id,req.user.id,req.body.query)));
 router.post('/integrations/:id/import',review,async(req,res)=>res.status(201).json({inbox:await ledger.import(req.params.p,req.params.id,req.user.id,req.body)}));
 return ledger;
}
// Mount before cookie/session CSRF middleware. This route uses its own scoped bearer token.
function mountIntegrationBridge(app,{pool,encryptionKey,fetchImpl}){
 const ledger=createIntegrationLedger(pool,{encryptionKey,fetchImpl});
 app.post('/api/integration-bridge/:id',express.json({limit:'128kb'}),async(req,res,next)=>{try{const value=req.headers.authorization||'';if(!value.startsWith('Bearer ')){res.status(403).json({code:'FORBIDDEN',message:'브리지 인증에 실패했습니다.'});return;}const inbox=await ledger.bridge(req.params.id,value.slice(7),req.body);res.status(201).json({inbox_id:inbox.id,replayed:inbox.replayed});}catch(e){next(e);}});
}
module.exports={mountIntegrationRoutes,mountIntegrationBridge};
