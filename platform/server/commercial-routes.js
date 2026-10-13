'use strict';
const { createCommercialLedger } = require('./commercial-ledger');
const { exportCommercial } = require('./commercial-export');
const { error } = require('./auth');

function mountCommercialRoutes(router, { pool, write, review }) {
  const ledger = createCommercialLedger(pool);
  let exporting = 0;
  router.get('/commercial', async (req,res) => res.json(await ledger.overview(req.params.p,req.user.id)));
  router.patch('/commercial/profile', write, async (req,res) => res.json({profile:await ledger.saveProfile(req.params.p,req.user.id,req.body)}));
  router.get('/commercial/template-library', async (req,res) => res.json(await ledger.listReusableTemplates(req.params.p,req.user.id)));
  router.post('/commercial/templates', review, async (req,res) => res.status(201).json({template:await ledger.createTemplate(req.params.p,req.user.id,req.body)}));
  router.post('/commercial/documents', write, async (req,res) => res.status(201).json({document:await ledger.createDocument(req.params.p,req.user.id,req.body)}));
  router.get('/commercial/documents/:id', async (req,res) => res.json({document:await ledger.getDocument(req.params.p,req.params.id,req.user.id)}));
  router.post('/commercial/documents/:id/revisions', write, async (req,res) => res.status(201).json({document:await ledger.saveRevision(req.params.p,req.params.id,req.user.id,req.body)}));
  router.post('/commercial/documents/:id/revisions/:r/decision', review, async (req,res) => res.json({document:await ledger.decideRevision(req.params.p,req.params.id,req.params.r,req.user.id,req.body)}));
  router.post('/commercial/documents/:id/rewrites', write, async (req,res) => res.status(202).json({rewrite:await ledger.requestRewrite(req.params.p,req.params.id,req.user.id,req.body)}));
  router.get('/commercial/rewrites/:id', async (req,res) => res.json({rewrite:await ledger.getRewrite(req.params.p,req.params.id,req.user.id)}));
  router.post('/commercial/rewrites/:id/apply', write, async (req,res) => res.json({document:await ledger.applyRewrite(req.params.p,req.params.id,req.user.id,req.body)}));
  router.post('/commercial/feedback', write, async (req,res) => res.status(201).json({feedback:await ledger.recordFeedback(req.params.p,req.user.id,req.body)}));
  router.post('/commercial/feedback/:id/answer', write, async (req,res) => res.json({feedback:await ledger.answerFeedback(req.params.p,req.params.id,req.user.id,req.body)}));
  router.post('/commercial/stage', review, async (req,res) => res.json({profile:await ledger.setStage(req.params.p,req.user.id,req.body)}));
  router.get('/commercial/documents/:id/revisions/:r/export', async (req,res) => {
    const format=req.query.format;
    if(!['docx','pdf'].includes(format)) throw error('INVALID_EXPORT_FORMAT','DOCX 또는 PDF를 선택하세요.',400);
    const data=await ledger.exportData(req.params.p,req.params.id,req.params.r,req.user.id);
    if(exporting>=2) throw error('EXPORT_BUSY','다른 문서를 출력 중입니다. 잠시 후 다시 시도해 주세요.',429);
    exporting++;
    try {
      const result=await exportCommercial(data,{format,python:process.env.PYTHON_BIN||'python3'});
      res.set('Content-Type',result.mime);
      res.set('Content-Disposition',`attachment; filename="ains-document.${format}"; filename*=UTF-8''${encodeURIComponent(result.filename).replace(/'/g,'%27')}`);
      res.send(result.buffer);
    } finally { exporting--; }
  });
}
module.exports={mountCommercialRoutes};
