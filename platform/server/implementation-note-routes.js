'use strict';
const { createImplementationNotes } = require('./implementation-notes');
function mountImplementationNoteRoutes(router, { pool, write, review, taskAutomation }) {
  const service = createImplementationNotes({ pool });
  router.get('/implementation-notes', async (req,res) => res.json(await service.list(req.params.p,req.user.id,req.query)));
  router.get('/implementation-notes/:id', async (req,res) => res.json(await service.get(req.params.p,req.user.id,req.params.id,req.query)));
  router.post('/implementation-notes', write, async (req,res) => res.status(201).json(await service.create(req.params.p,req.user.id,req.body)));
  router.post('/implementation-notes/:id/feedback', write, async (req,res) => res.json(await service.feedback(req.params.p,req.user.id,req.params.id,req.body)));
  router.post('/implementation-notes/:id/review', review, async (req,res) => res.json(await service.review(req.params.p,req.user.id,req.params.id,req.body)));
  router.post('/implementation-notes/:id/followup', write, async (req,res) => {
    if (!taskAutomation?.analyzeFeedback) throw Object.assign(new Error('후속 분석 서비스를 사용할 수 없습니다.'),{code:'IMPLEMENTATION_NOTE_FOLLOWUP_UNAVAILABLE',status:503});
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key=>!['request_id','expected_version'].includes(key))) throw Object.assign(new Error('후속 분석의 요청 ID와 기록 버전을 확인하세요.'),{code:'IMPLEMENTATION_NOTE_INPUT_INVALID',status:400});
    res.status(202).json({analysis:await taskAutomation.analyzeFeedback(req.params.p,req.user.id,{...req.body,note_id:req.params.id})});
  });
  return service;
}
module.exports = { mountImplementationNoteRoutes };
