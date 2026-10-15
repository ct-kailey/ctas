'use strict';
const {createDomainGuide}=require('./domain-guide');
function mountDomainGuideRoutes(router,{pool,provider={},write,review,owner,renderPdf}){
  const service=createDomainGuide({pool,provider});
  const args=req=>({projectId:req.params.p,userId:req.user.id});
  router.get('/domain-guide',async(req,res)=>res.json(await service.overview(args(req))));
  router.get('/domain-guide/versions/:id',async(req,res)=>res.json(await service.getVersion({...args(req),versionId:req.params.id})));
  router.post('/domain-guide/refresh',write,async(req,res)=>res.status(202).json(await service.requestRefresh({...args(req),enableAuto:req.body?.enable_auto})));
  router.put('/domain-guide/settings',owner,async(req,res)=>res.json(await service.updateSettings({...args(req),autoRefresh:req.body?.auto_refresh})));
  router.post('/domain-guide/versions/:id/review',review,async(req,res)=>res.json(await service.review({...args(req),versionId:req.params.id,decision:req.body?.decision,comment:req.body?.comment})));
  router.post('/domain-guide/runs/:id/retry',review,async(req,res)=>res.status(202).json(await service.retry({...args(req),runId:req.params.id,acknowledge:req.body?.acknowledge,reason:req.body?.reason})));
  router.get('/domain-guide/versions/:id/pdf',async(req,res)=>{
    // Reuse the authorized service path; a guessed version UUID must never expose
    // another project's source text through the downloadable artifact.
    const data=await service.getVersion({...args(req),versionId:req.params.id});
    const render=renderPdf||require('./domain-guide-pdf').renderDomainGuidePdf;
    const pdf=await render(data);
    res.set('Cache-Control','private, no-store');
    res.set('Content-Type','application/pdf');
    res.set('Content-Disposition',`attachment; filename="domain-guide-v${data.version.number}.pdf"`);
    res.send(pdf);
  });
  return service;
}
module.exports={mountDomainGuideRoutes};
