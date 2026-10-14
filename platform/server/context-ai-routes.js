'use strict';
const express=require('express');
const {createContextAI,secretMatches}=require('./context-ai-ledger');
const {confirmContextAnalysis}=require('./context-confirmation');
function mountContextAIWebhook(app,{pool,contextAI={}}){const ledger=createContextAI({pool,enabled:contextAI.enabled,client:contextAI.client});
 // Capability route is server-to-server only, mounted before cookie/Origin middleware.
 app.post('/api/nora-context-approvals/:secret',(req,res,next)=>secretMatches(req.params.secret,contextAI.webhookSecret)?next():res.status(404).json({error:{code:'NOT_FOUND',message:'Not found'}}),express.json({limit:'1mb'}),async(req,res)=>res.json(await ledger.receiveWebhook(req.body)));
}
function mountContextAIRoutes(router,{pool,write,review,contextAI={}}){const ledger=createContextAI({pool,enabled:contextAI.enabled,client:contextAI.client});
 router.get('/context/ai-runs',async(req,res)=>res.json(await ledger.list(req.params.p,req.user.id)));
 router.get('/context/ai-runs/:id',async(req,res)=>res.json({run:await ledger.get(req.params.p,req.params.id,req.user.id)}));
 router.post('/context/ai-runs',write,async(req,res)=>res.status(202).json({run:await ledger.create(req.params.p,req.user.id,req.body)}));
 router.post('/context/ai-runs/:id/decision',review,async(req,res)=>res.json({run:await ledger.decide(req.params.p,req.params.id,req.user.id,req.body)}));
 router.post('/context/ai-runs/:id/import',review,async(req,res)=>res.status(201).json(await ledger.importItem(req.params.p,req.params.id,req.user.id,req.body)));
 router.post('/context/ai-runs/:id/confirm',review,async(req,res)=>res.json(await confirmContextAnalysis(pool,req.params.p,req.params.id,req.user.id,req.body)));
}
module.exports={mountContextAIWebhook,mountContextAIRoutes};
