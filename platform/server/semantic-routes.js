'use strict';
function mountSemanticRoutes(router,{service,review}) {
 router.get('/context/semantic/status',async(req,res)=>res.json(await service.status(req.params.p,req.user.id)));
 router.get('/context/semantic/search',async(req,res)=>res.json(await service.search(req.params.p,req.user.id,req.query)));
 router.post('/context/semantic/index',review,async(req,res)=>res.json(await service.rebuild(req.params.p,req.user.id,req.body||{})));
}
module.exports={mountSemanticRoutes};
