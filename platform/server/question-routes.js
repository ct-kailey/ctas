'use strict';
const {createQuestionService}=require('./question-ledger');
const {createQuestionOutbound}=require('./question-outbound');
function mountQuestionRoutes(router,{pool,write,review,encryptionKey,fetchImpl,translationProvider}){
 const language=require('./question-language').createQuestionLanguageService(pool),translations=require('./question-translations').createQuestionTranslations({pool,provider:translationProvider});
 router.get('/question-language-settings',async(req,res)=>res.json(await language.get(req.params.p,req.user.id)));
 router.put('/question-language-settings',review,async(req,res)=>res.json(await language.save(req.params.p,req.user.id,req.body)));
 router.get('/questions/:id/translations',async(req,res)=>res.json(await translations.list(req.params.p,req.user.id,req.params.id)));
 router.post('/questions/:id/translations',write,async(req,res)=>res.status(201).json({translation:await translations.create(req.params.p,req.user.id,req.params.id,req.body)}));
 const service=createQuestionService(pool),outbound=createQuestionOutbound(pool,{encryptionKey,fetchImpl,translationProvider});
 router.get('/questions',async(req,res)=>res.json(await service.list(req.params.p,req.user.id,req.query)));
 router.post('/questions',write,async(req,res)=>res.status(201).json({question:await service.create(req.params.p,req.user.id,req.body)}));
 router.get('/questions/:id',async(req,res)=>res.json({question:await service.get(req.params.p,req.user.id,req.params.id)}));
 router.get('/questions/:id/result-response-draft',async(req,res)=>res.json(await require('./question-result-response').resultResponseDraft(pool,req.params.p,req.user.id,req.params.id,Number(req.query.expected_version))));
 router.patch('/questions/:id',review,async(req,res)=>res.json({question:await service.update(req.params.p,req.user.id,req.params.id,req.body)}));
 for(const [route,method,middleware] of [['asked','markAsked',write],['answer','answer',write],['resolve','resolve',review],['propose-context','propose',review]])router.post('/questions/:id/'+route,middleware,async(req,res)=>res.json({question:await service[method](req.params.p,req.user.id,req.params.id,req.body)}));
 router.post('/questions/:id/follow-up',review,async(req,res)=>{try{res.status(201).json({question:await service.followUp(req.params.p,req.user.id,req.params.id,req.body)});}catch(e){if(e.code==='QUESTION_FOLLOWUP_EXISTS')return res.status(409).json({error:{code:e.code,message:e.message,followup_id:e.followup_id}});throw e;}});
 router.get('/question-reminders',async(req,res)=>res.json(await service.reminders(req.params.p,req.user.id,req.sharedView?.link_id)));
 router.post('/question-reminders/refresh',write,async(req,res)=>res.json(await service.refresh(req.params.p,req.user.id)));
 router.post('/question-reminders/:id/acknowledge',write,async(req,res)=>res.json(await service.acknowledge(req.params.p,req.user.id,req.params.id)));
 router.get('/question-outbound',async(req,res)=>res.json(await outbound.settings(req.params.p,req.user.id)));
 router.put('/question-outbound/:provider',review,async(req,res)=>res.json({settings:await outbound.saveSettings(req.params.p,req.user.id,req.params.provider,req.body)}));
 router.get('/questions/:id/deliveries',async(req,res)=>res.json(await outbound.list(req.params.p,req.user.id,req.params.id)));
 router.post('/questions/:id/deliveries',write,async(req,res)=>res.status(201).json({delivery:await outbound.draft(req.params.p,req.user.id,req.params.id,req.body)}));
 for(const method of ['review','send','reconcile'])router.post('/question-deliveries/:id/'+method,review,async(req,res)=>res.json({delivery:await outbound[method](req.params.p,req.user.id,req.params.id,req.body)}));
 return service;
}
module.exports={mountQuestionRoutes};
