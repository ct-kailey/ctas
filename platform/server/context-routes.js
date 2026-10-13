'use strict';
const {createContextLedger}=require('./context-ledger');
function mountContextRoutes(router,{pool,write,review}){
 const ledger=createContextLedger(pool);
 router.get('/context',async(req,res)=>res.json(await ledger.overview(req.params.p,req.user.id)));
 router.get('/context/sources',async(req,res)=>res.json(await ledger.sources(req.params.p,req.user.id,req.query)));
 router.get('/context/sources/:type/:id',async(req,res)=>res.json({source:await ledger.getSource(req.params.p,req.user.id,req.params.type,req.params.id)}));
 router.get('/context/search',async(req,res)=>res.json(await ledger.search(req.params.p,req.user.id,req.query)));
 router.get('/context/timeline',async(req,res)=>res.json(await ledger.timeline(req.params.p,req.user.id,req.query)));
 router.get('/context/records/:id',async(req,res)=>res.json({record:await ledger.getRecord(req.params.p,req.params.id,req.user.id)}));
 router.get('/context/candidates/:id',async(req,res)=>res.json({candidate:await ledger.getCandidate(req.params.p,req.params.id,req.user.id)}));
 router.post('/context/knowledge/import',write,async(req,res)=>res.status(201).json({candidate:await ledger.importKnowledge(req.params.p,req.user.id,req.body)}));
 router.post('/context/candidates',write,async(req,res)=>res.status(201).json({candidate:await ledger.createCandidate(req.params.p,req.user.id,req.body)}));
 router.post('/context/candidates/:id/revisions',write,async(req,res)=>res.status(201).json({candidate:await ledger.reviseCandidate(req.params.p,req.params.id,req.user.id,req.body)}));
 router.post('/context/candidates/:id/decision',review,async(req,res)=>res.json(await ledger.decideCandidate(req.params.p,req.params.id,req.user.id,req.body)));
}
module.exports={mountContextRoutes};
